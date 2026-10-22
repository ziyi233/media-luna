// NovelAI 连接器
//
// 请求形状来源：官方 OpenAPI（https://image.novelai.net/docs/doc.json）字段名 +
// 社区实测的 V5 必填项（v4_prompt / v4_negative_prompt 缺一则 500）+ 两份社区实现。
// 采用纯 JSON + base64（与 Koishi 侧既有实现一致），不用 multipart。

import { Context } from 'koishi'
import { decode as decodeJpeg } from 'jpeg-js'
import { PNG } from 'pngjs'
import type {
  ConnectorDefinition,
  ConnectorRequestLog,
  ConnectorResponseLog,
  FileData,
  OutputAsset
} from '../../core'
import {
  MAX_CHARACTER_REFERENCE_IMAGES,
  MAX_VIBE_IMAGES,
  UC_PRESETS,
  connectorCardFields,
  connectorFields
} from './config'
import {
  clampCharacters,
  composePrompt,
  estimateAnlas,
  resolveCharacterCenter,
  resolveParams,
  usesCoords,
  type NovelAICharacterRow,
  type NovelAIParams
} from './params'
import { readZipEntries } from './zip'

const ZIP_MAGIC = 'PK'
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const UPSTREAM_MESSAGE_LIMIT = 200

/**
 * 既有 Koishi 实现默认带 referer，这里保留同一形状。
 * 是否为服务端强校验未见证据，因此只带这一项，不伪造 UA。
 */
const EXTRA_HEADERS = { Referer: 'https://novelai.net/' }

/** 氛围参考编码时固化的信息提取度，强度另由 reference_strength_multiple 控制 */
const VIBE_INFORMATION_EXTRACTED = 1

/** 角色参考的描述模式：同时迁移角色与画风 */
const CHARACTER_REFERENCE_MODE = 'character&style'

function isImage(file: FileData): boolean {
  return Boolean(file.mime?.startsWith('image/'))
}

/** 参考图：PNG 源保留原始字节（`png`），JPEG 源只留解码结果（需重新编码） */
interface ReferenceImage {
  width: number
  height: number
  /** 8 位 RGBA 像素 */
  data: Buffer
  png: Buffer | null
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** pngjs 的内部报错（如读取中断）对用户没有意义，统一换成可行动的提示 */
function readPng(buffer: Buffer): PNG {
  try {
    return PNG.sync.read(buffer)
  } catch {
    throw new Error('NovelAI 参考图 PNG 已损坏或无法解码，请重新导出后重试')
  }
}

/**
 * 参考接口要求 PNG；按**文件内容**识别，避免依赖 QQ 附件的扩展名或 MIME。
 * 两条参考路径都必须先解码校验：损坏的图在这里就报错，而不是发出去换回来一个看不懂的 400。
 */
function readReference(image: FileData): ReferenceImage {
  const buffer = Buffer.from(image.data)
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    const png = readPng(buffer)
    return { width: png.width, height: png.height, data: png.data, png: buffer }
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('NovelAI 参考图目前支持 PNG 或 JPEG，请将此图片转为 PNG 后重试')
  }
  try {
    const jpeg = decodeJpeg(buffer, { useTArray: false })
    return { width: jpeg.width, height: jpeg.height, data: jpeg.data, png: null }
  } catch {
    throw new Error('NovelAI 参考图 JPEG 解码失败，请检查图片是否损坏或过大')
  }
}

/** Precise Reference 的三种官方画布（官方文档：角色参考永远落在其中之一） */
const CHARACTER_CANVAS_SIZES: ReadonlyArray<readonly [number, number]> = [[1024, 1536], [1536, 1024], [1472, 1472]]

/**
 * 参考图 base64 上限：NovelAI 网页端与兼容端点对 `image` 字段的实测上限（4,000,000 字符 ≈ 2.9MB）。
 * 插画类参考通常远低于它；摄影/噪声类参考的 PNG 会撞线 —— 本地明确报错比上游的通用 400 更可行动。
 */
const REFERENCE_BASE64_LIMIT = 4_000_000

