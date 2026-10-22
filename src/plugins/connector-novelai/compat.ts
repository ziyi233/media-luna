// 可选的计费扩展端点（不绑定任何站点）：
//   GET  {apiUrl}/api/connection  余额 / 本模型单价 / 受理状态
//   POST {apiUrl}/api/billing     整单报价（含参考图附加费）
//
// 官方 NovelAI 没有这两个端点（404），所以它们只是「能力探测」：探到就用真值，
// 探不到就把计费展示降级为本地 Anlas 估算（官方端点）或直接不报价（未知端点）。
// 任何 NAI 兼容服务只要实现同一形状就自动生效，代码里不出现站点名与默认域名。
//
// 响应是外部数据，因此逐字段用 `in` + typeof 检查后再用；形状不对就降级成 ok:false，
// 生成链路绝不能因为查余额而中断。

import { createHash } from 'node:crypto'
import type { Context } from 'koishi'
import type { NovelAIParams } from './params'

/** 计费账户快照 */
export interface CompatAccount {
  /** 剩余积分 */
  credits: number
  /** 当前模型在该端点的单价（积分/张）；端点未列该模型时缺省 */
  price?: number
  modelName?: string
  /** 端点是否可受理 */
  ready: boolean
  paused: boolean
  /** 暂停原因（服务原文） */
  reason: string
  /** 服务附带的说明（例如「此检查未生成图片、未扣积分」） */
  message: string
}

export type CompatAccountResult =
  | { ok: true, account: CompatAccount }
  | { ok: false, error: string }

/** 回执里分钟级就够；同时避免每条消息都打一次该端点 */
const CACHE_TTL = 60_000

/** 探测超时：计费接口只是增强，不能占用生成请求的完整超时 */
const PROBE_TIMEOUT_MS = 5_000
const cache = new Map<string, { at: number, result: CompatAccountResult }>()

/** 缓存键：账号 + 模型的组合指纹（不落 Key 原文） */
function cacheKey(params: NovelAIParams): string {
  const digest = createHash('sha256').update(`${params.apiUrl}|${params.apiToken}`).digest('hex').slice(0, 16)
  return `${digest}|${params.model}`
}

/** 读服务说明文字（错误体形如 {"error":"中文原因"}） */
function readMessage(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return ''
  const candidates = [
    'error' in payload ? payload.error : undefined,
    'message' in payload ? payload.message : undefined
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function readHttpMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error)
  if ('response' in error && typeof error.response === 'object' && error.response !== null) {
    const response = error.response
    const upstream = 'data' in response ? readMessage(response.data) : ''
    if (upstream) return upstream
    if ('status' in response && typeof response.status === 'number') return `HTTP ${response.status}`
  }
  if ('message' in error && typeof error.message === 'string') {
    return /timeout/i.test(error.message) ? '请求超时' : (error.message || '连接错误')
  }
  return '连接错误'
}

/** 数值字段：拒绝 null/布尔/空串这类 `Number()` 会静默变成 0 的值 */
function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** 端点模型价格条目（只取用得上的三列） */
function readModels(source: unknown): Array<{ id: string, name?: string, price?: number }> {
  if (!Array.isArray(source)) return []
  const rows: Array<{ id: string, name?: string, price?: number }> = []
  for (const row of source) {
    if (typeof row !== 'object' || row === null || !('id' in row)) continue
    if (typeof row.id !== 'string' || !row.id) continue
    rows.push({
      id: row.id,
      name: 'name' in row && typeof row.name === 'string' ? row.name : undefined,
      price: readNumber(row as Record<string, unknown>, 'price')
    })
  }
  return rows
}

function parseAccount(params: NovelAIParams, payload: unknown): CompatAccountResult {
  if (typeof payload !== 'object' || payload === null) return { ok: false, error: '响应不是 JSON 对象' }
  if (!('ok' in payload) || payload.ok !== true) return { ok: false, error: readMessage(payload) || '端点未确认 Key' }

  const credits = readNumber(payload as Record<string, unknown>, 'credits')
  if (credits === undefined) return { ok: false, error: '响应里没有积分余额' }

  const model = readModels('models' in payload ? payload.models : undefined).find(row => row.id === params.model)
  const service = 'service' in payload && typeof payload.service === 'object' && payload.service !== null ? payload.service : null
  const admission = service && 'admission' in service && typeof service.admission === 'object' && service.admission !== null
    ? service.admission
    : null

  return {
    ok: true,
    account: {
      credits,
      price: model?.price,
      modelName: model?.name,
      ready: service && 'ready' in service && typeof service.ready === 'boolean' ? service.ready : true,
      paused: admission !== null && 'paused' in admission && admission.paused === true,
      reason: admission !== null && 'reason' in admission && typeof admission.reason === 'string' ? admission.reason.trim() : '',
      message: 'message' in payload && typeof payload.message === 'string' ? payload.message.trim() : ''
    }
  }
}

