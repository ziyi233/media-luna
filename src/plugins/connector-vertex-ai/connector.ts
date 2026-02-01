// Vertex AI 连接器

import { Context } from 'koishi'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorRequestLog } from '../../core'
import { connectorFields, connectorCardFields } from './config'

/** Vertex AI 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const logger = ctx.logger('media-luna')

  const {
    apiEndpoint,
    apiKey,
    model,
    numberOfImages,
    aspectRatio,
    imageSize,
    outputMimeType,
    forceImageOutput,
    enableGoogleSearch,
    thinkingLevel,
    includeThoughts,
    filterThoughtImages,
    textOnlyAsSuccess,
    safetyLevel,
    personGeneration,
    timeout
  } = config

  if (!apiEndpoint) {
    throw new Error('API Endpoint 未配置')
  }
  if (!apiKey) {
    throw new Error('API Key 未配置')
  }
  if (!model) {
    throw new Error('模型未配置')
  }

  // 构建端点 URL
  // 格式: https://${API_ENDPOINT}/v1/publishers/google/models/${MODEL_ID}:generateContent?key=${API_KEY}
  const baseEndpoint = apiEndpoint.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const endpoint = `https://${baseEndpoint}/v1/publishers/google/models/${model}:generateContent?key=${apiKey}`

  // 构建请求体
  const parts: any[] = []

  // 添加输入图片
  for (const file of files) {
    if (file.data) {
      let base64Data: string
      if (typeof file.data === 'string') {
        base64Data = file.data
      } else {
        const buffer = Buffer.from(file.data)
        base64Data = buffer.toString('base64')
      }

      parts.push({
        inlineData: {
          mimeType: file.mime || 'image/png',
          data: base64Data
        }
      })
    }
  }

  // 添加文本提示
  parts.push({ text: prompt })

  const requestBody: any = {
    contents: [{ role: 'user', parts }],
    generationConfig: {}
  }

  // responseModalities
  if (forceImageOutput) {
    requestBody.generationConfig.responseModalities = ['TEXT', 'IMAGE']
  }

  // imageConfig
  const imageConfig: Record<string, any> = {}
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio
  if (imageSize) imageConfig.imageSize = imageSize
  if (outputMimeType) {
    imageConfig.imageOutputOptions = { mimeType: outputMimeType }
  }
  if (personGeneration) imageConfig.personGeneration = personGeneration
  if (Object.keys(imageConfig).length > 0) {
    requestBody.generationConfig.imageConfig = imageConfig
  }

  // candidateCount
  if (numberOfImages !== undefined && numberOfImages !== null && numberOfImages > 1) {
    requestBody.generationConfig.candidateCount = Number(numberOfImages)
  }

  // thinkingConfig
  if (thinkingLevel || includeThoughts) {
    const thinkingConfig: Record<string, any> = {}
    if (thinkingLevel) thinkingConfig.thinkingLevel = thinkingLevel
    if (includeThoughts) thinkingConfig.includeThoughts = true
    requestBody.generationConfig.thinkingConfig = thinkingConfig
  }

  // Google Search
  if (enableGoogleSearch) {
    requestBody.tools = [{ googleSearch: {} }]
  }

  // safetySettings
  if (safetyLevel) {
    const categories = [
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_HARASSMENT'
    ]
    requestBody.safetySettings = categories.map(category => ({
      category,
      threshold: safetyLevel
    }))
  }

  try {
    const response = await ctx.http.post(endpoint, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: (timeout || 600) * 1000
    })

    const assets: OutputAsset[] = []
    const candidates = response.candidates || []

    // 调试统计
    let totalParts = 0
    let thoughtParts = 0
    let imageParts = 0

    for (const candidate of candidates) {
      const parts = candidate.content?.parts || []

      for (const part of parts) {
        totalParts++
        if (part.thought) thoughtParts++
        if (part.inlineData) imageParts++

        // 过滤思考过程
        const shouldFilterThought = (filterThoughtImages ?? true) && part.thought
        if (shouldFilterThought) {
          continue
        }

        // 处理图片
        if (part.inlineData) {
          const mimeType = part.inlineData.mimeType || 'image/png'
          const base64Data = part.inlineData.data

          assets.push({
            kind: 'image',
            url: `data:${mimeType};base64,${base64Data}`,
            mime: mimeType,
            meta: {
              model,
              aspectRatio,
              isThought: part.thought || false
            }
          })
        }

        // 处理文本
        if (part.text) {
          assets.push({
            kind: 'text',
            content: part.text,
            meta: {
              model,
              isThought: part.thought || false
            }
          })
        }
      }
    }

    logger.debug('[vertex-ai] Response: totalParts=%d, thoughtParts=%d, imageParts=%d, assets=%d',
      totalParts, thoughtParts, imageParts, assets.length
    )

    if (assets.length === 0) {
      throw new Error('No content generated in response')
    }

    // 检查是否只有文字输出
    const hasMedia = assets.some(a => a.kind === 'image' || a.kind === 'video' || a.kind === 'audio')
    const hasTextOnly = !hasMedia && assets.some(a => a.kind === 'text')

    if (hasTextOnly && !textOnlyAsSuccess) {
      const textContent = assets
        .filter(a => a.kind === 'text')
        .map(a => a.content)
        .join('\n')
      throw new Error(`模型返回纯文字（无图片）: ${textContent.substring(0, 200)}${textContent.length > 200 ? '...' : ''}`)
    }

    return assets

  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Vertex AI error: ${error.message}`)
    }
    throw error
  }
}

/** Vertex AI 连接器定义 */
export const VertexAIConnector: ConnectorDefinition = {
  id: 'vertex-ai',
  name: 'Google Vertex AI',
  description: 'Google Vertex AI API，支持 Gemini 模型图像生成',
  icon: 'vertexai',
  supportedTypes: ['image'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2img', 'img2img'],
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const { apiEndpoint, model, numberOfImages, aspectRatio, imageSize, enableGoogleSearch } = config

    const parameters: Record<string, any> = {}
    if (numberOfImages !== undefined && numberOfImages !== null && numberOfImages > 1) {
      parameters.numberOfImages = Number(numberOfImages)
    }
    if (aspectRatio) parameters.aspectRatio = aspectRatio
    if (imageSize) parameters.imageSize = imageSize
    if (enableGoogleSearch) parameters.googleSearch = true

    return {
      endpoint: apiEndpoint,
      model,
      prompt,
      fileCount: files.length,
      parameters
    }
  }
}
