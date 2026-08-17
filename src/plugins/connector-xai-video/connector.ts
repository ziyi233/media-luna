import type { Context } from 'koishi'
import type { ConnectorDefinition, ConnectorRequestLog, FileData, OutputAsset } from '../../core'
import { connectorCardFields, connectorFields } from './config'

export type XaiVideoMode = 'auto' | 'text' | 'image' | 'reference' | 'edit' | 'extend'

const GENERATION_MODES = new Set<XaiVideoMode>(['text', 'image', 'reference'])
const VIDEO_MODES = new Set<XaiVideoMode>(['edit', 'extend'])
const ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'])
const RESOLUTIONS = new Set(['480p', '720p', '1080p'])

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function resolveXaiEndpoint(apiUrl: string, path: string): string {
  const base = stripTrailingSlash(apiUrl || 'https://api.x.ai/v1')
  if (/\/v1$/i.test(base)) return `${base}${path}`
  return `${base}/v1${path}`
}

function fileToDataUri(file: FileData): string {
  return `data:${file.mime};base64,${Buffer.from(file.data).toString('base64')}`
}

function isImage(file: FileData): boolean {
  return file.mime?.startsWith('image/')
}

function isVideo(file: FileData): boolean {
  return file.mime?.toLowerCase() === 'video/mp4' || /\.mp4$/i.test(file.filename || '')
}

function normalizeMode(value: unknown): XaiVideoMode {
  const mode = String(value || 'auto').trim().toLowerCase()
  const aliases: Record<string, XaiVideoMode> = {
    auto: 'auto',
    text: 'text',
    text2video: 'text',
    t2v: 'text',
    image: 'image',
    img2video: 'image',
    image2video: 'image',
    i2v: 'image',
    reference: 'reference',
    references: 'reference',
    ref: 'reference',
    edit: 'edit',
    video2video: 'edit',
    v2v: 'edit',
    extend: 'extend',
    extension: 'extend'
  }
  const resolved = aliases[mode]
  if (!resolved) {
    throw new Error(`不支持的 xAI 视频模式“${value}”，请使用 auto、text、image、reference、edit 或 extend。`)
  }
  return resolved
}

export function resolveXaiMode(
  configuredMode: unknown,
  requestedMode: unknown,
  files: FileData[]
): XaiVideoMode {
  const mode = normalizeMode(requestedMode ?? configuredMode ?? 'auto')
  const images = files.filter(isImage)
  const videos = files.filter(isVideo)
  const unsupported = files.length - images.length - videos.length

  if (unsupported > 0) throw new Error('xAI 视频仅接受图片或 MP4 视频输入。')
  if (images.length > 0 && videos.length > 0) throw new Error('xAI 视频不能在同一请求中混用图片和视频。')

  if (mode === 'auto') {
    if (videos.length > 0) {
      throw new Error('无法自动判断视频用途，请使用 --mode edit 或 --mode extend。')
    }
    if (images.length === 0) return 'text'
    if (images.length > 7) throw new Error('参考图模式需要 1 至 7 张图片。')
    return images.length === 1 ? 'image' : 'reference'
  }

  if (mode === 'text' && files.length > 0) throw new Error('文生视频模式不接受媒体输入。')
  if (mode === 'image' && (images.length !== 1 || videos.length > 0)) {
    throw new Error('图生视频模式需要且只能输入一张图片。')
  }
  if (mode === 'reference' && (images.length < 1 || images.length > 7 || videos.length > 0)) {
    throw new Error('参考图模式需要 1 至 7 张图片。')
  }
  if (VIDEO_MODES.has(mode) && (videos.length !== 1 || images.length > 0)) {
    throw new Error(`${mode} 模式需要且只能输入一个 MP4 视频。`)
  }

  return mode
}