/** 规范化参考图并编码成 base64 负载：PNG 源原字节上行，JPEG 源重新编码；角色参考额外规范到官方画布 */
function referencePayload(image: FileData, purpose: 'vibe' | 'character'): string {
  const source = readReference(image)
  let png: Buffer

  if (purpose === 'vibe') {
    png = source.png ?? PNG.sync.write({ width: source.width, height: source.height, data: source.data })
  } else {
    // Precise Reference 的三种官方画布：按宽高比取最近的一种，等比缩放 + 居中补黑边
    const ratio = source.width / source.height
    const [width, height] = CHARACTER_CANVAS_SIZES.reduce((best, size) =>
      Math.abs(size[0] / size[1] - ratio) < Math.abs(best[0] / best[1] - ratio) ? size : best)

    if (source.width === width && source.height === height) {
      png = source.png ?? PNG.sync.write({ width, height, data: source.data })
    } else {
      const scale = Math.min(width / source.width, height / source.height)
      const drawWidth = Math.max(1, Math.round(source.width * scale))
      const drawHeight = Math.max(1, Math.round(source.height * scale))
      const left = Math.round((width - drawWidth) / 2)
      const top = Math.round((height - drawHeight) / 2)
      const data = Buffer.alloc(width * height * 4)
      for (let i = 3; i < data.length; i += 4) data[i] = 255

      // 双线性采样；透明像素按 alpha 合成到黑底，不让透明区域的 RGB 污染边缘。
      for (let y = 0; y < drawHeight; y++) {
        const sy = Math.max(0, Math.min(source.height - 1, (y + 0.5) * source.height / drawHeight - 0.5))
        const y0 = Math.floor(sy)
        const y1 = Math.min(y0 + 1, source.height - 1)
        const fy = sy - y0
        for (let x = 0; x < drawWidth; x++) {
          const sx = Math.max(0, Math.min(source.width - 1, (x + 0.5) * source.width / drawWidth - 0.5))
          const x0 = Math.floor(sx)
          const x1 = Math.min(x0 + 1, source.width - 1)
          const fx = sx - x0
          const a = (y0 * source.width + x0) * 4
          const b = (y0 * source.width + x1) * 4
          const c = (y1 * source.width + x0) * 4
          const d = (y1 * source.width + x1) * 4
          const wa = (1 - fx) * (1 - fy) * source.data[a + 3] / 255
          const wb = fx * (1 - fy) * source.data[b + 3] / 255
          const wc = (1 - fx) * fy * source.data[c + 3] / 255
          const wd = fx * fy * source.data[d + 3] / 255
          const target = ((y + top) * width + x + left) * 4
          for (let channel = 0; channel < 3; channel++) {
            data[target + channel] = Math.round(source.data[a + channel] * wa + source.data[b + channel] * wb
              + source.data[c + channel] * wc + source.data[d + channel] * wd)
          }
        }
      }
      png = PNG.sync.write({ width, height, data })
    }
  }

  const payload = png.toString('base64')
  if (payload.length > REFERENCE_BASE64_LIMIT) {
    const megabytes = (payload.length * 3 / 4 / 1048576).toFixed(1)
    throw new Error(`${purpose === 'vibe' ? '氛围' : '角色'}参考图转换后约 ${megabytes}MB，超过 NovelAI 参考图上限（约 2.9MB）：请裁剪或降低细节后重试`)
  }
  return payload
}

