import type { Context } from 'koishi'
import type { ConnectorDefinition, ConnectorRequestLog, FileData, OutputAsset } from '../../core'
import { connectorCardFields, connectorFields } from './config'

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function resolveEndpoint(apiUrl: string, suffix: string): string {
  const baseUrl = stripTrailingSlash(apiUrl)
  if (/\/videos(?:\/[^/]+(?:\/content)?)?$/.test(baseUrl)) {
    return baseUrl.replace(/\/videos(?:\/[^/]+(?:\/content)?)?$/, suffix)
  }
  return `${baseUrl}${suffix}`
}

function resolveDurationSeconds(config: Record<string, any>, parameters?: Record<string, any>): unknown {
  return parameters?.duration ?? parameters?.seconds ?? parameters?.videoDurationSeconds ?? config.seconds
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
    headers: { Authorization: `Bearer ${apiKey}` },
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
      headers: { Authorization: `Bearer ${apiKey}` }
    })

    const status = normalizeStatus(response?.status)
    if (['completed', 'succeeded', 'success'].includes(status)) return response
    if (['failed', 'error', 'cancelled'].includes(status)) {
      throw new Error(`OpenAI Video task failed: ${response?.error?.message || response?.error || response?.message || status}`)
    }
  }

  throw new Error('OpenAI Video task timeout')
}

export function buildCreateForm(
  config: Record<string, any>,
  files: FileData[],
  prompt: string,
  parameters?: Record<string, any>
): FormData {
  const form = new FormData()
  form.append('model', String(parameters?.model ?? config.model))
  form.append('prompt', prompt)

  const resolution = parameters?.resolution ?? config.size
  const seconds = resolveDurationSeconds(config, parameters)
  if (resolution) form.append('size', String(resolution))
  if (seconds != null && seconds !== '') form.append('seconds', String(seconds))

  const imageFile = files.find(file => file.mime?.startsWith('image/'))
  if (imageFile) {
    const blob = new Blob([new Uint8Array(imageFile.data)], { type: imageFile.mime })
    form.append('input_reference', blob, imageFile.filename || 'reference.png')
  }

  return form
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

  if (!model) throw new Error('OpenAI video model is not configured.')
  if (!enableImageInput && files.some(file => file.mime?.startsWith('image/'))) {
    throw new Error('Image input is disabled for this channel.')
  }
  if (files.filter(file => file.mime?.startsWith('image/')).length > 1) {
    throw new Error('OpenAI Video accepts at most one input reference image.')
  }

  const createUrl = resolveEndpoint(apiUrl, '/videos')
  const createResponse = await ctx.http.post(
    createUrl,
    buildCreateForm(config, enableImageInput ? files : [], prompt, parameters),
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: timeout * 1000
    }
  )

  const taskId = resolveTaskId(createResponse)
  if (!taskId) throw new Error(`Invalid OpenAI Video response: ${JSON.stringify(createResponse)}`)

  const result = await pollVideoResult(
    ctx,
    apiUrl,
    apiKey,
    taskId,
    timeout * 1000,
    Math.max(1000, Number(pollInterval) || 5000)
  )
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
  description: 'Official OpenAI/Sora video generation API with input_reference support.',
  icon: 'sora',
  supportedTypes: ['video'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2video', 'img2video'],
  commandParameters: ['duration', 'resolution'],
  generate,

  getRequestLog(config, files, prompt, parameters): ConnectorRequestLog {
    return {
      endpoint: resolveEndpoint(config.apiUrl, '/videos'),
      model: parameters?.model ?? config.model,
      prompt,
      fileCount: files.filter(file => file.mime?.startsWith('image/')).length,
      parameters: {
        size: parameters?.resolution ?? config.size,
        seconds: resolveDurationSeconds(config, parameters),
        inputReference: files.some(file => file.mime?.startsWith('image/')) || undefined
      }
    }
  }
}
