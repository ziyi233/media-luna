// DALL-E 连接器

import { Context } from 'koishi'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorRequestLog } from '../../core'
import { connectorFields, connectorCardFields } from './config'

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function resolveEndpoint(apiUrl: string, mode: 'generations' | 'edits'): string {
  const trimmed = stripTrailingSlash(apiUrl)
  if (/\/images\/(generations|edits)$/.test(trimmed)) {
    return trimmed.replace(/\/images\/(generations|edits)$/, `/images/${mode}`)
  }
  return `${trimmed}/images/${mode}`
}

function shouldUseEditsMode(apiMode: string, autoUseEditsForImageInput: boolean, imageFiles: FileData[]): boolean {
  if (autoUseEditsForImageInput && imageFiles.length > 0) return true
  return apiMode === 'edits' && imageFiles.length > 0
}

function applyCommonParams(target: Record<string, any>, config: Record<string, any>): void {
  const {
    n,
    size,
    quality,
    style,
    background,
    outputFormat,
    outputCompression,
    moderation,
    user
  } = config

  if (n !== undefined && n !== null) target.n = Number(n)
  if (size) target.size = size
  if (quality) target.quality = quality
  if (style) target.style = style
  if (background) target.background = background
  if (outputFormat) target.output_format = outputFormat
  if (outputCompression !== undefined && outputCompression !== null && outputCompression !== '') {
    target.output_compression = Number(outputCompression)
  }
  if (moderation) target.moderation = moderation
  if (user) target.user = user
}

function appendOptionalFormField(formData: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return
  formData.append(key, String(value))
}

/** DALL-E 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    model,
    apiMode = 'generations',
    autoUseEditsForImageInput = false,
    size,
    quality,
    style,
    n,
    background,
    outputFormat,
    outputCompression,
    moderation,
    inputFidelity,
    user,
    enableImageInput = true,
    timeout = 600
  } = config

  if (!model) {
    throw new Error('模型名称未配置')
  }

  const imageFiles = enableImageInput
    ? files.filter(f => f.mime.startsWith('image/'))
    : []

  const useEditsMode = shouldUseEditsMode(apiMode, autoUseEditsForImageInput, imageFiles)

  // 根据模式选择请求方式
  if (useEditsMode) {
    // edits 模式：使用 multipart/form-data
    return generateWithEdits(ctx, {
      apiUrl,
      apiKey,
      model,
      size,
      quality,
      style,
      n,
      background,
      outputFormat,
      outputCompression,
      moderation,
      inputFidelity,
      user,
      timeout
    }, imageFiles, prompt)
  } else {
    // generations 模式：使用 JSON
    return generateWithGenerations(ctx, {
      apiUrl,
      apiKey,
      model,
      size,
      quality,
      style,
      n,
      background,
      outputFormat,
      outputCompression,
      moderation,
      user,
      enableImageInput,
      timeout
    }, imageFiles, prompt)
  }
}

/** generations 模式：JSON 格式请求 */
async function generateWithGenerations(
  ctx: Context,
  config: Record<string, any>,
  imageFiles: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    model,
    timeout
  } = config

  const requestBody: Record<string, any> = {
    model,
    prompt
  }

  // 仅在配置了值时才添加参数
  applyCommonParams(requestBody, config)

  const endpoint = resolveEndpoint(apiUrl, 'generations')
  const response = await ctx.http.post(endpoint, requestBody, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: timeout * 1000
  })

  return parseResponse(response)
}

