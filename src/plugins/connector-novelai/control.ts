// 纯控制消息在命令执行前拦下：查询 / 重置 / 查点数 / 只改默认不出图
//
// Koishi 的 command/before-execute 监听器返回非 null 值时，该值直接作为命令结果、action 不再执行
// （@koishijs/core: Command.execute 里 checker 的返回值语义）。于是「nai 查询」不会触发一次生成，
// 既不用改 koishi-commands，也不会出现「生成失败: …」这种错文案。
// 监听器挂在根上下文，插件重载会先 dispose 再 onLoad，因此必须返回注销函数。

import type { Argv, Context } from 'koishi'
import type { GenerateGuard } from '../../core'
import type { NovelAIParams } from './params'
import { applyOptionOverrides, isControlWord, parseChatDirectives, stickySubset, type NovelAIChatOverrides } from './chat-params'
import { chatStateKey, NovelAIChatState } from './chat-state'
import { applyChatOverrides, describeEffective, describeOverrides } from './chat-view'
import { describeAnlas, estimateAnlas, resolveParams } from './params'
import { describeCompatRisk, fetchBillingQuote, fetchCompatAccount } from './compat'

/** 拦截器需要的最小 media-luna 能力（结构类型，不 import 服务类） */
export interface ControlChannel {
  id: number
  name: string
  connectorId: string
  connectorConfig: Record<string, any>
  tags?: string[]
}

export interface ControlServices {
  channels: {
    getByName(name: string): Promise<ControlChannel | null>
  }
  presets?: {
    getByName?(name: string): Promise<{ parameterOverrides: Record<string, any> } | null>
    getMatchingPresets?(tags: string[]): Promise<Array<{ name: string, parameterOverrides: Record<string, any> }>>
  }
  /** 生成前置守卫（core 的 MediaLunaService 提供；测试桩可不给） */
  registerGenerateGuard?(guard: GenerateGuard): () => void
}

export interface ControlLogger {
  debug(message: string): void
}

const COMMAND_PREFIX = 'medialuna.'

const USAGE = 'nai set ［参数］ 设为个人默认 · nai info 看当前值 · nai reset 清空 · nai cost ［参数］ 只看消耗'

/** 本渠道当前要点，帮助与查询共用 */
function describeChannel(params: NovelAIParams, images: number): string {
  const host = (() => {
    try { return new URL(params.apiUrl).host } catch { return params.apiUrl }
  })()
  const confirm = params.confirmBefore === 'on' ? ' · 生成前需确认' : ''
  return `${params.profile.label} · ${params.width}×${params.height} · 端点 ${host}${confirm}${images > 0 ? ` · 本次带 ${images} 张参考图` : ''}`
}

/** `help` 的回执：用法 + 快捷词 + 参数 + 本渠道要点 */
export function formatHelp(params: NovelAIParams, images: number): string {
  return [
    '【NovelAI 出图】用法：nai [画面/Tag] [参数]',
    '· nai 1girl, cat ears',
    '· nai #二次元 一只猫 横 -t 30 -s ea',
    '· nai 1girl 角色 0.8 -n 崩坏, 多余手指      （带图/引用图才触发参考）',
    '',
    '【快捷词（空格隔开）】',
    '  预设：#预设名',
    '  尺寸：小图/普通/大图 + 竖幅/横幅/方形，或 1:1 2:3 3:2 3:4 4:3 9:16 16:9、大竖 大横、1024x1536（默认 512x768）',
    '  透明：透明 / 不透明（仅 V5 系生效）',
    '  参考：角色 [0-1] ｜ 氛围 [0-1] ｜ -noimg（有图但不用）',
    '',
    '【参数】',
    '  -z [尺寸] 2:3 / 大图横幅 / 1088x1920（正文里直接写尺寸词也行）',
    '  -t [1-64] 步数     -c [1-30] CFG     -w [0-1] 参考强度     -r [0-1] CFG Rescale',
    '  -d [数字] 固定种子（只单次）          -s [采样] 1/ea 2/euler 3/2m 4/2msde 5/2sa 6/sde 7/ddim',
    '  -k "角色词" 角色提示词（可重复，可带 @A1 或 @0.3,0.5）',
    '  -n [负面词] 吃掉行尾，放最后',
    '',
    `【本渠道】${describeChannel(params, images)}`,
    USAGE
  ].join('\n')
}

/** 只读消息元素，数出图片张数（不依赖具体适配器实现） */
function countImages(session: unknown): number {
  if (!session || typeof session !== 'object' || !('event' in session)) return 0
  const event = session.event
  if (!event || typeof event !== 'object' || !('message' in event)) return 0
  const message = event.message
  if (!message || typeof message !== 'object' || !('elements' in message)) return 0
  const elements = message.elements
  if (!Array.isArray(elements)) return 0
  let count = 0
  for (const element of elements) {
    if (!element || typeof element !== 'object' || !('type' in element)) continue
    if (element.type === 'img' || element.type === 'image') count++
  }
  return count
}

