// DALL-E 连接器

import { Context } from 'koishi'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorRequestLog } from '../../core'
import { connectorFields, connectorCardFields } from './config'

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
    size,
    quality,
    style,
    n,
    enableImageInput = true,
    timeout = 600
  } = config

  if (!model) {
    throw new Error('模型名称未配置')
  }

  const imageFiles = enableImageInput
    ? files.filter(f => f.mime.startsWith('image/'))
    : []

  let actualApiMode = apiMode
  let actualApiUrl = apiUrl

  if (apiMode === 'auto') {
    const baseUrl = apiUrl.replace(/\/+$/, '')
    if (imageFiles.length > 0) {
      actualApiMode = 'edits'
      actualApiUrl = `${baseUrl}/v1/images/edits`
    } else {
      actualApiMode = 'generations'
      actualApiUrl = `${baseUrl}/v1/images/generations`
    }
  }

  // 根据模式选择请求方式
  if (actualApiMode === 'edits' && imageFiles.length > 0) {
    // edits 模式：使用 multipart/form-data
    return generateWithEdits(ctx, {
      apiUrl: actualApiUrl,
      apiKey,
      model,
      size,
      quality,
      style,
      n,
      timeout
    }, imageFiles[0], prompt)
  } else {
    // generations 模式：使用 JSON
    return generateWithGenerations(ctx, {
      apiUrl: actualApiUrl,
      apiKey,
      model,
      size,
      quality,
      style,
      n,
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
    size,
    quality,
    style,
    n,
    enableImageInput,
    timeout
  } = config

  const requestBody: Record<string, any> = {
    model,
    prompt
  }

  // 仅在配置了值时才添加参数
  if (n !== undefined && n !== null) requestBody.n = Number(n)
  if (size) requestBody.size = size
  if (quality) requestBody.quality = quality
  if (style) requestBody.style = style

  // 处理图片输入（JSON 模式下作为 base64 数组）
  if (enableImageInput && imageFiles.length > 0) {
    const imageArray: string[] = imageFiles.map(imageFile => {
      const base64 = Buffer.from(imageFile.data).toString('base64')
      return `data:${imageFile.mime};base64,${base64}`
    })
    requestBody.image = imageArray
    ctx.logger('media-luna').debug(`DALL-E generations: Added ${imageArray.length} reference image(s)`)
  }

  const response = await ctx.http.post(apiUrl, requestBody, {
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
  imageFile: FileData,
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    model,
    size,
    quality,
    style,
    n,
    timeout
  } = config

  // 构建 FormData
  const formData = new FormData()
  formData.append('model', model)
  formData.append('prompt', prompt)

  // 添加图片文件
  const imageBlob = new Blob([imageFile.data], { type: imageFile.mime })
  const ext = imageFile.mime.split('/')[1] || 'png'
  formData.append('image', imageBlob, `image.${ext}`)

  // 可选参数
  if (n !== undefined && n !== null) formData.append('n', String(n))
  if (size) formData.append('size', size)
  if (quality) formData.append('quality', quality)
  if (style) formData.append('style', style)

  ctx.logger('media-luna').debug(`DALL-E edits: Uploading image (${imageFile.data.byteLength} bytes)`)

  const response = await ctx.http.post(apiUrl, formData, {
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
      size,
      quality,
      style,
      n,
      enableImageInput = true
    } = config

    // 计算实际会发送的图片数量
    const imageCount = enableImageInput
      ? files.filter(f => f.mime?.startsWith('image/')).length
      : 0

    let actualApiMode = apiMode
    let actualApiUrl = apiUrl

    if (apiMode === 'auto') {
      const baseUrl = apiUrl?.replace(/\/+$/, '') || ''
      if (imageCount > 0) {
        actualApiMode = 'edits'
        actualApiUrl = `${baseUrl}/v1/images/edits`
      } else {
        actualApiMode = 'generations'
        actualApiUrl = `${baseUrl}/v1/images/generations`
      }
    }

    // 只记录实际配置的参数
    const parameters: Record<string, any> = {}
    parameters.apiMode = actualApiMode
    if (size) parameters.size = size
    if (quality) parameters.quality = quality
    if (style) parameters.style = style
    if (n !== undefined && n !== null) parameters.n = Number(n)
    if (imageCount > 0) parameters.imageInput = true

    return {
      endpoint: actualApiUrl?.split('?')[0],
      model,
      prompt,
      fileCount: imageCount,
      parameters
    }
  }
}
