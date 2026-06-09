import { Context } from 'koishi'
import type { ConnectorDefinition, ConnectorRequestLog, FileData, OutputAsset } from '../../core'
import { connectorCardFields, connectorFields } from './config'

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function getInputImageUrls(parameters?: Record<string, any>): string[] {
  const urls = parameters?.inputFileUrls
  if (!Array.isArray(urls)) return []
  return urls.filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url))
}

function fileToDataUri(file: FileData): string {
  const base64 = Buffer.from(file.data).toString('base64')
  return `data:${file.mime};base64,${base64}`
}

function getInputImages(files: FileData[], parameters?: Record<string, any>): string[] {
  const imageFiles = files.filter(file => file.mime?.startsWith('image/'))
  if (imageFiles.length > 0) {
    return imageFiles.map(fileToDataUri)
  }
  return getInputImageUrls(parameters)
}

function appendNumber(target: Record<string, any>, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return
  const parsed = Number(value)
  if (Number.isFinite(parsed)) target[key] = parsed
}

function resolveDurationSeconds(parameters?: Record<string, any>): number | null {
  const seconds = Number(parameters?.videoDurationSeconds ?? parameters?.seconds ?? parameters?.duration)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function resolveNumFrames(config: Record<string, any>, parameters?: Record<string, any>): unknown {
  const seconds = resolveDurationSeconds(parameters)
  if (!seconds) return config.numFrames

  const frameRate = Number(config.frameRate) || 24
  const rawFrames = Math.max(1, Math.ceil(seconds * frameRate))
  return Math.ceil((rawFrames - 1) / 8) * 8 + 1
}

function normalizeStatus(status: unknown): string {
  return String(status || '').toLowerCase()
}

function resolveTaskId(response: any): string | null {
  return response?.id || response?.task_id || response?.taskId || null
}

function resolveVideoUrl(response: any): string | null {
  return response?.video_url || response?.url || response?.remixed_from_video_id || null
}

function buildRequestBody(
  config: Record<string, any>,
  prompt: string,
  inputImageUrls: string[],
  parameters?: Record<string, any>
): Record<string, any> {
  const {
    model,
    mode,
    width,
    height,
    numInferenceSteps,
    seed,
    frameRate,
    negativePrompt
  } = config

  const body: Record<string, any> = {
    model,
    prompt
  }

  appendNumber(body, 'width', width)
  appendNumber(body, 'height', height)
  appendNumber(body, 'num_frames', resolveNumFrames(config, parameters))
  appendNumber(body, 'num_inference_steps', numInferenceSteps)
  appendNumber(body, 'seed', seed)
  appendNumber(body, 'frame_rate', frameRate)
  if (negativePrompt) body.negative_prompt = negativePrompt

  if (inputImageUrls.length === 1 && mode !== 'keyframes') {
    body.image = inputImageUrls[0]
    if (mode) body.mode = mode
  } else if (inputImageUrls.length > 0) {
    body.extra_body = {
      image: inputImageUrls
    }
    if (mode) body.extra_body.mode = mode
  } else if (mode) {
    body.mode = mode
  }

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
  const startTime = Date.now()
  const resultUrl = `${stripTrailingSlash(apiUrl)}/${encodeURIComponent(taskId)}`

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))

    const response = await ctx.http.get(resultUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })

    const status = normalizeStatus(response?.status)
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      if (!resolveVideoUrl(response)) {
        throw new Error(`Agnes Video task completed but no video URL found: ${JSON.stringify(response)}`)
      }
      return response
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(`Agnes Video task failed: ${response?.error || response?.message || JSON.stringify(response)}`)
    }
  }

  throw new Error('Agnes Video task timeout')
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

  if (!model) {
    throw new Error('模型名称未配置')
  }

  const inputImageUrls = enableImageInput ? getInputImages(files, parameters) : []

  const requestBody = buildRequestBody(config, prompt, inputImageUrls, parameters)
  const response = await ctx.http.post(apiUrl, requestBody, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: timeout * 1000
  })

  const taskId = resolveTaskId(response)
  if (!taskId) {
    throw new Error(`Invalid Agnes Video response: ${JSON.stringify(response)}`)
  }

  const result = await pollVideoResult(
    ctx,
    apiUrl,
    apiKey,
    taskId,
    timeout * 1000,
    Math.max(1000, Number(pollInterval) || 5000)
  )

  const url = resolveVideoUrl(result)
  if (!url) {
    throw new Error(`Agnes Video task completed but no video URL found: ${JSON.stringify(result)}`)
  }

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
      seconds: result.seconds,
      usage: result.usage
    }
  }]
}

export const AgnesVideoConnector: ConnectorDefinition = {
  id: 'agnes-video',
  name: 'Agnes Video',
  description: 'Agnes Video V2.0 异步视频生成连接器，支持文生视频、图生视频、多图与关键帧',
  icon: 'agnes',
  supportedTypes: ['video'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2video', 'img2video'],
  generate,

  getRequestLog(config, files, prompt, parameters): ConnectorRequestLog {
    const {
      apiUrl,
      model,
      mode,
      width,
      height,
      numFrames,
      frameRate,
      enableImageInput = true
    } = config
    const inputImageUrls = enableImageInput ? getInputImages(files, parameters) : []

    return {
      endpoint: apiUrl?.split('?')[0],
      model,
      prompt,
      fileCount: files.filter(file => file.mime?.startsWith('image/')).length,
      parameters: {
        mode: mode || undefined,
        width,
        height,
        numFrames: resolveNumFrames(config, parameters) ?? numFrames,
        frameRate,
        inputImageUrls: inputImageUrls.length || undefined,
        inputFormat: inputImageUrls.some(url => url.startsWith('data:')) ? 'base64' : (inputImageUrls.length > 0 ? 'url' : undefined)
      }
    }
  }
}
