// NovelAI 聊天指令：把 QQ 消息里的指令解析成一套覆盖值
//
// 词法分三类，互不越界：
//   1. Flag（前缀 `-`，与画面 Tag 在词法层隔离）：-t/-c/-w/-d/-sp/-n/-noimg
//   2. 免前缀快捷词（词表极小，整 token 精确匹配）：尺寸（比例/像素/中文短词）、参考（角色/氛围）
//   3. 子命令（整条消息语义）：set 默认 / info 状态 / reset 重置 / cost 消耗 / help 帮助
//
// 解析顺序（回答「-n 后面又写 -t 怎么办」）：先全量抽走所有 Flag 与其取值，
// 再按 `-n` 在剩余流里的位置切出负面词，剩下的才是正面 Prompt。

import { lookupSizeWord, normalizeSampler, type ReferenceMode } from './config'
import { parseSizeText } from './params'

/** 可由对话覆盖的字段 */
export interface NovelAIChatOverrides {
  resolution?: string
  referenceMode?: ReferenceMode
  steps?: number
  scale?: number
  referenceStrength?: number
  cfgRescale?: number
  sampler?: string
  seed?: number | null
  negativePrompt?: string
  /** 透明背景（仅 V5 系）：true 开、false 关 */
  transparent?: boolean
}

export interface ChatDirectiveParse {
  /** 剥掉指令后的正文 */
  prompt: string
  overrides: NovelAIChatOverrides
  /** `#预设名` 指定的预设 */
  presetName?: string
  /** 本条消息要求把覆盖值记成个人默认（set/默认） */
  remember: boolean
  /** info/状态 */
  query: boolean
  /** help/帮助/? */
  help: boolean
  /** reset/重置（清空全部个人默认） */
  resetAll: boolean
  /** cost/消耗：只估消耗不出图 */
  estimate: boolean
  /** -noimg / 不用参考：忽略本次附件图（由中间件摘掉，并回显） */
  noImages: boolean
  matched: string[]
  unknown: string[]
}

/** 尺寸归一成 "832x1216"：先查尺寸词（2:3 / 竖屏 / 大横屏），再按像素串解析；不认识返回 undefined */
export function canonicalSize(raw: string): string | undefined {
  const word = lookupSizeWord(raw)
  if (word) return word
  const pixels = parseSizeText(raw)
  return pixels ? `${pixels.width}x${pixels.height}` : undefined
}

/** 透明通道免前缀词（仅 V5 系实际下发） */
const TRANSPARENT_WORDS: Record<string, boolean> = {
  透明: true,
  透明底: true,
  不透明: false,
  不透明底: false
}

/** 参考模式免前缀词（可跟一个 0-1 的权重） */
const REFERENCE_WORDS = new Map<string, ReferenceMode>([
  ['角色', 'character'],
  ['角色参考', 'character'],
  ['氛围', 'vibe'],
  ['氛围参考', 'vibe'],
  ['不用参考', 'off'],
  ['无参考', 'off']
])

/** 控制词 → 子命令 */
const CONTROL_WORDS = new Map<string, 'remember' | 'query' | 'help' | 'reset' | 'estimate'>([
  ['set', 'remember'],
  ['默认', 'remember'],
  ['记住', 'remember'],
  ['查询', 'query'],
  ['查点数', 'estimate'],
  ['info', 'query'],
  ['状态', 'query'],
  ['help', 'help'],
  ['帮助', 'help'],
  ['?', 'help'],
  ['reset', 'reset'],
  ['重置', 'reset'],
  ['cost', 'estimate'],
  ['消耗', 'estimate']
])

/** 首词是否为控制词（set/info/cost/…）：控制词不是预设名，别拿它去查预设 */
export function isControlWord(token: string): boolean {
  return CONTROL_WORDS.has(token.toLowerCase()) || CONTROL_WORDS.has(token)
}

/** Flag → 字段；值从下一个 token 取 */
const VALUE_FLAGS = new Map<string, keyof NovelAIChatOverrides>([
  ['-t', 'steps'],
  ['-steps', 'steps'],
  ['-c', 'scale'],
  ['-cfg', 'scale'],
  ['-w', 'referenceStrength'],
  ['-str', 'referenceStrength'],
  ['-r', 'cfgRescale'],
  ['-cr', 'cfgRescale'],
  ['-d', 'seed'],
  ['-seed', 'seed'],
  ['-s', 'sampler'],
  ['-sp', 'sampler'],
  ['-sampler', 'sampler'],
  ['-z', 'resolution'],
  ['-size', 'resolution'],
  ['-resolution', 'resolution'],
  ['--size', 'resolution'],
  ['--resolution', 'resolution']
])

/** 无值 Flag：忽略附件图 */
const BOOLEAN_FLAGS = new Set(['-noimg', '-noref'])

