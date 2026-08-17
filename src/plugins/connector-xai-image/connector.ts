import type { Context } from 'koishi'
import type {
  ConnectorDefinition,
  ConnectorRequestLog,
  FileData,
  OutputAsset
} from '../../core'
import { connectorCardFields, connectorFields } from './config'

export type XaiImageMode = 'generation' | 'edit'

const MAX_INPUT_IMAGES = 3
const MAX_INPUT_BYTES = 20 * 1024 * 1024
const ASPECT_RATIOS = new Set([
  '1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2',
  '9:19.5', '19.5:9', '9:20', '20:9', '1:2', '2:1', 'auto'
])
const RESOLUTIONS = new Set(['1k', '2k'])
const QUALITIES = new Set(['low', 'medium'])
const RESPONSE_FORMATS = new Set(['url', 'b64_json'])
const INPUT_MIME_TYPES = new Map([
  ['image/jpeg', 'image/jpeg'],
  ['image/jpg', 'image/jpeg'],
  ['image/png', 'image/png'],
  ['image/webp', 'image/webp']
])

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function resolveXaiImageEndpoint(apiUrl: string, mode: XaiImageMode): string {
  const base = stripTrailingSlash(apiUrl || 'https://api.x.ai/v1')
  const endpointMode = mode === 'generation' ? 'generations' : 'edits'

  if (/\/images\/(generations|edits)$/i.test(base)) {
    return base.replace(/\/images\/(generations|edits)$/i, `/images/${endpointMode}`)
  }
  if (/\/v1$/i.test(base)) return `${base}/images/${endpointMode}`
  return `${base}/v1/images/${endpointMode}`
}

function normalizeInputMime(file: FileData): string {
  const mime = String(file.mime || '').split(';', 1)[0].trim().toLowerCase()
  const normalized = INPUT_MIME_TYPES.get(mime)
  if (!normalized) {
    throw new Error(`xAI 图片编辑不支持“${file.mime || '未知'}”格式，仅接受 JPEG、PNG 或 WebP。`)
  }
  return normalized
}

function validateInputFiles(files: FileData[]): void {
  if (files.length > MAX_INPUT_IMAGES) {
    throw new Error(`xAI 图片编辑最多接受 ${MAX_INPUT_IMAGES} 张输入图片，当前收到 ${files.length} 张。`)
  }

  files.forEach((file, index) => {
    normalizeInputMime(file)
    if (file.data.byteLength > MAX_INPUT_BYTES) {
      throw new Error(`第 ${index + 1} 张输入图片超过 20 MiB 限制。`)
    }
  })
}

function fileToDataUri(file: FileData): string {
  const mime = normalizeInputMime(file)
  return `data:${mime};base64,${Buffer.from(file.data).toString('base64')}`
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).trim()
  return normalized || undefined
}

function enumValue(
  value: unknown,
  fallback: unknown,
  allowed: Set<string>,
  label: string
): string {
  const normalized = String(value ?? fallback).trim().toLowerCase()
  if (!allowed.has(normalized)) throw new Error(`不支持的${label}“${value ?? fallback}”。`)
  return normalized
}

