import { Context } from 'koishi'
import type { ConnectorDefinition, ConnectorRequestLog, FileData, OutputAsset } from '../../core'
import { connectorCardFields, connectorFields } from './config'

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function resolveEndpoint(apiUrl: string, suffix: string): string {
  const baseUrl = stripTrailingSlash(apiUrl)
  if (/\/videos(?:\/[^/]+(?:\/content)?)?$/.test(baseUrl)) {
    return baseUrl.replace(/\/videos(?:\/[^/]+(?:\/content)?)?$/, suffix)
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

function resolveDurationSeconds(config: Record<string, any>, parameters?: Record<string, any>): unknown {
  return parameters?.seconds ?? parameters?.videoDurationSeconds ?? parameters?.duration ?? config.seconds
}

function normalizeStatus(status: unknown): string {
  return String(status || '').toLowerCase()
}

function resolveTaskId(response: any): string | null {
  return response?.id || response?.task_id || response?.taskId || null
}

function resolveVideoUrl(response: any): string | null {
  if (typeof response?.video_url === 'string') return response.video_url
  if (typeof response?.url === 'string') return response.url
  if (Array.isArray(response?.output) && typeof response.output[0] === 'string') return response.output[0]
  if (Array.isArray(response?.data) && typeof response.data[0]?.url === 'string') return response.data[0].url
  return null
}

async function downloadVideoContent(ctx: Context, apiUrl: string, apiKey: string, taskId: string): Promise<string> {
  const contentUrl = resolveEndpoint(apiUrl, `/videos/${encodeURIComponent(taskId)}/content`)
  const response = await ctx.http.get(contentUrl, {
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    responseType: 'arraybuffer'
  })
  return `data:video/mp4;base64,${Buffer.from(response).toString('base64')}`
}

async function pollVideoResult(
  ctx: Context,
  apiUrl: string,
  apiKey: string,
  taskId: string,
  timeoutMs: number,
  intervalMs: number
): Promise<any> {
  const resultUrl = resolveEndpoint(apiUrl, `/videos/${encodeURIComponent(taskId)}`)
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))

    const response = await ctx.http.get(resultUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })

    const status = normalizeStatus(response?.status)
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      return response
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(`OpenAI Video task failed: ${response?.error?.message || response?.error || response?.message || JSON.stringify(response)}`)
    }
  }

  throw new Error('OpenAI Video task timeout')
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
    size,
    fps,
    seed,
    enableImageInput = true,
    timeout = 900,
    pollInterval = 5000
  } = config

  if (!model) throw new Error('模型名称未配置')

  const imageFileCount = files.filter(file => file.mime?.startsWith('image/')).length
  const inputImageUrls = enableImageInput ? getInputImageUrls(parameters) : []
  if (enableImageInput && imageFileCount > 0 && inputImageUrls.length === 0) {
    throw new Error('OpenAI Video 图生视频需要可公开访问的输入图片 URL，请启用 storage-input 并配置可公网访问的存储后端')
  }

  const body: Record<string, any> = { model, prompt }
  if (size) body.size = size
  appendNumber(body, 'seconds', resolveDurationSeconds(config, parameters))
  appendNumber(body, 'fps', fps)
  appendNumber(body, 'seed', seed)
  if (inputImageUrls.length > 0) body.image = inputImageUrls[0]

  const createUrl = resolveEndpoint(apiUrl, '/videos')
  const createResponse = await ctx.http.post(createUrl, body, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: timeout * 1000
  })

  const taskId = resolveTaskId(createResponse)
  if (!taskId) throw new Error(`Invalid OpenAI Video response: ${JSON.stringify(createResponse)}`)

  const result = await pollVideoResult(ctx, apiUrl, apiKey, taskId, timeout * 1000, Math.max(1000, Number(pollInterval) || 5000))
  const url = resolveVideoUrl(result) || await downloadVideoContent(ctx, apiUrl, apiKey, taskId)

  return [{
    kind: 'video',
    url,
    mime: 'video/mp4',
    meta: {
      taskId,
      model: result.model || model,
      status: result.status,
      progress: result.progress,
      size: result.size,
      seconds: result.seconds
    }
  }]
}

export const OpenAIVideoConnector: ConnectorDefinition = {
  id: 'openai-video',
  name: 'OpenAI Video',
  description: 'OpenAI/Sora-compatible 视频生成连接器，支持异步任务与 content 下载',
  icon: 'sora',
  supportedTypes: ['video'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2video', 'img2video'],
  generate,

  getRequestLog(config, files, prompt, parameters): ConnectorRequestLog {
    const { apiUrl, model, size, seconds, fps, enableImageInput = true } = config
    const inputImageUrls = enableImageInput ? getInputImageUrls(parameters) : []
    return {
      endpoint: resolveEndpoint(apiUrl, '/videos'),
      model,
      prompt,
      fileCount: files.filter(file => file.mime?.startsWith('image/')).length,
      parameters: {
        size,
        seconds: resolveDurationSeconds(config, parameters) ?? seconds,
        fps,
        imageInput: inputImageUrls.length > 0 || undefined
      }
    }
  }
}
