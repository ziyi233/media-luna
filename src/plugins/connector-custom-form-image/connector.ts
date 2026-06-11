import { Context } from 'koishi'
import type { ConnectorDefinition, ConnectorRequestLog, FileData, OutputAsset } from '../../core'
import { connectorCardFields, connectorFields } from './config'

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function resolveUrl(baseUrl: string, value: string): string {
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value

  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return `${stripTrailingSlash(baseUrl)}/${value.replace(/^\/+/, '')}`
  }
}

function getResponseValue(response: any, fieldName: string): any {
  if (!response || !fieldName) return undefined
  return response[fieldName]
}

function parseJsonRecord(value: unknown, fieldName: string): Record<string, string> {
  if (!value || typeof value !== 'string' || !value.trim()) return {}

  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('must be a JSON object')
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, item]) => item !== undefined && item !== null)
        .map(([key, item]) => [key, String(item)])
    )
  } catch (error) {
    throw new Error(`${fieldName} 不是合法的 JSON 对象: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function buildBrowserLikeHeaders(apiUrl: string, config: Record<string, any>, extraHeaders: Record<string, string>): Record<string, string> {
  const target = new URL(apiUrl)
  const origin = target.origin
  const referer = `${origin}/`

  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': '*/*',
    'Accept-Language': config.acceptLanguage || 'zh-CN,zh;q=0.9,en-US;q=0.6,en;q=0.5',
    'Origin': origin,
    'Referer': referer,
    'User-Agent': config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0',
    ...extraHeaders
  }
}

async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    promptFieldName = 'prompt',
    negativePromptFieldName = 'negative_prompt',
    resolutionFieldName = 'resolution',
    resolution,
    negativePrompt,
    extraFormFields,
    responseImageField = 'image',
    responseFilenameField = 'filename',
    timeout = 180,
    extraHeaders
  } = config

  if (!apiUrl) {
    throw new Error('API URL 未配置')
  }

  if (files.length > 0) {
    throw new Error('该连接器暂不支持图片输入')
  }

  const formData = new URLSearchParams()
  formData.set(promptFieldName, prompt)
  if (negativePrompt) {
    formData.set(negativePromptFieldName, negativePrompt)
  }
  if (resolution) {
    formData.set(resolutionFieldName, resolution)
  }
  const parsedExtraFormFields = parseJsonRecord(extraFormFields, 'extraFormFields')
  for (const [key, value] of Object.entries(parsedExtraFormFields)) {
    formData.set(key, value)
  }

  const parsedExtraHeaders = parseJsonRecord(extraHeaders, 'extraHeaders')
  const headers = buildBrowserLikeHeaders(apiUrl, config, parsedExtraHeaders)

  const response = await ctx.http.post(apiUrl, formData.toString(), {
    headers,
    timeout: timeout * 1000,
    responseType: 'json'
  })

  const imageValue = getResponseValue(response, responseImageField)
  if (!imageValue || typeof imageValue !== 'string') {
    throw new Error(`响应中未找到图片字段: ${responseImageField}`)
  }

  const filename = getResponseValue(response, responseFilenameField)
  return [{
    kind: 'image',
    url: resolveUrl(apiUrl, imageValue),
    mime: 'image/png',
    meta: {
      filename: typeof filename === 'string' ? filename : undefined,
      rawResponse: response
    }
  }]
}

export const CustomFormImageConnector: ConnectorDefinition = {
  id: 'custom-form-image',
  name: 'Custom Form Image',
  description: '同步表单图片生成接口，适配 application/x-www-form-urlencoded 请求与相对图片路径返回',
  icon: 'default-image',
  supportedTypes: ['image'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2img'],
  generate,

  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const {
      apiUrl,
      userAgent,
      acceptLanguage,
      promptFieldName = 'prompt',
      negativePromptFieldName = 'negative_prompt',
      resolutionFieldName = 'resolution',
      resolution,
      negativePrompt,
      extraFormFields,
      extraHeaders
    } = config

    const parameters: Record<string, any> = {
      contentType: 'application/x-www-form-urlencoded',
      hasBrowserLikeHeaders: true,
      promptFieldName,
      negativePromptFieldName,
      resolutionFieldName
    }
    if (resolution) parameters.resolution = resolution
    if (negativePrompt) parameters.hasNegativePrompt = true
    if (userAgent) parameters.customUserAgent = true
    if (acceptLanguage) parameters.acceptLanguage = acceptLanguage
    if (extraFormFields) parameters.hasExtraFormFields = true
    if (extraHeaders) parameters.hasExtraHeaders = true

    return {
      endpoint: apiUrl?.split('?')[0],
      model: 'custom-form-image',
      prompt,
      fileCount: files.length,
      parameters
    }
  }
}
