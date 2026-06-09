import { Context } from 'koishi'
import type { ConnectorDefinition, ConnectorRequestLog, FileData, OutputAsset } from '../../core'
import { connectorCardFields, connectorFields } from './config'

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function resolveEndpoint(apiUrl: string, suffix: string): string {
  const baseUrl = stripTrailingSlash(apiUrl)
  if (/\/v1\/video\/generations(?:\/[^/]+)?$/.test(baseUrl)) {
    return baseUrl.replace(/\/v1\/video\/generations(?:\/[^/]+)?$/, suffix)
  }
  return `${baseUrl}${suffix}`
}

function getInputImageUrls(parameters?: Record<string, any>): string[] {
  const urls = parameters?.inputFileUrls
  if (!Array.isArray(urls)) return []
  return urls.filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url))
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
  return response?.id || response?.task_id || response?.taskId || response?.data?.id || response?.data?.task_id || null
}

function resolveVideoUrl(response: any): string | null {
  if (typeof response?.video_url === 'string') return response.video_url
  if (typeof response?.url === 'string') return response.url
  if (typeof response?.result_url === 'string') return response.result_url
  if (typeof response?.data?.video_url === 'string') return response.data.video_url
  if (typeof response?.data?.url === 'string') return response.data.url
  if (Array.isArray(response?.data) && typeof response.data[0]?.url === 'string') return response.data[0].url
  if (Array.isArray(response?.output) && typeof response.output[0] === 'string') return response.output[0]
  return null
}

function buildRequestBody(config: Record<string, any>, prompt: string, inputImageUrls: string[], parameters?: Record<string, any>): Record<string, any> {
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
  if (mode) body.mode = mode
  if (size) body.size = size
  appendNumber(body, 'width', width)
  appendNumber(body, 'height', height)
  appendNumber(body, 'duration', resolveDuration(config, parameters))
  appendNumber(body, 'fps', fps)
  appendNumber(body, 'seed', seed)
  if (negativePrompt) body.negative_prompt = negativePrompt
  if (inputImageUrls.length === 1) body.image = inputImageUrls[0]
  if (inputImageUrls.length > 1) body.image = inputImageUrls

  return body
}

async function pollVideoResult(
  ctx: Context,
  apiUrl: string,
  apiKey: string,
  taskId: string,
  timeoutMs: number,
  intervalMs: number
): Promise<any> {
  const resultUrl = resolveEndpoint(apiUrl, `/v1/video/generations/${encodeURIComponent(taskId)}`)
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))

    const response = await ctx.http.get(resultUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })

    const status = normalizeStatus(response?.status || response?.data?.status)
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
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
    timeout = 900,
    pollInterval = 5000
  } = config

  if (!model) throw new Error('模型名称未配置')

  const imageFileCount = files.filter(file => file.mime?.startsWith('image/')).length
  const inputImageUrls = enableImageInput ? getInputImageUrls(parameters) : []
  if (enableImageInput && imageFileCount > 0 && inputImageUrls.length === 0) {
    throw new Error('NewAPI Video 图生视频需要可公开访问的输入图片 URL，请启用 storage-input 并配置可公网访问的存储后端')
  }

  const createUrl = resolveEndpoint(apiUrl, '/v1/video/generations')
  const requestBody = buildRequestBody(config, prompt, inputImageUrls, parameters)
  const createResponse = await ctx.http.post(createUrl, requestBody, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: timeout * 1000
  })

  const taskId = resolveTaskId(createResponse)
  if (!taskId) throw new Error(`Invalid NewAPI Video response: ${JSON.stringify(createResponse)}`)

  const result = await pollVideoResult(ctx, apiUrl, apiKey, taskId, timeout * 1000, Math.max(1000, Number(pollInterval) || 5000))
  const url = resolveVideoUrl(result)
  if (!url) throw new Error(`NewAPI Video task completed but no video URL found: ${JSON.stringify(result)}`)

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
  description: 'NewAPI 通用视频生成连接器，适配 /v1/video/generations 异步任务接口',
  icon: 'newapi',
  supportedTypes: ['video'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2video', 'img2video'],
  generate,

  getRequestLog(config, files, prompt, parameters): ConnectorRequestLog {
    const { apiUrl, model, mode, size, duration, fps, enableImageInput = true } = config
    const inputImageUrls = enableImageInput ? getInputImageUrls(parameters) : []
    return {
      endpoint: resolveEndpoint(apiUrl, '/v1/video/generations'),
      model,
      prompt,
      fileCount: files.filter(file => file.mime?.startsWith('image/')).length,
      parameters: {
        mode,
        size,
        duration: resolveDuration(config, parameters) ?? duration,
        fps,
        inputImageUrls: inputImageUrls.length || undefined
      }
    }
  }
}