/**
 * 读取计费账户：余额 / 本模型单价 / 受理状态。
 * `fresh` 用来在生成后拿到最新余额（绕过缓存）。
 */
export async function fetchCompatAccount(
  ctx: Context,
  params: NovelAIParams,
  options: { fresh?: boolean } = {}
): Promise<CompatAccountResult> {
  if (!params.apiUrl || !params.apiToken) return { ok: false, error: '缺少 API 地址或 Key' }
  // http 服务没加载时不要让内部英文报错冒到聊天里
  if (typeof ctx.http?.get !== 'function') return { ok: false, error: 'Koishi 的 HTTP 服务不可用' }

  const key = cacheKey(params)
  const cached = cache.get(key)
  if (!options.fresh && cached && Date.now() - cached.at < CACHE_TTL) return cached.result

  let result: CompatAccountResult
  try {
    const payload = await ctx.http.get(`${params.apiUrl}/api/connection`, {
      headers: { Authorization: `Bearer ${params.apiToken}`, Referer: 'https://novelai.net/' },
      timeout: Math.min(params.timeout * 1000, PROBE_TIMEOUT_MS),
      responseType: 'json'
    })
    result = parseAccount(params, payload)
  } catch (error) {
    result = { ok: false, error: readHttpMessage(error) }
  }

  cache.set(key, { at: Date.now(), result })
  return result
}

/** 生成前的风险提示：暂停受理 / 不可用 / 余额不足；没有风险时返回 null */
export function describeCompatRisk(account: CompatAccount): string | null {
  if (account.paused) {
    return `端点已暂停受理${account.reason ? `：${account.reason}` : ''}`
  }
  if (!account.ready) {
    return '端点当前不可用（排队或通道下线）'
  }
  if (account.price !== undefined && account.credits < account.price) {
    return `积分可能不足（余 ${account.credits} / 本张约 ${account.price}）`
  }
  return null
}

/** 生成后回执：本次消耗 + 最新余额（两次快照都有才报消耗） */
export function describeCompatSpend(beforeCredits: number | null, after: CompatAccount): string {
  const parts: string[] = []
  if (beforeCredits !== null && beforeCredits >= after.credits) {
    parts.push(`消耗 ${beforeCredits - after.credits} 积分`)
  }
  parts.push(`余 ${after.credits} 积分`)
  return parts.join(' · ')
}

/**
 * 整单报价：`POST /api/billing {params}` → `{cost, unitCost, totalCost, count, quoteToken, …}`。
 * 该端点的网页端每次改参数都会调它（250ms 防抖），所以它是「含参考附加费的整单价」的权威来源。
 * 端点对 API Key 开放时用它；失败（含尚未开放某种组合）时返回 null，由调用方降级成基础价说明。
 */
export interface BillingQuote {
  cost: number
  /** 报价有效期（毫秒时间戳）；拿不到就不校验 */
  validUntil?: number
}

/** 组装报价请求要的 params（形状取自网页端 zod schema；参考数量按张数展开） */
function billingParams(params: NovelAIParams, images: number, prompt: string): Record<string, unknown> {
  const references = params.referenceMode === 'off' ? 0 : images
  return {
    model: params.model,
    prompt,
    negative: params.negativePrompt,
    fixedPrompt: '',
    fixedNegative: '',
    size: `${params.width}x${params.height}`,
    steps: params.steps,
    scale: params.scale,
    seed: Math.max(0, params.seed),
    sampler: params.sampler,
    noiseSchedule: params.noiseSchedule,
    cfgRescale: params.cfgRescale,
    qualityToggle: true,
    transparent: params.transparent,
    strength: params.referenceStrength,
    sourceWorkId: '',
    characters: params.characters.map(row => ({
      name: '角色',
      prompt: row.prompt,
      negative: row.uc ?? '',
      x: 0.5,
      y: 0.5
    })),
    useCoords: false,
    vibes: params.referenceMode === 'vibe' ? Array.from({ length: references }, () => ({ encoding: '', information: 1 })) : [],
    precise: params.referenceMode === 'character' ? Array.from({ length: references }, () => ({})) : [],
    mode: 'generate',
    mask: '',
    editImage: '',
    batchCount: 1
  }
}

export async function fetchBillingQuote(
  ctx: Context,
  params: NovelAIParams,
  images: number,
  prompt: string
): Promise<BillingQuote | null> {
  if (typeof ctx.http?.post !== 'function') return null
  try {
    const payload = await ctx.http.post(`${params.apiUrl}/api/billing`, {
      params: billingParams(params, images, prompt)
    }, {
      headers: { Authorization: `Bearer ${params.apiToken}`, Referer: 'https://novelai.net/' },
      timeout: Math.min(params.timeout * 1000, PROBE_TIMEOUT_MS),
      responseType: 'json'
    })
    const cost = readNumber(payload as Record<string, unknown>, 'cost')
    if (cost === undefined || cost < 0) return null
    return { cost, validUntil: readNumber(payload as Record<string, unknown>, 'validUntil') }
  } catch {
    return null
  }
}