/** edits 模式：multipart/form-data 格式请求 */
async function generateWithEdits(
  ctx: Context,
  config: Record<string, any>,
  imageFiles: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    model,
    timeout
  } = config

  // 构建 FormData
  const formData = new FormData()
  formData.append('model', model)
  formData.append('prompt', prompt)

  // 添加图片文件，兼容 OpenAI 当前 image[] 形式
  for (const imageFile of imageFiles) {
    const imageBlob = new Blob([imageFile.data], { type: imageFile.mime })
    const ext = imageFile.mime.split('/')[1] || 'png'
    formData.append('image[]', imageBlob, `image.${ext}`)
  }

  // 可选参数
  appendOptionalFormField(formData, 'n', config.n)
  appendOptionalFormField(formData, 'size', config.size)
  appendOptionalFormField(formData, 'quality', config.quality)
  appendOptionalFormField(formData, 'style', config.style)
  appendOptionalFormField(formData, 'background', config.background)
  appendOptionalFormField(formData, 'output_format', config.outputFormat)
  appendOptionalFormField(formData, 'output_compression', config.outputCompression)
  appendOptionalFormField(formData, 'moderation', config.moderation)
  appendOptionalFormField(formData, 'input_fidelity', config.inputFidelity)
  appendOptionalFormField(formData, 'user', config.user)

  const totalBytes = imageFiles.reduce((sum, imageFile) => sum + imageFile.data.byteLength, 0)
  ctx.logger('media-luna').debug(`DALL-E edits: Uploading ${imageFiles.length} image(s) (${totalBytes} bytes)`) 

  const endpoint = resolveEndpoint(apiUrl, 'edits')
  const response = await ctx.http.post(endpoint, formData, {
    headers: {
      'Authorization': `Bearer ${apiKey}`
      // Content-Type 由 FormData 自动设置
    },
    timeout: timeout * 1000
  })

  return parseResponse(response)
}

/** 解析响应 */
function parseResponse(response: any): OutputAsset[] {
  if (!response.data || !Array.isArray(response.data)) {
    throw new Error('Invalid response from DALL-E API')
  }

  return response.data.map((item: any) => {
    let url: string
    if (item.url) {
      url = item.url
    } else if (item.b64_json) {
      url = `data:image/png;base64,${item.b64_json}`
    } else {
      throw new Error('No image data in response')
    }

    return {
      kind: 'image' as const,
      url,
      mime: 'image/png',
      meta: {
        revisedPrompt: item.revised_prompt
      }
    }
  })
}

/** DALL-E 连接器定义 */
export const DalleConnector: ConnectorDefinition = {
  id: 'dalle',
  name: 'DALL-E',
  description: 'OpenAI 图像生成模型，支持 DALL-E 3 高质量图像创作',
  icon: 'dalle',
  supportedTypes: ['image'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2img', 'img2img'],
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const {
      apiUrl,
      model,
      apiMode = 'generations',
      autoUseEditsForImageInput = false,
      size,
      quality,
      style,
      n,
      background,
      outputFormat,
      outputCompression,
      moderation,
      inputFidelity,
      user,
      enableImageInput = true
    } = config

    // 计算实际会发送的图片数量
    const imageCount = enableImageInput
      ? files.filter(f => f.mime?.startsWith('image/')).length
      : 0

    const resolvedMode = shouldUseEditsMode(apiMode, autoUseEditsForImageInput, enableImageInput
      ? files.filter(f => f.mime?.startsWith('image/'))
      : []) ? 'edits' : 'generations'

    // 只记录实际配置的参数
    const parameters: Record<string, any> = {}
    parameters.apiMode = apiMode
    parameters.resolvedMode = resolvedMode
    if (autoUseEditsForImageInput) parameters.autoUseEditsForImageInput = true
    if (size) parameters.size = size
    if (quality) parameters.quality = quality
    if (style) parameters.style = style
    if (n !== undefined && n !== null) parameters.n = Number(n)
    if (background) parameters.background = background
    if (outputFormat) parameters.outputFormat = outputFormat
    if (outputCompression !== undefined && outputCompression !== null && outputCompression !== '') {
      parameters.outputCompression = Number(outputCompression)
    }
    if (moderation) parameters.moderation = moderation
    if (inputFidelity && resolvedMode === 'edits') parameters.inputFidelity = inputFidelity
    if (user) parameters.user = user
    if (imageCount > 0) parameters.imageInput = true

    return {
      endpoint: resolveEndpoint(apiUrl, resolvedMode),
      model,
      prompt,
      fileCount: imageCount,
      parameters
    }
  }
}