/** 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string,
  parameters: Record<string, any> = {}
): Promise<OutputAsset[]> {
  const params = resolveParams(config, parameters)
  if (!params.apiToken) {
    throw new Error('NovelAI 未配置 API Token（渠道配置 → API Token，需要 pst- 开头的 Persistent Token）')
  }

  const images = files.filter(isImage)
  const characters = clampCharacters(params.characters, params.profile)
  const effectivePrompt = composePrompt(params.promptPrefix, prompt)
  const seed = params.seed >= 0 ? params.seed : Math.floor(Math.random() * 4294967296)

  const requestParameters = buildRequestParameters(params, effectivePrompt, characters, seed)
  await attachReferences(ctx, params, requestParameters, images)

  const buffer = await postBinary(ctx, `${params.apiUrl}/ai/generate-image`, params, {
    input: effectivePrompt,
    model: params.model,
    action: 'generate',
    parameters: requestParameters
  })

  return buildAssets(buffer, params, seed, images, characters)
}

/** 组装 parameters：V5 与 V4 系共用 v4_prompt 结构 */
function buildRequestParameters(
  params: NovelAIParams,
  effectivePrompt: string,
  characters: NovelAICharacterRow[],
  seed: number
): Record<string, any> {
  const uc = UC_PRESETS[params.ucPreset]
  const centers = characters.map(resolveCharacterCenter)
  const useCoords = usesCoords(characters)

  const requestParameters: Record<string, any> = {
    params_version: params.profile.paramsVersion,
    width: params.width,
    height: params.height,
    scale: params.scale,
    sampler: params.sampler,
    steps: params.steps,
    n_samples: 1,
    seed,
    extra_noise_seed: seed,
    noise_schedule: params.noiseSchedule,
    // 三套 UC 编号并存：旧整数、V5 字符串、tag 提示
    ucPreset: uc.legacy,
    ucPresetId: params.ucPreset,
    tag_hint_uc_preset: uc.hint,
    qualityPresetId: 'standard',
    tag_hint_qt: 1,
    dynamic_thresholding: false,
    controlnet_strength: 1,
    legacy: false,
    add_original_image: true,
    image_format: 'png',
    use_coords: useCoords,
    characterPrompts: characters.map((character, index) => ({
      center: centers[index],
      prompt: character.prompt,
      uc: character.uc || ''
    })),
    v4_prompt: {
      caption: {
        base_caption: effectivePrompt,
        char_captions: characters.map((character, index) => ({
          centers: [centers[index]],
          char_caption: character.prompt
        }))
      },
      use_coords: useCoords,
      use_order: true,
      legacy_uc: false
    },
    v4_negative_prompt: {
      caption: {
        base_caption: params.negativePrompt,
        char_captions: characters.some(character => character.uc)
          ? characters.map((character, index) => ({
            centers: [centers[index]],
            char_caption: character.uc || ''
          }))
          : []
      },
      use_coords: false,
      use_order: false,
      legacy_uc: false
    },
    prompt: effectivePrompt,
    negative_prompt: params.negativePrompt
  }

  // straight_alpha 是 V5 的透明通道字段：V4 系模型（含中转站）会拒收，默认也不开
  if (params.profile.straightAlpha && params.transparent) requestParameters.straight_alpha = true
  if (params.profile.cfgRescale) requestParameters.cfg_rescale = params.cfgRescale
  if (params.sampler === 'k_euler_ancestral') {
    requestParameters.prefer_brownian = true
    requestParameters.deliberate_euler_ancestral_bug = false
  }

  return requestParameters
}

/** 参考图：氛围参考（需先编码）或角色参考，模型不支持时直接报错而不是静默丢弃 */
async function attachReferences(
  ctx: Context,
  params: NovelAIParams,
  requestParameters: Record<string, any>,
  images: FileData[]
): Promise<void> {
  if (images.length === 0) return

  if (params.referenceMode === 'off') {
    throw new Error(
      `当前渠道的参考图模式是「不使用参考图」，但本次带了 ${images.length} 张图片。`
      + '请在渠道配置里改为氛围参考或角色参考，或去掉图片后重试'
    )
  }

  if (params.referenceMode === 'vibe') {
    if (!params.profile.vibe) {
      throw new Error(
        `${params.profile.label} 尚未提供氛围参考（NovelAI V5 发布时未包含 Vibe Transfer）。`
        + '请改用 V4.5 / V4 模型，或把参考图模式设为角色参考'
      )
    }

    const encoded: string[] = []
    for (const image of images.slice(0, MAX_VIBE_IMAGES)) {
      encoded.push(await encodeVibe(ctx, params, image))
    }
    requestParameters.reference_image_multiple = encoded
    requestParameters.reference_strength_multiple = encoded.map(() => params.referenceStrength)
    requestParameters.normalize_reference_strength_multiple = true
    return
  }

  if (!params.profile.characterReference) {
    throw new Error(`角色参考（Precise Reference）只有 V4.5 支持，当前模型是 ${params.profile.label}`)
  }

  const references = images.slice(0, MAX_CHARACTER_REFERENCE_IMAGES)
  requestParameters.normalize_reference_strength_multiple = true
  requestParameters.director_reference_images = references.map(image => referencePayload(image, 'character'))
  requestParameters.director_reference_descriptions = references.map(() => ({
    caption: { base_caption: CHARACTER_REFERENCE_MODE, char_captions: [] },
    legacy_uc: false
  }))
  requestParameters.director_reference_information_extracted = references.map(() => 1)
  requestParameters.director_reference_strength_values = references.map(() => params.referenceStrength)
  requestParameters.director_reference_secondary_strength_values = references.map(() => params.referenceFidelity)
}

