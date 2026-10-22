// NovelAI 参数解析：把渠道配置 + 请求参数合成一次生成所需的一切
//
// 覆盖顺序（后者优先）：模型档案默认值 < 渠道配置（GUI）< parameters（预设 / 命令行 / LLM）
// 聊天里的中文指令由 middleware.ts 写进 parameters，因此走同一条合并路径。

import {
  ANLAS_AREA_COEFFICIENT,
  ANLAS_STEP_AREA_COEFFICIENT,
  CHARACTER_REFERENCE_COST,
  DEFAULT_SAMPLER,
  DEFAULT_SIZE,
  MAX_ANLAS_PER_SAMPLE,
  MAX_PIXELS,
  MAX_SIDE,
  MAX_VIBE_IMAGES,
  MIN_SIDE,
  OFFICIAL_API_URL,
  OPUS_FREE_MAX_PIXELS,
  OPUS_FREE_MAX_STEPS,
  SIZE_STEP,
  UC_PRESETS,
  VIBE_ENCODE_COST,
  VIBE_FREE_COUNT,
  getModelProfile,
  lookupSizeWord,
  normalizeSampler,
  type NovelAIModelProfile,
  type ConfirmMode,
  type ReferenceMode
} from './config'

/** 角色位置行（表格字段与 parameters.characterPrompts 共用同一形状） */
export interface NovelAICharacterRow {
  /** A1~E5 网格或 0.25,0.7 连续坐标 */
  position?: string
  prompt: string
  uc?: string
}

/** 合成后的请求参数 */
export interface NovelAIParams {
  apiUrl: string
  apiToken: string
  model: string
  profile: NovelAIModelProfile
  width: number
  height: number
  steps: number
  scale: number
  sampler: string
  noiseSchedule: string
  cfgRescale: number
  seed: number
  ucPreset: string
  negativePrompt: string
  /** 实际拼在用户提示词之前的前缀；promptPrefixMode 为 off 时是空串 */
  promptPrefix: string
  /**
   * 前缀来源。off（默认）= 什么都不注入；recommended = 该模型推荐质量词；
   * custom = 渠道里手填的 promptPrefix 文本。
   */
  promptPrefixMode: PromptPrefixMode
  referenceMode: ReferenceMode
  referenceStrength: number
  referenceFidelity: number
  /** 出图用透明背景（仅 V5 系支持，实际是否下发还看 profile.straightAlpha） */
  transparent: boolean
  /** 生成前是否先估价再确认（on / off） */
  confirmBefore: ConfirmMode
  characters: NovelAICharacterRow[]
  showAnlasCost: boolean
  timeout: number
}

export interface AnlasBreakdown {
  /** 单张基础成本（免费带内不计） */
  perImage: number
  /** 氛围参考编码等一次性成本 */
  encode: number
  /** 角色参考附加成本 */
  characterReference: number
  total: number
  /** 是否落在 Opus 免费带内 */
  freeBand: boolean
  /** 超出单张上限，无法估价 */
  overLimit: boolean
}

/** 单边尺寸对齐到 64 的倍数并夹在合法区间（NAI 只接受 64 的倍数） */
export function snapSide(value: number): number {
  const snapped = Math.round(value / SIZE_STEP) * SIZE_STEP
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, snapped))
}

/** 解析 "832x1216" 形式的尺寸；任意数字都会吸附到 64 的倍数 */
export function parseSizeText(text: unknown): { width: number, height: number } | null {
  if (typeof text !== 'string') return null
  const match = /^\s*(\d{1,4})\s*[x×*]\s*(\d{1,4})\s*$/.exec(text)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (width < MIN_SIDE || height < MIN_SIDE || width > MAX_SIDE || height > MAX_SIDE) return null
  return { width: snapSide(width), height: snapSide(height) }
}

/** 尺寸的完整语法：像素串（832x1216）与尺寸词（2:3 / 竖屏 / 大横屏）；不认识返回 null */
export function resolveSizeText(text: unknown): { width: number, height: number } | null {
  const raw = typeof text === 'string' ? text : ''
  return parseSizeText(raw) ?? parseSizeText(lookupSizeWord(raw) ?? '')
}

