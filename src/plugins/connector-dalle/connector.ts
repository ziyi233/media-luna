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

/**
 * 取 storage-input 中间件上传后、与图片输入对应的公开 URL（R2/S3 等）。
 * storage-input 按输入文件顺序上传（跳过空文件），仅当 URL 数量与非空
 * 文件数一致时才能建立一一对应；对不上时返回空数组回退 multipart，
 * 避免把视频/音频等非图片文件的 URL 发给 edits 接口
 */
function getInputImageUrls(files: FileData[], parameters?: Record<string, any>): string[] {
  const urls = parameters?.inputFileUrls
  if (!Array.isArray(urls) || urls.length === 0) return []
  const nonEmptyFiles = files.filter(f => f.data && f.data.byteLength > 0)
  if (urls.length !== nonEmptyFiles.length) return []
  const imageUrls: string[] = []
  for (let i = 0; i < nonEmptyFiles.length; i++) {
    const url = urls[i]
    if (nonEmptyFiles[i].mime?.startsWith('image/') && typeof url === 'string' && /^https?:\/\//i.test(url)) {
      imageUrls.push(url)
    }
  }
  return imageUrls
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
  prompt: string,
  parameters?: Record<string, any>
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    model,
    apiMode = 'generations',
    autoUseEditsForImageInput = false,
    imageInputMode = 'base64',
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
    // imageInputMode 为 url 时优先使用 storage-input 上传后的公开 URL 走
    // JSON edits（部分上游如 xAI 不接受 base64/multipart，只认公网 URL 或
    // file_id）；默认 base64 保持 multipart/form-data（OpenAI 官方兼容）
    const inputUrls = imageInputMode === 'url' ? getInputImageUrls(files, parameters) : []
    if (inputUrls.length > 0) {
      return generateWithEditsJson(ctx, {
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
      }, inputUrls, prompt)
    }
    // 无公开 URL 时回退 multipart/form-data（兼容 OpenAI 官方 edits 等上游）
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

/** edits 模式（公开 URL 版）：JSON 格式请求，图片以 { type: 'image_url', url } 引用 */
async function generateWithEditsJson(
  ctx: Context,
  config: Record<string, any>,
  imageUrls: string[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    model,
    inputFidelity,
    timeout
  } = config

  const requestBody: Record<string, any> = {
    model,
    prompt
  }

  // 单图用 image（对象），多图用 images（数组），与 xAI Grok Imagine 的
  // /v1/images/edits 接口一致（单图对象 / 多图数组）
  if (imageUrls.length === 1) {
    requestBody.image = { type: 'image_url', url: imageUrls[0] }
  } else if (imageUrls.length > 1) {
    requestBody.images = imageUrls.map(url => ({ type: 'image_url', url }))
  }

  // 仅在配置了值时才添加参数
  applyCommonParams(requestBody, config)
  // applyCommonParams 不处理 inputFidelity，这里与 multipart 路径保持一致
  if (inputFidelity) requestBody.input_fidelity = inputFidelity

  const endpoint = resolveEndpoint(apiUrl, 'edits')
  const response = await ctx.http.post(endpoint, requestBody, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
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
      imageInputMode = 'base64',
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
    if (imageInputMode === 'url') parameters.imageInputMode = imageInputMode
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
