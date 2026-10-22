// 个人默认值（「记住」）的存储
//
// 为什么不是进程内 Map：该实例里任何插件市场安装/更新都会触发 worker respawn，内存态会静默归零，
// 而「记住」对用户是承诺。
// 为什么不是新表：这是连接器自己的偏好数据，不值得引入迁移；文件位置沿用 ConfigService 的目录约定
// （path.join(ctx.baseDir, 'data/media-luna/…')），写入用临时文件 + rename 保证原子性。

import * as fs from 'fs'
import * as path from 'path'
import type { Context } from 'koishi'
import { OVERRIDE_FIELDS, clearFields, stickySubset, type NovelAIChatOverrides } from './chat-params'

const STATE_VERSION = 1
const MAX_ENTRIES = 500
const TTL_MS = 30 * 24 * 60 * 60 * 1000
const SAVE_DEBOUNCE_MS = 500
/** 「估价已展示」标记的有效期：只管一轮流程，过期即视为没报过价 */
const ESTIMATE_MARK_TTL = 5 * 60 * 1000

interface StateEntry {
  overrides: NovelAIChatOverrides
  updatedAt: number
}

interface StateFile {
  version: number
  entries: Record<string, StateEntry>
}

export interface ChatStateScope {
  platform: string
  channelId: string
  userId: string
}

/** 作用域键：同群内各用户独立，换群不串台 */
export function chatStateKey(scope: ChatStateScope): string {
  return `${scope.platform}:${scope.channelId}:${scope.userId}`
}

export interface StateLogger {
  warn(message: string): void
  info(message: string): void
}

export class NovelAIChatState {
  private readonly _file: string
  private readonly _logger: StateLogger
  private readonly _entries = new Map<string, StateEntry>()
  /** 刚刚展示过估价的会话（生成前确认用，见 markEstimateShown） */
  private readonly _estimateShown = new Map<string, number>()
  private _saveTimer: NodeJS.Timeout | null = null

  constructor(ctx: Context, logger: StateLogger) {
    this._file = path.join(ctx.baseDir, 'data/media-luna/novelai-user-prefs.json')
    this._logger = logger
  }

  /** 启动时读盘；损坏或缺失都退化为空表，不让偏好数据拖垮插件 */
  load(): void {
    this._entries.clear()
    try {
      if (!fs.existsSync(this._file)) return
      const parsed: unknown = JSON.parse(fs.readFileSync(this._file, 'utf8'))
      if (!parsed || typeof parsed !== 'object' || !('entries' in parsed)) return
      const entries = parsed.entries
      if (!entries || typeof entries !== 'object') return
      for (const [key, value] of Object.entries(entries)) {
        if (!value || typeof value !== 'object' || !('updatedAt' in value)) continue
        const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : 0
        const overrides = 'overrides' in value && value.overrides && typeof value.overrides === 'object'
          ? value.overrides as NovelAIChatOverrides
          : {}
        this._entries.set(key, { overrides: stickySubset(overrides), updatedAt })
      }
      this._prune()
      this._logger.info(`[novelai] 已载入 ${this._entries.size} 条个人默认值`)
    } catch (error) {
      this._logger.warn(`[novelai] 个人默认值读取失败，按空处理：${error instanceof Error ? error.message : String(error)}`)
      this._entries.clear()
    }
  }

  /** 取该作用域的个人默认值（副本） */
  get(scopeKey: string): NovelAIChatOverrides {
    const entry = this._entries.get(scopeKey)
    return entry ? { ...entry.overrides } : {}
  }

  /** 写入个人默认值，返回落库后的全量值 */
  remember(scopeKey: string, patch: NovelAIChatOverrides): NovelAIChatOverrides {
    const next = { ...this.get(scopeKey), ...stickySubset(patch) }
    this._entries.set(scopeKey, { overrides: next, updatedAt: Date.now() })
    this._prune()
    this._scheduleSave()
    return next
  }

  /** 清除全部或指定字段，返回剩余值 */
  reset(scopeKey: string, keys?: ReadonlyArray<keyof NovelAIChatOverrides>): NovelAIChatOverrides {
    const entry = this._entries.get(scopeKey)
    if (!entry) return {}
    const next = { ...entry.overrides }
    clearFields(next, keys ?? OVERRIDE_FIELDS.map(field => field.key))
    if (Object.keys(next).length === 0) this._entries.delete(scopeKey)
    else this._entries.set(scopeKey, { overrides: next, updatedAt: Date.now() })
    this._scheduleSave()
    return next
  }

  /**
   * 生成前确认已经报过价：下一次预生成提示不再重复计费行。
   * 只在同一轮流程里有意义，因此不进文件，仅进程内存 + 5 分钟过期。
   */
  markEstimateShown(scopeKey: string): void {
    this._estimateShown.set(scopeKey, Date.now())
    if (this._estimateShown.size <= 50) return
    for (const [key, at] of this._estimateShown) {
      if (Date.now() - at > ESTIMATE_MARK_TTL) this._estimateShown.delete(key)
    }
  }

  /** 取出并清除标记：true 表示本轮已展示过估价 */
  takeEstimateShown(scopeKey: string): boolean {
    const at = this._estimateShown.get(scopeKey)
    if (at === undefined) return false
    this._estimateShown.delete(scopeKey)
    return Date.now() - at <= ESTIMATE_MARK_TTL
  }

  /** 立即落盘（进程退出/插件卸载时用） */
  flush(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    const payload: StateFile = { version: STATE_VERSION, entries: {} }
    for (const [key, entry] of this._entries) payload.entries[key] = entry
    try {
      fs.mkdirSync(path.dirname(this._file), { recursive: true })
      const temp = `${this._file}.tmp`
      fs.writeFileSync(temp, JSON.stringify(payload), 'utf8')
      fs.renameSync(temp, this._file)
    } catch (error) {
      this._logger.warn(`[novelai] 个人默认值写入失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  dispose(): void {
    this.flush()
    this._entries.clear()
    this._estimateShown.clear()
  }

  private _scheduleSave(): void {
    if (this._saveTimer) return
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      this.flush()
    }, SAVE_DEBOUNCE_MS)
    this._saveTimer.unref?.()
  }

  /** 过期与超量淘汰：按 updatedAt 丢最旧的 */
  private _prune(): void {
    const deadline = Date.now() - TTL_MS
    for (const [key, entry] of this._entries) {
      if (entry.updatedAt < deadline) this._entries.delete(key)
    }
    if (this._entries.size <= MAX_ENTRIES) return
    const ordered = [...this._entries.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    for (const [key] of ordered.slice(0, this._entries.size - MAX_ENTRIES)) this._entries.delete(key)
  }
}