/** 负面提示词 Flag：吃掉其后的剩余流 */
const NEGATIVE_FLAGS = new Set(['-n', '-neg', '--'])

const DEFAULT_REFERENCE_STRENGTH = 0.6

/** 参与「记住」的字段：种子不在其中（粘住会让后续每张图都一样） */
export function stickySubset(source: NovelAIChatOverrides): NovelAIChatOverrides {
  const result: NovelAIChatOverrides = {}
  if (source.resolution !== undefined) result.resolution = source.resolution
  if (source.referenceMode !== undefined) result.referenceMode = source.referenceMode
  if (source.steps !== undefined) result.steps = source.steps
  if (source.scale !== undefined) result.scale = source.scale
  if (source.referenceStrength !== undefined) result.referenceStrength = source.referenceStrength
  if (source.sampler !== undefined) result.sampler = source.sampler
  if (source.negativePrompt !== undefined) result.negativePrompt = source.negativePrompt
  if (source.transparent !== undefined) result.transparent = source.transparent
  return result
}

/** 摘掉指定字段（用于重置） */
export function clearFields(target: NovelAIChatOverrides, keys: ReadonlyArray<keyof NovelAIChatOverrides>): void {
  for (const key of keys) delete target[key]
}

const parseSampler = normalizeSampler

/** 写入一个标量字段；返回 false 表示取值非法 */
function assignValue(target: NovelAIChatOverrides, key: keyof NovelAIChatOverrides, raw: string): boolean {
  switch (key) {
    case 'resolution': {
      const size = canonicalSize(raw)
      if (!size) return false
      target.resolution = size
      return true
    }
    case 'steps': {
      const value = Number(raw)
      if (!Number.isInteger(value) || value < 1 || value > 64) return false
      target.steps = value
      return true
    }
    case 'scale': {
      const value = Number(raw)
      if (!Number.isFinite(value) || value < 1 || value > 30) return false
      target.scale = Number(value.toFixed(2))
      return true
    }
    case 'referenceStrength': {
      const value = Number(raw)
      if (!Number.isFinite(value) || value < 0 || value > 1) return false
      target.referenceStrength = Number(value.toFixed(3))
      return true
    }
    case 'seed': {
      const value = Number(raw)
      if (!Number.isInteger(value) || value < 0 || value > 4294967295) return false
      target.seed = value
      return true
    }
    case 'cfgRescale': {
      const value = Number(raw)
      if (!Number.isFinite(value) || value < 0 || value > 1) return false
      target.cfgRescale = Number(value.toFixed(2))
      return true
    }
    case 'sampler': {
      const sampler = parseSampler(raw)
      if (sampler === undefined) return false
      if (sampler === '') delete target.sampler
      else target.sampler = sampler
      return true
    }
    default:
      return false
  }
}

/**
 * 命令路径上 Koishi 会先把 `-t 30` 这类声明过的 option 从文本里摘走，
 * 所以控制消息要把 argv.options 合并回覆盖值。
 */
export function applyOptionOverrides(
  target: NovelAIChatOverrides,
  options: Record<string, unknown>
): void {
  if (typeof options.resolution === 'string' && options.resolution) {
    const size = canonicalSize(options.resolution)
    if (size) target.resolution = size
  }
  const steps = Number(options.steps)
  if (Number.isInteger(steps) && steps >= 1 && steps <= 64) target.steps = steps
  const scale = Number(options.scale)
  if (Number.isFinite(scale) && scale >= 1 && scale <= 30) target.scale = Number(scale.toFixed(2))
  const strength = Number(options.referenceStrength)
  if (Number.isFinite(strength) && strength >= 0 && strength <= 1) target.referenceStrength = Number(strength.toFixed(3))
  const rescale = Number(options.cfgRescale)
  if (Number.isFinite(rescale) && rescale >= 0 && rescale <= 1) target.cfgRescale = Number(rescale.toFixed(2))
  const seed = Number(options.seed)
  if (Number.isInteger(seed) && seed >= 0 && seed <= 4294967295) target.seed = seed
  if (typeof options.sampler === 'string' && options.sampler) {
    const sampler = parseSampler(options.sampler)
    if (sampler) target.sampler = sampler
  }
  if (typeof options.negativePrompt === 'string' && options.negativePrompt) {
    target.negativePrompt = options.negativePrompt
  }
}