/** 氛围参考必须先送到 /ai/encode-vibe 编码（V4 起 reference_image_multiple 只接受编码结果） */
async function encodeVibe(ctx: Context, params: NovelAIParams, image: FileData): Promise<string> {
  const buffer = await postBinary(ctx, `${params.apiUrl}/ai/encode-vibe`, params, {
    image: referencePayload(image, 'vibe'),
    model: params.model,
    information_extracted: VIBE_INFORMATION_EXTRACTED
  })
  if (buffer.length === 0) throw new Error('NovelAI 氛围参考编码返回了空响应')
  return buffer.toString('base64')
}

/** 统一的二进制请求：ZIP 响应与 vibe 编码都是 binary */
async function postBinary(
  ctx: Context,
  url: string,
  params: NovelAIParams,
  body: Record<string, any>
): Promise<Buffer> {
  try {
    const response = await ctx.http.post(url, body, {
      headers: { Authorization: `Bearer ${params.apiToken}`, ...EXTRA_HEADERS },
      timeout: params.timeout * 1000,
      responseType: 'arraybuffer'
    })
    return Buffer.from(response)
  } catch (error) {
    throw describeFailure(error)
  }
}

function describeFailure(error: unknown): Error {
  if (!error || typeof error !== 'object') return new Error(`NovelAI 请求失败：${String(error)}`)

  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  const status = readStatus(error)

  if (status === undefined) {
    return new Error(/timeout/i.test(message) ? 'NovelAI 请求超时' : `NovelAI 请求失败：${message || '连接错误'}`)
  }

  const parts = [`NovelAI 返回 HTTP ${status}`]
  const hint = describeStatus(status)
  if (hint) parts.push(hint)
  const upstream = extractUpstreamMessage(readResponseBody(error))
  if (upstream) parts.push(upstream)
  const advisory = describeAdvisory(upstream)
  return new Error(parts.join('：') + (advisory ? `\n${advisory}` : ''))
}

/** 把服务端策略类拒绝翻译成可行动的提示 */
function describeAdvisory(upstream: string): string {
  if (/recaptcha/i.test(upstream)) {
    return '该账号是免费试用档（tier 0）：NovelAI 现在要求试用档出图携带 reCAPTCHA token，'
      + '纯 Persistent Token 无法出图。订阅任一档（Opus 另有免费额度带）后 API 才能使用'
  }
  if (upstream.includes('请求未完成')) {
    return '第三方中转的通用拒绝：常见原因是本站积分不足、或该模型不支持你的积分类型'
      + '（例如风千屿的邀请积分只能用于 V4.5 任务，V5 需要普通积分）。到站内积分流水核对后重试'
  }
  return ''
}

function readStatus(error: object): number | undefined {
  if (!('response' in error)) return undefined
  const response = error.response
  if (!response || typeof response !== 'object' || !('status' in response)) return undefined
  return typeof response.status === 'number' ? response.status : undefined
}

function readResponseBody(error: object): string {
  if (!('response' in error)) return ''
  const response = error.response
  if (!response || typeof response !== 'object' || !('data' in response)) return ''
  const data = response.data

  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  if (data && typeof data === 'object') {
    try {
      return JSON.stringify(data)
    } catch {
      return ''
    }
  }
  return ''
}

function extractUpstreamMessage(body: string): string {
  if (!body) return ''
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') {
      return parsed.message.slice(0, UPSTREAM_MESSAGE_LIMIT)
    }
  } catch {
    return body.slice(0, UPSTREAM_MESSAGE_LIMIT)
  }
  return body.slice(0, UPSTREAM_MESSAGE_LIMIT)
}

function describeStatus(status: number): string {
  switch (status) {
    case 400: return '请求被拒绝（参数不合法）'
    case 401: return 'Token 无效或未授权，请检查渠道配置里的 API Token'
    case 402: return 'Anlas 余额不足'
    case 403: return '该模型对当前订阅档不可用'
    case 429: return '同一账号同时只允许生成一张图（并发锁），请稍后重试，不要自动重试'
    case 500: return '服务端错误'
    case 504: return '网关超时'
    default: return ''
  }
}

