// 把三层漏斗摊开给人看：合并覆盖值、回显「生效值 + 来源」
//
// 回显只列「本条 / 预设 / 记住」三类来源，因为它们是用户自己刚做过、可能已经忘掉的动作；
// 渠道配置是管理员在 GUI 里设的，每次回显只是噪音。尺寸永远显示（每张图最直观的一维）。

import type { NovelAIParams } from './params'
import { OVERRIDE_FIELDS, type NovelAIChatOverrides } from './chat-params'

/** 来源标签，从高到低 */
export type OverrideSource = '本条' | '参数' | '记住' | '渠道' | '默认'

const SHOWN_SOURCES: ReadonlyArray<OverrideSource> = ['本条', '参数', '记住']

/** steps/scale 的 0 表示「跟随模型默认」，不算已配置 */
const ZERO_MEANS_DEFAULT: ReadonlyArray<keyof NovelAIChatOverrides> = ['steps', 'scale']

export interface EffectiveSources {
  /** 本条消息解析出的覆盖值 */
  message: NovelAIChatOverrides
  /** 进入中间件时的 parameters（预设 parameterOverrides + 命令行 option） */
  parameters: Record<string, unknown>
  /** 个人默认值 */
  sticky: NovelAIChatOverrides
  /** 渠道连接器配置 */
  config: Record<string, unknown>
  /** 本次是否带图（决定是否回显参考模式） */
  hasImages: boolean
}

function isConfigured(key: keyof NovelAIChatOverrides, value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'number' && value === 0 && ZERO_MEANS_DEFAULT.includes(key)) return false
  return true
}

/** 合并覆盖值：模型档案默认值 < 渠道配置（连接器内处理）< 记住 < 预设/命令行 < 本条 */
export function applyChatOverrides(
  parameters: Record<string, any>,
  sticky: NovelAIChatOverrides,
  message: NovelAIChatOverrides
): Record<string, any> {
  const result = { ...parameters }
  for (const field of OVERRIDE_FIELDS) {
    const value = sticky[field.key]
    if (value !== undefined && result[field.key] === undefined) result[field.key] = value
  }
  for (const field of OVERRIDE_FIELDS) {
    const value = message[field.key]
    if (value !== undefined) result[field.key] = value
  }
  return result
}

function resolveSource(field: keyof NovelAIChatOverrides, sources: EffectiveSources): OverrideSource {
  if (sources.message[field] !== undefined) return '本条'
  if (isConfigured(field, sources.parameters[field])) return '参数'
  if (sources.sticky[field] !== undefined) return '记住'
  if (isConfigured(field, sources.config[field])) return '渠道'
  return '默认'
}

function formatValue(field: keyof NovelAIChatOverrides, params: NovelAIParams): string | undefined {
  switch (field) {
    case 'steps': return String(params.steps)
    case 'scale': return String(params.scale)
    case 'sampler': return params.sampler
    case 'referenceMode':
      return params.referenceMode === 'vibe' ? '氛围' : params.referenceMode === 'character' ? '角色' : '不用'
    case 'referenceStrength': return String(params.referenceStrength)
    case 'cfgRescale': return String(params.cfgRescale)
    case 'transparent': return params.transparent ? '开' : '关'
    case 'negativePrompt': return params.negativePrompt ? `${params.negativePrompt.length} 字` : undefined
    case 'seed': return params.seed >= 0 ? String(params.seed) : undefined
    default: return undefined
  }
}

/** 一行回显：尺寸 + 用户自己改过的项（带来源） */
export function describeEffective(params: NovelAIParams, sources: EffectiveSources): string {
  const parts = [`${params.width}×${params.height}`]
  for (const field of OVERRIDE_FIELDS) {
    const source = resolveSource(field.key, sources)
    const shown = SHOWN_SOURCES.includes(source) || (field.key === 'referenceMode' && sources.hasImages)
    if (!shown) continue
    const value = formatValue(field.key, params)
    if (value === undefined) continue
    parts.push(`${field.label} ${value}（${source}）`)
  }
  return parts.join(' · ')
}

/** 描述一套覆盖值本身（「记住」的确认回执） */
export function describeOverrides(overrides: NovelAIChatOverrides): string {
  const parts: string[] = []
  for (const field of OVERRIDE_FIELDS) {
    const value = overrides[field.key]
    if (value === undefined) continue
    if (field.key === 'negativePrompt') parts.push(`${field.label} ${value ? `${String(value).length} 字` : '清空'}`)
    else if (field.key === 'referenceMode') parts.push(`${field.label} ${value === 'vibe' ? '氛围' : value === 'character' ? '角色' : '不用'}`)
    else if (field.key === 'seed') parts.push(`${field.label} ${value === null ? '随机' : String(value)}`)
    else if (typeof value === 'boolean') parts.push(`${field.label} ${value ? '开' : '关'}`)
    else parts.push(`${field.label} ${String(value)}`)
  }
  return parts.join(' · ')
}