/** 会话身份（平台 + 频道 + 用户）：个人默认与确认流程都按它分桶 */
export function readScope(session: unknown): { platform: string, channelId: string, userId: string } | null {
  if (!session || typeof session !== 'object') return null
  const platform = 'platform' in session && typeof session.platform === 'string' ? session.platform : ''
  const channelId = 'channelId' in session && session.channelId ? String(session.channelId) : ''
  const userId = 'userId' in session && session.userId ? String(session.userId) : ''
  if (!platform || !channelId || !userId) return null
  return { platform, channelId, userId }
}

/** 命中的预设（名称 + 参数覆盖） */
type PresetMatch = { name: string, parameterOverrides: Record<string, any> } | null

/** 找出本条消息里命中的预设（第一个词，与 generation-flow 的规则一致） */
async function findPreset(
  services: ControlServices,
  channel: ControlChannel,
  text: string,
  presetName?: string
): Promise<PresetMatch> {
  // 首词是控制词时不当预设名：否则存在同名预设（如叫 `cost`）时，`nai cost` 的估算基准会被静默换掉
  const leading = text.trim().split(/\s+/)[0]
  const first = presetName ?? (leading && !isControlWord(leading) ? leading : undefined)
  if (!first || !services.presets) return null
  const matching = await services.presets.getMatchingPresets?.(channel.tags ?? [])
  if (matching) {
    return matching.find(preset => preset.name.toLowerCase() === first.toLowerCase()) ?? null
  }
  const preset = await services.presets.getByName?.(first)
  return preset ? { name: first, parameterOverrides: preset.parameterOverrides } : null
}

/**
 * 计费依据 + 计费来源：`nai cost`、生成前确认与预生成提示共用同一份文案。
 * 计费扩展是可选能力：端点实现了余额/报价接口就用真值，没实现就退回本地 Anlas 公式并标明来源。
 */
export async function describeEstimate(ctx: Context, params: NovelAIParams, images: number, prompt = ''): Promise<string[]> {
  const references = images > 0 && params.referenceMode !== 'off'
    ? ` · 参考 ${params.referenceMode === 'vibe' ? '氛围' : '角色'} ${images} 张`
    : ''
  const lines = [`${params.width}×${params.height} · 步数 ${params.steps}${references}`]

  // 探测可选的计费扩展（余额 / 报价）；探不到就退回本地公式，不猜端点积分
  const [account, quote] = await Promise.all([
    fetchCompatAccount(ctx, params),
    fetchBillingQuote(ctx, params, images, prompt)
  ])
  if (!account.ok) {
    const anlas = estimateAnlas({
      width: params.width,
      height: params.height,
      steps: params.steps,
      profile: params.profile,
      vibeImages: params.referenceMode === 'vibe' ? images : 0,
      characterReferenceImages: params.referenceMode === 'character' ? images : 0
    })
    lines.push(`本地估算：${describeAnlas(anlas)}${images > 0 ? `（按 ${images} 张参考图计）` : ''}`)
    lines.push('该端点未提供计费接口，以上按官方 Anlas 公式估算')
    return lines
  }

  if (quote) {
    lines.push(`预计消耗 ${quote.cost} 积分（端点报价）`)
  } else {
    const price = account.account.price
    lines.push([
      price === undefined ? '基础价未知' : `基础 ${price} 积分/张`,
      ...(images > 0 ? ['参考图附加费按端点结算'] : [])
    ].join(' · '))
  }

  lines.push(`余 ${account.account.credits} 积分${account.account.modelName ? `（${account.account.modelName}）` : ''}`)
  const risk = describeCompatRisk(account.account)
  if (risk) lines.push(risk)
  return lines
}

/** 本条消息最终会生效的参数：预设 < 记住 < 本条（与中间件同一套合并规则） */
export async function resolveForMessage(
  services: ControlServices,
  channel: ControlChannel,
  sticky: NovelAIChatOverrides,
  message: NovelAIChatOverrides,
  text: string,
  presetName?: string
): Promise<{ preset: PresetMatch, params: NovelAIParams }> {
  const preset = await findPreset(services, channel, text, presetName)
  const merged = applyChatOverrides({ ...(preset?.parameterOverrides ?? {}) }, sticky, message)
  return { preset, params: resolveParams(channel.connectorConfig, merged) }
}