/** 解析角色位置：A1~E5 网格（左上为 A1）或 0.25,0.7 连续坐标 */
export function parsePosition(text: string): { x: number, y: number } | null {
  const trimmed = text.trim()

  const grid = /^([a-eA-E])\s*([1-5])$/.exec(trimmed)
  if (grid) {
    const column = grid[1].toUpperCase().charCodeAt(0) - 65
    const row = Number(grid[2]) - 1
    return { x: Number((0.1 + 0.2 * column).toFixed(1)), y: Number((0.1 + 0.2 * row).toFixed(1)) }
  }

  const pair = /^(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)$/.exec(trimmed)
  if (pair) {
    const clamp = (value: number) => Number(Math.min(1, Math.max(0, value)).toFixed(3))
    return { x: clamp(Number(pair[1])), y: clamp(Number(pair[2])) }
  }

  return null
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/** 0 表示「跟随模型默认」，故仅在显式正数时采用 */
function positiveOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/** 超出像素上限时按比例缩到 64 的倍数 */
function fitWithinPixelLimit(width: number, height: number): { width: number, height: number } {
  if (width * height <= MAX_PIXELS) return { width, height }
  const ratio = Math.sqrt(MAX_PIXELS / (width * height))
  return { width: snapSide(width * ratio), height: snapSide(height * ratio) }
}

/**
 * 合成一次生成的全部参数。
 * parameters 里的同名键覆盖渠道配置，这是预设 / 命令行 / LLM 的唯一入口。
 */
export function resolveParams(
  config: Record<string, any> = {},
  parameters: Record<string, any> = {}
): NovelAIParams {
  const read = (key: string): unknown => {
    const fromParameters = parameters[key]
    if (fromParameters !== undefined && fromParameters !== null && fromParameters !== '') return fromParameters
    const fromConfig = config[key]
    if (fromConfig !== undefined && fromConfig !== null && fromConfig !== '') return fromConfig
    return undefined
  }

  const profile = getModelProfile(String(read('model') || ''))

  const customSize = parseSizeText(read('customSize'))
  // 尺寸逐层解析：parameters 里写了但不认识（预设/命令行/LLM 都可能写错）时退回渠道配置，
  // 最后才是内置默认，否则「不认识的尺寸」会静默换成另一档
  const explicitWidth = Number(parameters.width)
  const explicitHeight = Number(parameters.height)
  const hasExplicitSize = Number.isFinite(explicitWidth) && explicitWidth > 0
    && Number.isFinite(explicitHeight) && explicitHeight > 0
  const fromParameters = String(parameters.resolution ?? '') === 'custom' ? customSize : resolveSizeText(parameters.resolution)
  const fromConfig = String(config.resolution ?? '') === 'custom' ? customSize : resolveSizeText(config.resolution)
  const requested = hasExplicitSize
    ? { width: snapSide(explicitWidth), height: snapSide(explicitHeight) }
    : fromParameters ?? fromConfig ?? DEFAULT_SIZE
  const size = fitWithinPixelLimit(requested.width, requested.height)

  const requestedSampler = normalizeSampler(String(read('sampler') || ''))
  const rawSeed = Number(read('seed'))
  const rawPrefixText = String(read('promptPrefix') || '').trim()
  const rawPrefixMode = String(read('promptPrefixMode') || '').trim()
  // 旧配置迁移：只填了文本（且不是「无/none」）视为自定义；什么都没填＝不注入
  const legacyOff = rawPrefixText === '无' || rawPrefixText.toLowerCase() === 'none'
  const promptPrefixMode: PromptPrefixMode = rawPrefixMode === 'recommended' || rawPrefixMode === 'custom'
    ? rawPrefixMode
    : (rawPrefixText && !legacyOff ? 'custom' : 'off')
  const rawPrefix = promptPrefixMode === 'recommended'
    ? profile.qualityPrompt
    : promptPrefixMode === 'custom' ? rawPrefixText : ''
  const rawReferenceMode = read('referenceMode')
  const referenceMode: ReferenceMode = rawReferenceMode === 'character' || rawReferenceMode === 'off'
    ? rawReferenceMode
    : 'vibe'
  const rawConfirmMode = read('confirmBefore')
  // 开关式：只有显式 off 才是模式 1；旧值 relay / always 都归一到「要确认」
  const confirmBefore: ConfirmMode = rawConfirmMode === 'off' ? 'off' : 'on'
  // 端点由配置决定，不预置任何站点；留空走官方
  const configuredUrl = String(config.apiUrl || '').replace(/\/+$/, '')
  const apiUrl = configuredUrl || OFFICIAL_API_URL

  return {
    apiUrl,
    apiToken: String(config.apiToken || '').trim(),
    model: profile.id,
    profile,
    width: size.width,
    height: size.height,
    steps: profile.fixed?.steps
      ?? clampNumber(positiveOrUndefined(read('steps')), 1, 64, profile.steps),
    scale: clampNumber(positiveOrUndefined(read('scale')), 1, 30, profile.scale),
    sampler: profile.fixed?.sampler
      ?? (requestedSampler ? requestedSampler : DEFAULT_SAMPLER),
    noiseSchedule: String(read('noiseSchedule') || 'karras'),
    cfgRescale: clampNumber(read('cfgRescale'), 0, 1, 0),
    seed: Number.isFinite(rawSeed) && rawSeed >= 0 ? Math.min(Math.round(rawSeed), 4294967295) : -1,
    ucPreset: UC_PRESETS[String(read('ucPreset') || '')] ? String(read('ucPreset')) : 'heavy',
    negativePrompt: String(read('negativePrompt') || '').trim(),
    promptPrefix: rawPrefix,
    promptPrefixMode,
    referenceMode,
    referenceStrength: clampNumber(read('referenceStrength'), 0, 1, 0.6),
    referenceFidelity: clampNumber(read('referenceFidelity'), 0, 1, 1),
    transparent: read('transparent') === true,
    confirmBefore,
    characters: normalizeCharacters(parameters.characterPrompts ?? config.characters),
    showAnlasCost: read('showAnlasCost') !== false,
    timeout: clampNumber(read('timeout'), 1, 3600, 300)
  }
}

/**
 * 归一化角色行：丢弃没有提示词的行。
 * 位置留空表示「不参与空间约束」——这正是 NAI 元数据里 use_coords:false 的语义，
 * 此时角色层对整张图生效；只有显式给了位置才发 use_coords:true。
 */
/** 提示词前缀来源 */
export type PromptPrefixMode = 'off' | 'recommended' | 'custom'

export function normalizeCharacters(raw: unknown): NovelAICharacterRow[] {
  if (!Array.isArray(raw)) return []
  const rows: NovelAICharacterRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const prompt = 'prompt' in item && typeof item.prompt === 'string' ? item.prompt.trim() : ''
    if (!prompt) continue
    const position = 'position' in item && typeof item.position === 'string' ? item.position.trim() : ''
    const uc = 'uc' in item && typeof item.uc === 'string' ? item.uc.trim() : ''
    rows.push({ prompt, position: position || undefined, uc })
  }
  return rows
}

