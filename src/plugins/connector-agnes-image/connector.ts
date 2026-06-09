import { Context } from 'koishi'
import type { ConnectorDefinition, ConnectorRequestLog, FileData, OutputAsset } from '../../core'
import { connectorCardFields, connectorFields } from './config'

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

function buildExtraBody(config: Record<string, any>, inputImages: string[]): Record<string, any> | null {
  const extraBody: Record<string, any> = {}

  if (inputImages.length > 0) {
    extraBody.image = inputImages
  }

  if (config.responseFormat) {
    extraBody.response_format = config.responseFormat
  }

  return Object.keys(extraBody).length > 0 ? extraBody : null
}

function parseResponse(response: any): OutputAsset[] {
  const dataArray = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response)
      ? response
      : response?.data
        ? [response.data]
        : response?.url || response?.b64_json
          ? [response]
          : []

  if (dataArray.length === 0) {
    throw new Error('Invalid response from Agnes Image API: no data')
  }

  return dataArray.map((item: any): OutputAsset | null => {
    const url = item.url || item.image_url || item.output_url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined)
    if (!url) return null

    return {
      kind: 'image' as const,
      url,
      mime: 'image/png',
      meta: {
        revisedPrompt: item.revised_prompt
      }
    }
  }).filter((asset: OutputAsset | null): asset is OutputAsset => Boolean(asset))
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
    enableImageInput = true,
    timeout = 600
  } = config

  if (!model) {
    throw new Error('模型名称未配置')
  }

  const inputImages = enableImageInput ? getInputImages(files, parameters) : []

  const requestBody: Record<string, any> = {
    model,
    prompt
  }

  if (size) requestBody.size = size

  if (config.responseFormat === 'b64_json') {
    requestBody.return_base64 = true
  }

  const extraBody = buildExtraBody(config, inputImages)
  if (extraBody) requestBody.extra_body = extraBody

  const response = await ctx.http.post(apiUrl, requestBody, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: timeout * 1000
  })

  return parseResponse(response)
}

export const AgnesImageConnector: ConnectorDefinition = {
  id: 'agnes-image',
  name: 'Agnes Image',
  description: 'Agnes Image 2.1 Flash 图像生成连接器，支持 JSON 格式文生图与 URL 图生图',
  icon: 'agnes',
  supportedTypes: ['image'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2img', 'img2img'],
  generate,

  getRequestLog(config, files, prompt, parameters): ConnectorRequestLog {
    const {
      apiUrl,
      model,
      size,
      enableImageInput = true,
      responseFormat
    } = config

    const imageFileCount = enableImageInput
      ? files.filter(file => file.mime?.startsWith('image/')).length
      : 0
    const inputImages = enableImageInput ? getInputImages(files, parameters) : []

    const requestParameters: Record<string, any> = {}
    if (size) requestParameters.size = size
    if (responseFormat) requestParameters.responseFormat = responseFormat
    if (responseFormat === 'b64_json') requestParameters.returnBase64 = true
    if (inputImages.length > 0) {
      const hasDataUriInput = inputImages.some(image => image.startsWith('data:'))
      requestParameters.inputImages = inputImages.length
      requestParameters.inputFormat = hasDataUriInput ? 'base64' : 'url'
    }

    return {
      endpoint: apiUrl?.split('?')[0],
      model,
      prompt,
      fileCount: imageFileCount,
      parameters: requestParameters
    }
  }
}
