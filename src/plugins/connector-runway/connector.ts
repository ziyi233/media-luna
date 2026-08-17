import type { Context } from 'koishi'
import type { ConnectorDefinition, ConnectorRequestLog, FileData, OutputAsset } from '../../core'
import { connectorFields, connectorCardFields } from './config'

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function fileToDataUri(file: FileData): string {
  return `data:${file.mime};base64,${Buffer.from(file.data).toString('base64')}`
}

function normalizeRatio(value: unknown): string | undefined {
  if (!value) return undefined
  const aliases: Record<string, string> = {
    '16:9': '1280:720',
    '9:16': '720:1280',
    '1:1': '960:960'
  }
  return aliases[String(value)] || String(value)
}

function normalizeMode(value: unknown, hasImage: boolean): 'text' | 'image' {
  const mode = String(value || 'auto').toLowerCase()
  if (mode === 'auto') return hasImage ? 'image' : 'text'
  if (['image', 'image2video', 'img2video', 'i2v'].includes(mode)) return 'image'
  if (['text', 'text2video', 't2v'].includes(mode)) return 'text'
  throw new Error('Runway mode must be auto, text, or image.')
}

interface RunwayRequest {
  endpoint: string
  body: Record<string, any>
  mode: 'text' | 'image'
}

export function buildRunwayRequest(
  config: Record<string, any>,
  files: FileData[],
  prompt: string,
  parameters: Record<string, any> = {}
): RunwayRequest {
  const images = files.filter(file => file.mime?.startsWith('image/'))
  if (images.length > 1) throw new Error('Runway accepts at most one prompt image.')
  const mode = normalizeMode(parameters.mode ?? config.mode, images.length > 0)
  if (mode === 'image' && images.length !== 1) throw new Error('Runway image mode requires one image.')
  if (mode === 'text' && images.length > 0) throw new Error('Runway text mode does not accept an image.')

  const body: Record<string, any> = {
    model: parameters.model ?? config.model,
    promptText: prompt
  }
  const duration = parameters.duration ?? parameters.seconds ?? config.duration
  const ratio = normalizeRatio(parameters.resolution ?? parameters.aspectRatio ?? config.ratio ?? config.aspectRatio)
  const seed = parameters.seed ?? config.seed
  if (duration != null && duration !== '') body.duration = Number(duration)
  if (ratio) body.ratio = ratio
  if (seed != null && seed !== '') body.seed = Number(seed)
  if (mode === 'image') body.promptImage = fileToDataUri(images[0])

  const baseUrl = stripTrailingSlash(config.apiUrl || 'https://api.dev.runwayml.com/v1')
  return {
    endpoint: `${baseUrl}/${mode === 'image' ? 'image_to_video' : 'text_to_video'}`,
    body,
    mode
  }
}

async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string,
  parameters?: Record<string, any>
): Promise<OutputAsset[]> {
  const { apiKey, timeout = 600, pollInterval = 5000 } = config
  if (!config.model) throw new Error('Runway model is not configured.')

  const request = buildRunwayRequest(config, files, prompt, parameters)
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': config.apiVersion || '2024-11-06'
  }
  const created = await ctx.http.post(request.endpoint, request.body, { headers })
  const taskId = created?.id || created?.taskId
  if (!taskId) throw new Error(`Invalid Runway response: ${JSON.stringify(created)}`)

  const baseUrl = stripTrailingSlash(config.apiUrl || 'https://api.dev.runwayml.com/v1')
  const startedAt = Date.now()
  while (Date.now() - startedAt < Number(timeout) * 1000) {
    await new Promise(resolve => setTimeout(resolve, Math.max(1000, Number(pollInterval) || 5000)))
    const result = await ctx.http.get(`${baseUrl}/tasks/${encodeURIComponent(taskId)}`, { headers })
    const status = String(result?.status || '').toUpperCase()

    if (status === 'SUCCEEDED') {
      const url = result.output?.[0] || result.url
      if (!url) throw new Error('Runway task succeeded without an output URL.')
      return [{
        kind: 'video',
        url,
        mime: 'video/mp4',
        meta: {
          taskId,
          model: request.body.model,
          mode: request.mode,
          duration: request.body.duration,
          ratio: request.body.ratio
        }
      }]
    }
    if (['FAILED', 'CANCELLED'].includes(status)) {
      throw new Error(`Runway task failed: ${result?.failure || result?.failureReason || status}`)
    }
  }

  throw new Error('Runway task timeout')
}

export const RunwayConnector: ConnectorDefinition = {
  id: 'runway',
  name: 'Runway',
  description: 'Official Runway text-to-video and image-to-video API.',
  icon: 'runway',
  supportedTypes: ['video'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2video', 'img2video'],
  commandParameters: ['mode', 'duration', 'resolution', 'aspectRatio', 'seed'],
  generate,

  getRequestLog(config, files, prompt, parameters): ConnectorRequestLog {
    const request = buildRunwayRequest(config, files, prompt, parameters)
    return {
      endpoint: request.endpoint,
      model: request.body.model,
      prompt,
      fileCount: files.length,
      parameters: {
        mode: request.mode,
        duration: request.body.duration,
        ratio: request.body.ratio,
        seed: request.body.seed
      }
    }
  }
}