async function replyEffective(
  ctx: Context,
  services: ControlServices,
  channel: ControlChannel,
  sticky: NovelAIChatOverrides,
  message: NovelAIChatOverrides,
  text: string,
  images: number,
  presetName?: string,
  costOnly = false
): Promise<string> {
  const { preset, params } = await resolveForMessage(services, channel, sticky, message, text, presetName)
  if (!costOnly) {
    const effective = describeEffective(params, {
      message,
      parameters: preset?.parameterOverrides ?? {},
      sticky,
      config: channel.connectorConfig,
      hasImages: images > 0
    })
    const lines = [`【生效】${effective}`]
    lines.push(`【个人默认】${describeOverrides(sticky) || '无'}`)
    if (preset) lines.push(`【预设】${preset.name}${describeOverrides(preset.parameterOverrides) ? ` · ${describeOverrides(preset.parameterOverrides)}` : ''}`)
    return lines.join('\n')
  }
  // 计费口径不同，但都要回显「按哪组参数算」：带覆盖参数查询时才知道覆盖是否生效
  return (await describeEstimate(ctx, params, images, text)).join('\n')
}

/** 处理一条控制消息；返回文本表示已拦下，返回 null 表示放行去生成 */
export async function handleControl(input: {
  /** 插件上下文：中转账户自述接口要用它的 http（带代理） */
  ctx: Context
  text: string
  /** 命令路径上 Koishi 摘走的 option 值（-t/-c/-w/-d/-sp/-n） */
  options?: Record<string, unknown>
  channel: ControlChannel
  session: unknown
  services: ControlServices
  state: NovelAIChatState
}): Promise<string | null> {
  const parsed = parseChatDirectives(input.text)
  if (input.options) applyOptionOverrides(parsed.overrides, input.options)
  const scope = readScope(input.session)
  const scopeKey = scope ? chatStateKey(scope) : null
  const sticky = scopeKey ? input.state.get(scopeKey) : {}
  const images = countImages(input.session)

  if (parsed.resetAll) {
    if (!scopeKey) return '无法定位你的个人默认（缺少会话身份）'
    input.state.reset(scopeKey)
    return '已恢复默认（个人默认已清空）'
  }

  if (parsed.help) {
    const merged = applyChatOverrides({}, sticky, parsed.overrides)
    return formatHelp(resolveParams(input.channel.connectorConfig, merged), images)
  }

  if (parsed.query || parsed.estimate) {
    return await replyEffective(input.ctx, input.services, input.channel, sticky, parsed.overrides, input.text, images, parsed.presetName, parsed.estimate)
  }

  const patch = stickySubset(parsed.overrides)
  if (parsed.remember && scopeKey) {
    if (Object.keys(patch).length === 0) {
      return parsed.overrides.seed !== undefined
        ? `种子只能临时指定，不会记住。${USAGE}`
        : `没有可记住的参数。${USAGE}`
    }
    const saved = Object.keys(patch).length > 0 ? input.state.remember(scopeKey, patch) : sticky
    const seedNote = parsed.overrides.seed !== undefined ? '\n种子只能临时指定，不会记住' : ''
    if (parsed.prompt || images > 0) return null
    return `已记住：${describeOverrides(patch)}\n当前个人默认：${describeOverrides(saved)}${seedNote}`
  }

  // 只有指令、没有正文：出不了图，改成回显（顺带把语法教给用户）
  if (!parsed.prompt && images === 0) {
    const extra = parsed.unknown.length > 0 ? `\n没听懂：${parsed.unknown.join('、')}` : ''
    return `${await replyEffective(input.ctx, input.services, input.channel, sticky, parsed.overrides, input.text, images, parsed.presetName)}${extra}`
  }

  // 生成前确认不在这里做：它要在「已进入收集模式」之后、「正在生成中」之前执行，
  // 由 core 的生成前置守卫在命令层调用（见 confirm.ts）。
  return null
}

/** 注册拦截器，返回注销函数 */
export function registerNovelAIChatControl(
  ctx: Context,
  services: ControlServices,
  state: NovelAIChatState,
  logger: ControlLogger
): () => void {
  const channelCache = new Map<string, ControlChannel | null>()

  const lookup = async (name: string): Promise<ControlChannel | null> => {
    if (!channelCache.has(name)) channelCache.set(name, await services.channels.getByName(name))
    return channelCache.get(name) ?? null
  }

  const listener = async (argv: Argv): Promise<string | undefined> => {
    const commandName = argv.command?.name
    if (!commandName || !commandName.startsWith(COMMAND_PREFIX)) return undefined

    const channel = await lookup(commandName.slice(COMMAND_PREFIX.length))
    if (!channel || channel.connectorId !== 'novelai') return undefined

    const text = (argv.args ?? []).map(part => String(part)).join(' ').trim()
    if (!text) return undefined

    try {
      const reply = await handleControl({
        ctx,
        text,
        options: argv.options as Record<string, unknown> | undefined,
        channel,
        session: argv.session,
        services,
        state
      })
      // 空串同样会让命令短路，所以只返回非空文本
      return reply || undefined
    } catch (error) {
      logger.debug(`[novelai] 控制消息处理失败：${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }

  ctx.on('command/before-execute', listener)
  logger.debug('[novelai] 聊天控制拦截器已注册')

  return () => {
    ctx.off('command/before-execute', listener)
    channelCache.clear()
  }
}