function integerInRange(value: unknown, fallback: unknown, min: number, max: number, label: string): number {
  const parsed = Number(value ?? fallback)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label}必须是 ${min} 到 ${max} 之间的整数。`)
  }
  return parsed
}

export interface XaiImageRequest {
  endpoint: string
  mode: XaiImageMode
  body: Record<string, any>
}

export function buildXaiImageRequest(
  apiUrl: string,
  config: Record<string, any>,
  files: FileData[],
  prompt: string,
  parameters: Record<string, any> = {}
): XaiImageRequest {
  if (!prompt?.trim()) throw new Error('xAI 图片生成需要提示词。')
  validateInputFiles(files)

  const mode: XaiImageMode = files.length > 0 ? 'edit' : 'generation'
  const model = optionalString(parameters.model) || optionalString(config.model) || 'grok-imagine-image-2.0'
  const resolution = enumValue(parameters.resolution, config.resolution ?? '1k', RESOLUTIONS, '分辨率')
  const count = integerInRange(parameters.count, config.count ?? 1, 1, 10, '生成数量')
  const responseFormat = enumValue(config.responseFormat, 'url', RESPONSE_FORMATS, '响应格式')
  const explicitAspectRatio = optionalString(parameters.aspectRatio)
  const aspectRatio = mode === 'edit'
    ? explicitAspectRatio
    : explicitAspectRatio || optionalString(config.aspectRatio) || 'auto'

  if (aspectRatio && !ASPECT_RATIOS.has(aspectRatio.toLowerCase())) {
    throw new Error(`不支持的宽高比“${aspectRatio}”。`)
  }

  const body: Record<string, any> = {
    model,
    prompt: prompt.trim(),
    n: count,
    resolution,
    response_format: responseFormat
  }
  if (aspectRatio) body.aspect_ratio = aspectRatio.toLowerCase()

  if (mode === 'generation') {
    const quality = optionalString(parameters.quality) || optionalString(config.quality)
    if (quality) {
      const normalizedQuality = quality.toLowerCase()
      if (!QUALITIES.has(normalizedQuality)) throw new Error(`不支持的生成质量“${quality}”。`)
      body.quality = normalizedQuality
    }
  } else {
    if (optionalString(parameters.quality)) {
      throw new Error('xAI 图片编辑接口尚未声明 quality 参数，请移除 -q/--quality。')
    }
    const inputs = files.map(file => ({ url: fileToDataUri(file) }))
    if (inputs.length === 1) body.image = inputs[0]
    else body.images = inputs
  }

  return {
    endpoint: resolveXaiImageEndpoint(apiUrl, mode),
    mode,
    body
  }
}

function resolveOutputMime(item: any): string {
  const declared = String(item?.mime_type || item?.mime || '').toLowerCase()
  if (declared === 'image/jpg') return 'image/jpeg'
  if (declared.startsWith('image/')) return declared

  const url = String(item?.file_output?.public_url || item?.url || '').toLowerCase()
  if (/\.png(?:$|[?#])/.test(url)) return 'image/png'
  if (/\.webp(?:$|[?#])/.test(url)) return 'image/webp'
  return 'image/jpeg'
}

function resolveApiError(response: any): string | null {
  const error = response?.error
  if (!error) return null
  if (typeof error === 'string') return error
  return error.message || error.code || JSON.stringify(error)
}

export function parseXaiImageResponse(response: any): OutputAsset[] {
  const apiError = resolveApiError(response)
  if (apiError) throw new Error(`xAI 图片请求失败：${apiError}`)
  if (response?.respect_moderation === false) throw new Error('xAI 图片因未通过内容审核而被拒绝。')

  if (!Array.isArray(response?.data) || response.data.length === 0) {
    throw new Error('xAI 图片响应中没有生成结果。')
  }

  return response.data.map((item: any, index: number): OutputAsset => {
    if (item?.error) {
      const message = typeof item.error === 'string' ? item.error : item.error.message || JSON.stringify(item.error)
      throw new Error(`xAI 第 ${index + 1} 张图片生成失败：${message}`)
    }
    if (item?.respect_moderation === false) {
      throw new Error(`xAI 第 ${index + 1} 张图片因未通过内容审核而被拒绝。`)
    }

    const mime = resolveOutputMime(item)
    const persistentUrl = item?.file_output?.public_url
    const temporaryUrl = item?.url
    const url = persistentUrl || temporaryUrl || (item?.b64_json
      ? `data:${mime};base64,${item.b64_json}`
      : undefined)
    if (!url) throw new Error(`xAI 第 ${index + 1} 张图片响应中没有 URL 或 Base64 数据。`)

    return {
      kind: 'image',
      url,
      mime,
      meta: {
        model: response.model,
        revisedPrompt: item.revised_prompt,
        respectModeration: item.respect_moderation ?? response.respect_moderation,
        usage: response.usage,
        fileId: item.file_output?.file_id,
        filename: item.file_output?.filename,
        publicUrl: persistentUrl,
        publicUrlExpiresAt: item.file_output?.public_url_expires_at,
        temporaryUrl: Boolean(temporaryUrl && !persistentUrl)
      }
    }
  })
}

async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string,
  parameters?: Record<string, any>
): Promise<OutputAsset[]> {
  const apiUrl = config.apiUrl || 'https://api.x.ai/v1'
  const apiKey = optionalString(config.apiKey)
  if (!apiKey) throw new Error('尚未配置 xAI API 密钥。')
  const timeout = integerInRange(config.timeout, 600, 1, 86400, '超时时间')
  const request = buildXaiImageRequest(apiUrl, config, files, prompt, parameters)
  const response = await ctx.http.post(request.endpoint, request.body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: timeout * 1000
  })

  return parseXaiImageResponse(response)
}

export const XaiImageConnector: ConnectorDefinition = {
  id: 'xai-image',
  name: 'xAI Grok Imagine Image',
  description: '支持 Grok Imagine 文生图、单图编辑和最多三张参考图的多图编辑。',
  supportedTypes: ['image'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2img'],
  commandParameters: ['resolution', 'aspectRatio', 'quality', 'count'],
  generate,

  getRequestLog(config, files, prompt, parameters): ConnectorRequestLog {
    try {
      const request = buildXaiImageRequest(config.apiUrl, config, files, prompt, parameters)
      return {
        endpoint: request.endpoint,
        model: request.body.model,
        prompt,
        fileCount: files.length,
        parameters: {
          mode: request.mode,
          count: request.body.n,
          resolution: request.body.resolution,
          aspectRatio: request.body.aspect_ratio,
          quality: request.body.quality,
          responseFormat: request.body.response_format
        }
      }
    } catch {
      const mode: XaiImageMode = files.length > 0 ? 'edit' : 'generation'
      return {
        endpoint: resolveXaiImageEndpoint(config.apiUrl, mode),
        model: config.model,
        prompt,
        fileCount: files.length,
        parameters: { mode }
      }
    }
  },

  getResponseLog(output) {
    return {
      outputCount: output.length,
      outputTypes: output.map(item => item.kind),
      meta: {
        model: output[0]?.meta?.model,
        usage: output[0]?.meta?.usage,
        temporaryUrls: output.filter(item => item.meta?.temporaryUrl).length
      }
    }
  }
}