export function parseChatDirectives(text: string): ChatDirectiveParse {
  const overrides: NovelAIChatOverrides = {}
  const matched: string[] = []
  const unknown: string[] = []
  let presetName: string | undefined
  let remember = false
  let query = false
  let help = false
  let resetAll = false
  let estimate = false
  let noImages = false

  const tokens = text.split(/\s+/).filter(Boolean)

  // 第一遍：抽走所有 Flag 与其取值；记住 `-n` 在剩余流里的位置
  const rest: string[] = []
  let negativeIndex = -1
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    const lower = token.toLowerCase()

    if (NEGATIVE_FLAGS.has(lower)) {
      if (negativeIndex < 0) negativeIndex = rest.length
      matched.push(token)
      continue
    }

    if (BOOLEAN_FLAGS.has(lower)) {
      noImages = true
      matched.push(token)
      continue
    }

    const flagKey = VALUE_FLAGS.get(lower)
    if (flagKey) {
      const rawValue = tokens[index + 1]
      if (rawValue === undefined) {
        unknown.push(`${token}（缺少取值）`)
        continue
      }
      if (!assignValue(overrides, flagKey, rawValue)) {
        unknown.push(`${token} ${rawValue}`)
        index++
        continue
      }
      matched.push(`${token} ${rawValue}`)
      index++
      continue
    }

    rest.push(token)
  }

  // 第二遍：在剩余流里切负面词，再解析免前缀词
  const promptTokens = negativeIndex >= 0 ? rest.slice(0, negativeIndex) : rest
  if (negativeIndex >= 0) {
    overrides.negativePrompt = rest.slice(negativeIndex).join(' ')
    if (overrides.negativePrompt) matched.push(`负面 ${overrides.negativePrompt}`)
  }

  const body: string[] = []
  for (let index = 0; index < promptTokens.length; index++) {
    const token = promptTokens[index]
    const lower = token.toLowerCase()

    const control = index === 0 ? (CONTROL_WORDS.get(lower) ?? CONTROL_WORDS.get(token)) : undefined
    if (control) {
      matched.push(token)
      if (control === 'remember') remember = true
      else if (control === 'query') query = true
      else if (control === 'help') help = true
      else if (control === 'estimate') estimate = true
      else resetAll = true
      continue
    }

    if (token.startsWith('#') && token.length > 1) {
      presetName = token.slice(1)
      matched.push(token)
      continue
    }

    const reference = REFERENCE_WORDS.get(token)
    if (reference) {
      overrides.referenceMode = reference
      if (reference === 'off') noImages = true
      matched.push(token)
      const next = promptTokens[index + 1]
      if (next !== undefined && /^\d*\.?\d+$/.test(next) && Number(next) >= 0 && Number(next) <= 1) {
        overrides.referenceStrength = Number(Number(next).toFixed(3))
        matched.push(next)
        index++
      } else if (reference !== 'off' && overrides.referenceStrength === undefined) {
        overrides.referenceStrength = DEFAULT_REFERENCE_STRENGTH
      }
      continue
    }

    const transparent = TRANSPARENT_WORDS[token]
    if (transparent !== undefined) {
      overrides.transparent = transparent
      matched.push(token)
      continue
    }

    const size = canonicalSize(token)
    if (size) {
      overrides.resolution = size
      matched.push(token)
      continue
    }

    body.push(token)
  }

  const prompt = body
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*[,，]\s*){2,}/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')

  return {
    prompt,
    overrides,
    presetName,
    remember,
    query,
    help,
    resetAll,
    estimate,
    noImages,
    matched,
    unknown
  }
}

/** 角色提示词行（与 params.ts 的 NovelAICharacterRow 结构一致） */
export interface ChatCharacter {
  prompt: string
  position?: string
}

const CHARACTER_FLAG = /(?:-k|--char|角色词)\s*(?:"([^"]+)"|'([^']+)'|([^\s"]+))/g
const CHARACTER_POSITION = /^(.*)@([A-Ea-e][1-5]|\d*\.?\d+\s*,\s*\d*\.?\d+)$/

/**
 * 从原始消息里回收角色词：`-ch "girl, red hair@A1"`，可重复。
 * 走原始文本是因为命令路径上 Koishi 会先把 -ch 及其取值从提示词里摘走。
 */
export function parseCharacterFlags(raw: string): ChatCharacter[] {
  const rows: ChatCharacter[] = []
  for (const match of raw.matchAll(CHARACTER_FLAG)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (!value) continue
    const positioned = CHARACTER_POSITION.exec(value)
    if (positioned) rows.push({ prompt: positioned[1].trim(), position: positioned[2].replace(/\s+/g, '') })
    else rows.push({ prompt: value })
  }
  return rows
}

/** 可覆盖字段的展示表：合并、回显、重置共用一份顺序与标签 */
export const OVERRIDE_FIELDS: ReadonlyArray<{ key: keyof NovelAIChatOverrides, label: string }> = [
  { key: 'resolution', label: '尺寸' },
  { key: 'referenceMode', label: '参考' },
  { key: 'steps', label: '步数' },
  { key: 'scale', label: 'CFG' },
  { key: 'sampler', label: '采样' },
  { key: 'referenceStrength', label: '强度' },
  { key: 'cfgRescale', label: 'Rescale' },
  { key: 'transparent', label: '透明' },
  { key: 'seed', label: '种子' },
  { key: 'negativePrompt', label: '负面' }
]