/** 有任何一个角色显式给了位置，才启用空间坐标 */
export function usesCoords(rows: NovelAICharacterRow[]): boolean {
  return rows.some(row => Boolean(row.position))
}

/** 角色位置 → 归一化坐标（0~1）；没写位置就是画面中心（服务端在 use_coords:false 时忽略坐标） */
export function resolveCharacterCenter(row: NovelAICharacterRow): { x: number, y: number } {
  return parsePosition(row.position || '') ?? { x: 0.5, y: 0.5 }
}

/** 角色数按模型上限截断（V5 为 22，V4/V4.5 为 6） */
export function clampCharacters(
  rows: NovelAICharacterRow[],
  profile: NovelAIModelProfile
): NovelAICharacterRow[] {
  return rows.slice(0, profile.maxCharacters)
}

/** 质量词拼在用户提示词之前 */
export function composePrompt(prefix: string, prompt: string): string {
  const body = prompt.trim()
  const head = prefix.trim()
  if (!head) return body
  if (!body) return head
  return `${head}, ${body}`
}

/**
 * Anlas 估算（官方前端公式）。两个实测点吻合：
 * 832x1216 / 23 步 / V5 → 26；1024x1536 / 28 步 / V5 → 45。
 */
export function estimateAnlas(input: {
  width: number
  height: number
  steps: number
  profile: NovelAIModelProfile
  vibeImages?: number
  characterReferenceImages?: number
}): AnlasBreakdown {
  const pixels = Math.max(input.width * input.height, 65536)
  const base = Math.ceil(
    ANLAS_AREA_COEFFICIENT * pixels
    + ANLAS_STEP_AREA_COEFFICIENT * pixels * input.steps * input.profile.stepCostFactor
  )
  const perImage = Math.max(Math.ceil(base * input.profile.anlasMultiplier), 2)

  const vibeImages = Math.min(input.vibeImages ?? 0, MAX_VIBE_IMAGES)
  const encode = vibeImages * VIBE_ENCODE_COST + Math.max(0, vibeImages - VIBE_FREE_COUNT) * VIBE_ENCODE_COST
  const characterReference = (input.characterReferenceImages ?? 0) * CHARACTER_REFERENCE_COST
  const freeBand = pixels <= OPUS_FREE_MAX_PIXELS && input.steps <= OPUS_FREE_MAX_STEPS

  return {
    perImage,
    encode,
    characterReference,
    total: (freeBand ? 0 : perImage) + encode + characterReference,
    freeBand,
    overLimit: perImage > MAX_ANLAS_PER_SAMPLE
  }
}

/** 把估算结果写成人话 */
export function describeAnlas(anlas: AnlasBreakdown): string {
  const parts = [anlas.freeBand ? '基础 0 / 免费额度内' : `基础 ${anlas.perImage}`]
  if (anlas.encode) parts.push(`氛围参考编码 ${anlas.encode}`)
  if (anlas.characterReference) parts.push(`角色参考 ${anlas.characterReference}`)
  const refill = anlas.freeBand ? `；Opus 免费额度用尽时为 ${anlas.perImage}` : ''
  const overLimit = anlas.overLimit ? '；分辨率过高，实际可能无法估价' : ''
  return `预计消耗 ${anlas.total} Anlas（${parts.join(' + ')}${refill}${overLimit}）`
}