function numberInRange(value: unknown, fallback: unknown, min: number, max: number, label: string): number {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label}必须在 ${min} 到 ${max} 之间。`)
  }
  return parsed
}

export interface XaiVideoRequest {
  endpoint: string
  mode: XaiVideoMode
  body: Record<string, any>
}

export function buildXaiVideoRequest(
  apiUrl: string,
  config: Record<string, any>,
  files: FileData[],
  prompt: string,
  parameters: Record<string, any> = {}
): XaiVideoRequest {
  const mode = resolveXaiMode(config.mode, parameters.mode, files)
  const model = parameters.model || config.model || 'grok-imagine-video'
  const body: Record<string, any> = { model, prompt }
  const explicitAspectRatio = parameters.aspectRatio
  const explicitResolution = parameters.resolution

  if (GENERATION_MODES.has(mode)) {
    const duration = numberInRange(parameters.duration, config.duration ?? 6, 1, 15, '时长')
    // xAI preserves the source image's aspect ratio only when aspect_ratio is omitted.
    // Channel defaults therefore apply to text/reference generation, but never to image-to-video.
    const aspectRatio = mode === 'image'
      ? explicitAspectRatio
      : explicitAspectRatio ?? config.aspectRatio ?? '16:9'
    const resolution = explicitResolution ?? config.resolution ?? '480p'
    if (aspectRatio != null && !ASPECT_RATIOS.has(String(aspectRatio))) {
      throw new Error(`不支持的宽高比“${aspectRatio}”。`)
    }
    if (!RESOLUTIONS.has(String(resolution))) throw new Error(`不支持的分辨率“${resolution}”。`)
    if (mode === 'reference' && resolution === '1080p') {
      throw new Error('参考图模式最高支持 720p。')
    }
    Object.assign(body, { duration, resolution })
    if (aspectRatio != null) body.aspect_ratio = aspectRatio
  }

  if (mode === 'image') {
    body.image = { url: fileToDataUri(files.find(isImage)!) }
  } else if (mode === 'reference') {
    body.reference_images = files.filter(isImage).map(file => ({ url: fileToDataUri(file) }))
  } else if (mode === 'edit') {
    if (parameters.duration != null || explicitAspectRatio != null || explicitResolution != null) {
      throw new Error('视频编辑会继承原视频的时长、宽高比和分辨率，请移除这些指令参数。')
    }
    body.video = { url: fileToDataUri(files.find(isVideo)!) }
  } else if (mode === 'extend') {
    if (explicitAspectRatio != null || explicitResolution != null) {
      throw new Error('视频续写会继承原视频的宽高比和分辨率，请移除这些指令参数。')
    }
    body.duration = numberInRange(parameters.duration, config.duration ?? 6, 2, 10, '续写时长')
    body.video = { url: fileToDataUri(files.find(isVideo)!) }
  }

  const endpoint = GENERATION_MODES.has(mode)
    ? resolveXaiEndpoint(apiUrl, '/videos/generations')
    : resolveXaiEndpoint(apiUrl, mode === 'edit' ? '/videos/edits' : '/videos/extensions')

  return { endpoint, mode, body }
}

function resolveRequestId(response: any): string | null {
  return response?.request_id || response?.id || null
}

function resolveVideoUrl(response: any): string | null {
  return response?.video?.file_output?.public_url
    || response?.video?.public_url
    || response?.video?.url
    || response?.public_url
    || response?.url
    || null
}

export function parseXaiCompletedResponse(response: any): {
  url: string
  duration?: number
  respectModeration?: boolean
} {
  const respectModeration = response?.video?.respect_moderation ?? response?.respect_moderation
  if (respectModeration === false) {
    throw new Error('xAI 视频因未通过内容审核而被拒绝。')
  }

  const url = resolveVideoUrl(response)
  if (!url) {
    throw new Error(`xAI 视频任务已完成，但响应中没有输出地址：${JSON.stringify(response)}`)
  }

  return {
    url,
    duration: response?.video?.duration ?? response?.duration,
    respectModeration
  }
}

function normalizeStatus(value: unknown): string {
  return String(value || '').toLowerCase()
}

async function pollResult(
  ctx: Context,
  apiUrl: string,
  apiKey: string,
  requestId: string,
  timeoutMs: number,
  intervalMs: number
): Promise<any> {
  const endpoint = resolveXaiEndpoint(apiUrl, `/videos/${encodeURIComponent(requestId)}`)
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))
    const response = await ctx.http.get(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    const status = normalizeStatus(response?.status)

    if (['done', 'completed', 'succeeded', 'success'].includes(status)) {
      parseXaiCompletedResponse(response)
      return response
    }
    if (['failed', 'error', 'expired', 'cancelled'].includes(status)) {
      throw new Error(`xAI 视频任务失败：${response?.error?.message || response?.error || response?.message || status}`)
    }
  }

  throw new Error('xAI 视频任务超时')
}

async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string,
  parameters?: Record<string, any>
): Promise<OutputAsset[]> {
  const { apiUrl = 'https://api.x.ai/v1', apiKey, timeout = 900, pollInterval = 5000 } = config
  if (!apiKey) throw new Error('尚未配置 xAI API 密钥。')
  const timeoutSeconds = numberInRange(timeout, 900, 1, 86400, '超时时间')
  const pollIntervalMs = numberInRange(pollInterval, 5000, 1000, 60000, '轮询间隔')

  const request = buildXaiVideoRequest(apiUrl, config, files, prompt, parameters)
  const created = await ctx.http.post(request.endpoint, request.body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: timeoutSeconds * 1000
  })
  const requestId = resolveRequestId(created)
  if (!requestId) throw new Error(`xAI 视频创建响应缺少任务 ID：${JSON.stringify(created)}`)

  const result = await pollResult(
    ctx,
    apiUrl,
    apiKey,
    requestId,
    timeoutSeconds * 1000,
    pollIntervalMs
  )
  const completed = parseXaiCompletedResponse(result)

  return [{
    kind: 'video',
    url: completed.url,
    mime: 'video/mp4',
    meta: {
      requestId,
      model: result.model || request.body.model,
      mode: request.mode,
      duration: completed.duration ?? request.body.duration,
      status: result.status,
      progress: result.progress,
      respectModeration: completed.respectModeration,
      usage: result.usage,
      fileId: result.video?.file_output?.id
    }
  }]
}

export const XaiVideoConnector: ConnectorDefinition = {
  id: 'xai-video',
  name: 'xAI Grok Imagine Video',
  description: '支持 Grok Imagine 文生视频、图生视频、参考图生成、视频编辑与续写。',
  supportedTypes: ['video'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2video'],
  commandParameters: ['mode', 'duration', 'resolution', 'aspectRatio'],
  generate,

  getRequestLog(config, files, prompt, parameters): ConnectorRequestLog {
    try {
      const request = buildXaiVideoRequest(config.apiUrl, config, files, prompt, parameters)
      return {
        endpoint: request.endpoint,
        model: request.body.model,
        prompt,
        fileCount: files.length,
        parameters: {
          mode: request.mode,
          duration: request.body.duration,
          aspectRatio: request.body.aspect_ratio,
          resolution: request.body.resolution,
          imageCount: request.body.reference_images?.length || (request.body.image ? 1 : undefined),
          videoInput: Boolean(request.body.video) || undefined
        }
      }
    } catch {
      return {
        endpoint: resolveXaiEndpoint(config.apiUrl, '/videos/generations'),
        model: config.model,
        prompt,
        fileCount: files.length,
        parameters: { mode: parameters?.mode ?? config.mode }
      }
    }
  }
}
