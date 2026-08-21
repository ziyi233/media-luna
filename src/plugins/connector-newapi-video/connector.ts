import { Context } from 'koishi'
import type { ConnectorDefinition, ConnectorRequestLog, FileData, OutputAsset } from '../../core'
import { connectorCardFields, connectorFields } from './config'

type VideoRequestMode = 'generations' | 'edits'

const VIDEO_URL_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.mkv']

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function resolveEndpoint(apiUrl: string, suffix: string): string {
  const baseUrl = stripTrailingSlash(apiUrl)
  // 兼容单数(/v1/video/generations)与复数(/v1/videos/generations)两种 API 路径。
  // 若 apiUrl 显式配置了单数端点，替换时保留单数形式，避免破坏旧配置
  const m = baseUrl.match(/\/v1\/videos?\/generations(?:\/[^/]+)?$/)
  if (m) {
    const matched = m[0]
    const isPlural = /\/v1\/videos\//.test(matched)
    const newSuffix = isPlural ? suffix : suffix.replace('/v1/videos/', '/v1/video/')
    return baseUrl.slice(0, -matched.length) + newSuffix
  }
  return `${baseUrl}${suffix}`
}

function isHttpUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

function getPublicInputUrls(parameters?: Record<string, any>): string[] {
  const urls = parameters?.inputFileUrls
  if (!Array.isArray(urls)) return []
  return urls.filter(isHttpUrl)
}

function isVideoUrlByExtension(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    return VIDEO_URL_EXTENSIONS.some(ext => pathname.endsWith(ext))
  } catch {
    const lower = url.toLowerCase()
    return VIDEO_URL_EXTENSIONS.some(ext => lower.includes(ext))
  }
}

function splitInputUrls(files: FileData[], urls: string[]): { imageUrls: string[]; videoUrls: string[] } {
  const imageUrls: string[] = []
  const videoUrls: string[] = []
  const uploadableFiles = files.filter(file => file.data && file.data.byteLength > 0)
  const paired = Math.min(uploadableFiles.length, urls.length)

  for (let i = 0; i < paired; i++) {
    const mime = uploadableFiles[i].mime || ''
    if (mime.startsWith('video/')) videoUrls.push(urls[i])
    else if (mime.startsWith('image/')) imageUrls.push(urls[i])
    else if (isVideoUrlByExtension(urls[i])) videoUrls.push(urls[i])
  }

  for (let i = paired; i < urls.length; i++) {
    if (isVideoUrlByExtension(urls[i])) videoUrls.push(urls[i])
    else imageUrls.push(urls[i])
  }

  return { imageUrls, videoUrls }
}

function appendNumber(target: Record<string, any>, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return
  const parsed = Number(value)
  if (Number.isFinite(parsed)) target[key] = parsed
}

function resolveDuration(config: Record<string, any>, parameters?: Record<string, any>): unknown {
  return parameters?.duration ?? parameters?.videoDurationSeconds ?? parameters?.seconds ?? config.duration
}

function normalizeStatus(status: unknown): string {
  return String(status || '').toLowerCase()
}

function resolveTaskId(response: any): string | null {
  return response?.id || response?.task_id || response?.taskId || response?.request_id
    || response?.data?.id || response?.data?.task_id || response?.data?.request_id || null
}

function resolveVideoUrl(response: any): string | null {
  if (typeof response?.video?.url === 'string') return response.video.url
  if (typeof response?.video_url === 'string') return response.video_url
  if (typeof response?.url === 'string') return response.url
  if (typeof response?.result_url === 'string') return response.result_url
  if (typeof response?.data?.video_url === 'string') return response.data.video_url
  if (typeof response?.data?.url === 'string') return response.data.url
  if (Array.isArray(response?.data) && typeof response.data[0]?.url === 'string') return response.data[0].url
  if (Array.isArray(response?.output) && typeof response.output[0] === 'string') return response.output[0]
  return null
}

function buildRequestBody(
  config: Record<string, any>,
  prompt: string,
  requestMode: VideoRequestMode,
  imageUrls: string[],
  videoUrls: string[],
  parameters?: Record<string, any>
): Record<string, any> {
  const {
    model,
    mode,
    size,
    width,
    height,
    fps,
    seed,
    negativePrompt
  } = config

  const body: Record<string, any> = { model, prompt }
  if (requestMode === 'edits') {
    // xAI/sub2api 视频编辑：duration/画幅继承输入，不要附带 generations 参数
    body.video = { url: videoUrls[0] }
    return body
  }

  if (mode) body.mode = mode
  if (size) body.size = size
  appendNumber(body, 'width', width)
  appendNumber(body, 'height', height)
  appendNumber(body, 'duration', resolveDuration(config, parameters))
  appendNumber(body, 'fps', fps)
  appendNumber(body, 'seed', seed)
  if (negativePrompt) body.negative_prompt = negativePrompt
  // xAI/sub2api 的图生视频要求 image 为 { url } 结构，字符串 URL 会返回 422
  if (imageUrls.length === 1) body.image = { url: imageUrls[0] }
  if (imageUrls.length > 1) body.image = { url: imageUrls }

  return body
}