/** 响应：默认是 ZIP（嗅探 PK 魔数，NAI 的 Content-Type 不稳定），兼容直接返回 PNG 的中转 */
function buildAssets(
  buffer: Buffer,
  params: NovelAIParams,
  seed: number,
  images: FileData[],
  characters: NovelAICharacterRow[]
): OutputAsset[] {
  // 本地 Anlas 估算只进任务记录；真实积分以端点的计费接口为准（读不到就不报）
  const anlas = estimateAnlas({
    width: params.width,
    height: params.height,
    steps: params.steps,
    profile: params.profile,
    vibeImages: params.referenceMode === 'vibe' ? images.length : 0,
    characterReferenceImages: params.referenceMode === 'character' ? images.length : 0
  })

  const meta = {
    model: params.model,
    width: params.width,
    height: params.height,
    steps: params.steps,
    scale: params.scale,
    sampler: params.sampler,
    ucPreset: params.ucPreset,
    seed,
    anlas: anlas.total,
    anlasPerImage: anlas.perImage,
    opusFreeBand: anlas.freeBand,
    endpoint: params.apiUrl,
    referenceMode: params.referenceMode,
    referenceCount: images.length,
    characterCount: characters.length
  }

  if (buffer.subarray(0, 2).toString('latin1') === ZIP_MAGIC) {
    const entries = readZipEntries(buffer)
      .filter(entry => /\.(png|jpe?g)$/i.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    if (entries.length === 0) throw new Error('NovelAI 返回的 ZIP 里没有图片')
    return entries.map(entry => ({
      kind: 'image' as const,
      url: `data:${entry.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${entry.data.toString('base64')}`,
      mime: entry.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
      meta: { ...meta, source: entry.name }
    }))
  }

  if (buffer.subarray(0, 4).equals(PNG_MAGIC)) {
    return [{ kind: 'image' as const, url: `data:image/png;base64,${buffer.toString('base64')}`, mime: 'image/png', meta }]
  }

  throw new Error(`NovelAI 返回了无法识别的响应（${buffer.length} 字节）`)
}

/** NovelAI 连接器定义 */
export const NovelAIConnector: ConnectorDefinition = {
  id: 'novelai',
  name: 'NovelAI',
  description: 'NovelAI API（V5 / V4.5 / V4，官方与 NAI 兼容端点），支持多角色位置控制与 Anlas 预估',
  icon: 'novelai',
  supportedTypes: ['image'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2img', 'img2img'],
  generate,

  /** 请求日志：只放脱敏后的关键参数 */
  getRequestLog(config, files, prompt, parameters): ConnectorRequestLog {
    const params = resolveParams(config, parameters)
    const images = files.filter(isImage)
    const characters = clampCharacters(params.characters, params.profile)
    const anlas = estimateAnlas({
      width: params.width,
      height: params.height,
      steps: params.steps,
      profile: params.profile,
      vibeImages: params.referenceMode === 'vibe' ? images.length : 0,
      characterReferenceImages: params.referenceMode === 'character' ? images.length : 0
    })

    return {
      endpoint: params.apiUrl,
      model: params.model,
      prompt: composePrompt(params.promptPrefix, prompt),
      fileCount: images.length,
      parameters: {
        width: params.width,
        height: params.height,
        steps: params.steps,
        scale: params.scale,
        sampler: params.sampler,
        noiseSchedule: params.noiseSchedule,
        ucPreset: params.ucPreset,
        seed: params.seed >= 0 ? params.seed : '随机',
        referenceMode: params.referenceMode,
        referenceCount: images.length,
        characterCount: characters.length,
        estimatedAnlas: anlas.total,
        opusFreeBand: anlas.freeBand
      }
    }
  },

  /** 响应日志：把实际种子与消耗带回任务详情 */
  getResponseLog(output): ConnectorResponseLog {
    const meta = output.find(asset => asset.kind === 'image')?.meta
    return {
      outputCount: output.length,
      outputTypes: ['image'],
      meta: meta
        ? {
          model: meta.model,
          width: meta.width,
          height: meta.height,
          steps: meta.steps,
          scale: meta.scale,
          sampler: meta.sampler,
          seed: meta.seed,
          anlas: meta.anlas,
          opusFreeBand: meta.opusFreeBand
        }
        : undefined
    }
  }
}