function resolveCreateSuffix(requestMode: VideoRequestMode): string {
  return requestMode === 'edits' ? '/v1/videos/edits' : '/v1/videos/generations'
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.filter(Boolean))]
}

function resolveCreateUrls(apiUrl: string, requestMode: VideoRequestMode): string[] {
  const primary = resolveEndpoint(apiUrl, resolveCreateSuffix(requestMode))
  if (requestMode === 'edits') {
    return uniqueUrls([primary, resolveEndpoint(apiUrl, '/v1/video/edits')])
  }
  // 裸基址默认走复数（xAI/sub2api）；仅暴露单数路由的旧 NewAPI 在 404 后回退
  return uniqueUrls([primary, resolveEndpoint(apiUrl, '/v1/video/generations')])
}

function resolvePollSuffixes(requestMode: VideoRequestMode, taskId: string): string[] {
  const id = encodeURIComponent(taskId)
  if (requestMode === 'edits') {
    return [`/v1/videos/${id}`, `/v1/videos/edits/${id}`, `/v1/video/edits/${id}`]
  }
  return [`/v1/videos/generations/${id}`, `/v1/video/generations/${id}`]
}

async function postWithFallback(
  ctx: Context,
  urls: string[],
  body: Record<string, any>,
  headers: Record<string, string>,
  timeout: number
): Promise<{ url: string; response: any }> {
  let lastError: unknown
  for (let i = 0; i < urls.length; i++) {
    try {
      const response = await ctx.http.post(urls[i], body, { headers, timeout })
      return { url: urls[i], response }
    } catch (error) {
      lastError = error
      if (getHttpStatus(error) === 404 && i < urls.length - 1) continue
      throw error
    }
  }
  throw lastError
}

function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const response = (error as { response?: { status?: number } }).response
  if (typeof response?.status === 'number') return response.status
  const status = (error as { status?: number }).status
  return typeof status === 'number' ? status : undefined
}

async function pollVideoResult(
  ctx: Context,
  apiUrl: string,
  apiKey: string,
  taskId: string,
  timeoutMs: number,
  intervalMs: number,
  requestMode: VideoRequestMode
): Promise<any> {
  const candidates = uniqueUrls(resolvePollSuffixes(requestMode, taskId).map(suffix => resolveEndpoint(apiUrl, suffix)))
  let candidateIndex = 0
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))

    let response: any
    try {
      response = await ctx.http.get(candidates[candidateIndex], {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })
    } catch (error) {
      if (getHttpStatus(error) === 404 && candidateIndex < candidates.length - 1) {
        candidateIndex += 1
        continue
      }
      throw error
    }

    const status = normalizeStatus(response?.status || response?.data?.status)
    if (status === 'completed' || status === 'succeeded' || status === 'success' || status === 'done') {
      if (!resolveVideoUrl(response)) {
        throw new Error(`NewAPI Video task completed but no video URL found: ${JSON.stringify(response)}`)
      }
      return response
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(`NewAPI Video task failed: ${response?.error?.message || response?.error || response?.message || JSON.stringify(response)}`)
    }
  }

  throw new Error('NewAPI Video task timeout')
}

function resolveRequestMode(
  imageUrls: string[],
  videoUrls: string[],
  imageFileCount: number,
  videoFileCount: number,
  enableImageInput: boolean,
  enableVideoInput: boolean,
  autoUseEditsForVideoInput: boolean
): VideoRequestMode {
  const hasImage = enableImageInput && (imageUrls.length > 0 || imageFileCount > 0)
  const hasVideo = videoUrls.length > 0 || videoFileCount > 0

  if (hasImage && hasVideo) {
    throw new Error('NewAPI Video 不能同时使用图片和视频输入：请只发送视频以进行视频编辑，或只发送图片以进行图生视频')
  }

  if (!hasVideo) return 'generations'

  if (!enableVideoInput) return 'generations'

  if (!autoUseEditsForVideoInput) {
    throw new Error('收到视频输入，但当前渠道未开启「有视频自动切 edits」')
  }

  if (videoUrls.length === 0) {
    throw new Error('NewAPI Video 视频编辑需要可公开访问的输入视频 URL，请启用 storage-input 并配置可公网访问的存储后端')
  }

  if (videoUrls.length > 1) {
    throw new Error('NewAPI Video 视频编辑一次只支持一个输入视频')
  }

  return 'edits'
}

async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string,
  parameters?: Record<string, any>
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    model,
    enableImageInput = true,
    enableVideoInput = true,
    autoUseEditsForVideoInput = true,
    timeout = 900,
    pollInterval = 5000
  } = config

  if (!model) throw new Error('模型名称未配置')

  const split = splitInputUrls(files, getPublicInputUrls(parameters))
  const imageUrls = enableImageInput ? split.imageUrls : []
  const videoUrls = enableVideoInput ? split.videoUrls : []
  const imageFileCount = files.filter(file => file.mime?.startsWith('image/')).length
  const videoFileCount = files.filter(file => file.mime?.startsWith('video/')).length

  const requestMode = resolveRequestMode(
    imageUrls,
    videoUrls,
    enableImageInput ? imageFileCount : 0,
    enableVideoInput ? videoFileCount : 0,
    enableImageInput,
    enableVideoInput,
    autoUseEditsForVideoInput
  )

  if (enableImageInput && imageFileCount > 0 && imageUrls.length === 0 && requestMode === 'generations') {
    throw new Error('NewAPI Video 图生视频需要可公开访问的输入图片 URL，请启用 storage-input 并配置可公网访问的存储后端')
  }

  const requestBody = buildRequestBody(config, prompt, requestMode, imageUrls, videoUrls, parameters)
  const { response: createResponse } = await postWithFallback(
    ctx,
    resolveCreateUrls(apiUrl, requestMode),
    requestBody,
    {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout * 1000
  )

  const taskId = resolveTaskId(createResponse)
  if (!taskId) throw new Error(`Invalid NewAPI Video response: ${JSON.stringify(createResponse)}`)

  const result = await pollVideoResult(
    ctx,
    apiUrl,
    apiKey,
    taskId,
    timeout * 1000,
    Math.max(1000, Number(pollInterval) || 5000),
    requestMode
  )
  let url = resolveVideoUrl(result)
  if (!url) throw new Error(`NewAPI Video task completed but no video URL found: ${JSON.stringify(result)}`)
  // 上游可能返回相对路径（如 /v1/videos/{id}/content），补全为绝对 URL
  if (url.startsWith('/')) {
    const origin = new URL(stripTrailingSlash(apiUrl)).origin
    url = origin + url
  }

  return [{
    kind: 'video',
    url,
    mime: 'video/mp4',
    meta: {
      taskId,
      model: result.model || result.data?.model || model,
      status: result.status || result.data?.status,
      progress: result.progress || result.data?.progress,
      size: result.size || result.data?.size,
      duration: result.duration || result.data?.duration
    }
  }]
}

export const NewAPIVideoConnector: ConnectorDefinition = {
  id: 'newapi-video',
  name: 'NewAPI Video',
  description: 'NewAPI 通用视频生成连接器，适配 /v1/videos/generations 与 /v1/videos/edits 异步任务接口（兼容 /v1/video/generations）',
  icon: 'newapi',
  supportedTypes: ['video'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2video', 'img2video', 'video2video'],
  generate,

  getRequestLog(config, files, prompt, parameters): ConnectorRequestLog {
    const {
      apiUrl,
      model,
      mode,
      size,
      duration,
      fps,
      enableImageInput = true,
      enableVideoInput = true,
      autoUseEditsForVideoInput = true
    } = config
    const split = splitInputUrls(files, getPublicInputUrls(parameters))
    const imageUrls = enableImageInput ? split.imageUrls : []
    const videoUrls = enableVideoInput ? split.videoUrls : []
    const requestMode = videoUrls.length > 0 && enableVideoInput && autoUseEditsForVideoInput
      ? 'edits'
      : 'generations'
    return {
      endpoint: resolveEndpoint(apiUrl, resolveCreateSuffix(requestMode)),
      model,
      prompt,
      fileCount: files.filter(file => file.mime?.startsWith('image/') || file.mime?.startsWith('video/')).length,
      parameters: {
        mode,
        resolvedMode: requestMode,
        size,
        duration: requestMode === 'edits' ? undefined : (resolveDuration(config, parameters) ?? duration),
        fps,
        inputImageUrls: imageUrls.length || undefined,
        inputVideoUrls: videoUrls.length || undefined
      }
    }
  }
}
