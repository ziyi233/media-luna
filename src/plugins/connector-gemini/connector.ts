// Gemini 连接器

import { Context } from 'koishi'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorRequestLog } from '../../core'
import { connectorFields, connectorCardFields } from './config'

function normalizeImageSize(imageSize: unknown): string | undefined {
  if (imageSize === undefined || imageSize === null) return undefined
  const raw = String(imageSize).trim()
  if (!raw) return undefined

  const kMatch = raw.match(/^(\d+(?:\.\d+)?)\s*[kK]$/)
  if (kMatch) {
    const normalized = Number(kMatch[1])
    if (!Number.isNaN(normalized)) {
      return `${normalized}K`
    }
  }

  return raw
}

/** Gemini 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const logger = ctx.logger('media-luna')

  // 调试：打印原始配置中的 filterThoughtImages
  logger.debug('[gemini] config.filterThoughtImages raw value: %o (type: %s)',
    config.filterThoughtImages,
    typeof config.filterThoughtImages
  )

  // 从 config 中获取配置（默认值由前端字段定义提供，保存时已填充）
  const {
    apiUrl,
    apiKey,
    model,
    numberOfImages,
    aspectRatio,
    imageSize,
    outputMimeType,
    forceImageOutput,
    enableGoogleSearch,
    enableGoogleImageSearch,
    exposeGroundingSources,
    thinkingLevel,
    includeThoughts,
    filterThoughtImages,
    textOnlyAsSuccess,
    safetyLevel,
    personGeneration,
    timeout
  } = config
  const normalizedImageSize = normalizeImageSize(imageSize)

  // 调试：打印解构后的值
  logger.debug('[gemini] filterThoughtImages after destructure: %o', filterThoughtImages)

  if (!model) {
    throw new Error('模型未配置')
  }

  // 构建完整 API Endpoint（兼容旧数据，提供后备默认值）
  const baseUrl = (apiUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
  // 如果用户填写了带 /v1beta 的路径，则直接使用
  // 否则根据模型名称自动拼接路径
  const version = 'v1beta'
  const endpointBase = baseUrl.includes(`/${version}`)
    ? baseUrl
    : `${baseUrl}/${version}`

  const endpoint = `${endpointBase}/models/${model}:generateContent?key=${apiKey}`

  // 构建请求体
  const parts: any[] = []

  // 添加输入图片（Gemini 格式：inlineData）
  for (const file of files) {
    if (file.data) {
      // 将 ArrayBuffer 转换为 base64
      let base64Data: string
      if (typeof file.data === 'string') {
        // 已经是 base64
        base64Data = file.data
      } else {
        // ArrayBuffer 转 base64
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
  parts.push({
    text: prompt
  })

  const requestBody: any = {
    contents: [
      {
        role: 'user',
        parts
      }
    ],
    generationConfig: {}
  }

  // 仅在启用时添加 responseModalities（根据文档使用 TEXT + IMAGE）
  if (forceImageOutput) {
    requestBody.generationConfig.responseModalities = ['TEXT', 'IMAGE']
  }

  // 仅在配置了值时才添加 imageConfig
  const imageConfig: Record<string, any> = {}
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio
  if (normalizedImageSize) imageConfig.imageSize = normalizedImageSize
  if (outputMimeType) {
    imageConfig.imageOutputOptions = { mimeType: outputMimeType }
  }
  if (personGeneration) imageConfig.personGeneration = personGeneration
  if (Object.keys(imageConfig).length > 0) {
    requestBody.generationConfig.imageConfig = imageConfig
  }

  // 如果需要多张图，添加 candidateCount（注意：部分模型可能不支持）
  if (numberOfImages !== undefined && numberOfImages !== null && numberOfImages > 1) {
    requestBody.generationConfig.candidateCount = Number(numberOfImages)
  }

  // 添加思考配置
  if (thinkingLevel || includeThoughts) {
    const thinkingConfig: Record<string, any> = {}
    if (thinkingLevel) {
      thinkingConfig.thinkingLevel = thinkingLevel
    }
    if (includeThoughts) {
      thinkingConfig.includeThoughts = true
    }
    requestBody.generationConfig.thinkingConfig = thinkingConfig
  }

  // 启用谷歌搜索（按官方示例使用 google_search，支持 webSearch / imageSearch）
  if (enableGoogleSearch) {
    const searchTypes: Record<string, any> = {
      webSearch: {}
    }
    if (enableGoogleImageSearch) {
      searchTypes.imageSearch = {}
    }
    requestBody.tools = [{ google_search: { searchTypes } }]
  }

  // 添加安全过滤设置
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
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: (timeout || 600) * 1000
    })

    const assets: OutputAsset[] = []
    const candidates = response.candidates || []

    // 调试：统计 parts 信息
    let totalParts = 0
    let thoughtParts = 0
    let imageParts = 0

    for (const candidate of candidates) {
      const parts = candidate.content?.parts || []

      for (const part of parts) {
        totalParts++
        if (part.thought) thoughtParts++
        if (part.inlineData) imageParts++

        // 过滤思考过程（thought: true 标记的 parts）
        // 兼容旧数据：filterThoughtImages 未设置时默认为 true
        const shouldFilterThought = (filterThoughtImages ?? true) && part.thought
        if (shouldFilterThought) {
          continue
        }

        // 处理内联图片数据
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

        // 处理文本内容
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

      // 可选输出 grounding 来源信息
      if (exposeGroundingSources) {
        const groundingMetadata = candidate.groundingMetadata || response.groundingMetadata
        if (groundingMetadata) {
          const groundingLines: string[] = []

          const imageSearchQueries: string[] = groundingMetadata.imageSearchQueries || []
          const webSearchQueries: string[] = groundingMetadata.webSearchQueries || []

          if (imageSearchQueries.length > 0) {
            groundingLines.push(`图片搜索查询: ${imageSearchQueries.join(' | ')}`)
          }
          if (webSearchQueries.length > 0) {
            groundingLines.push(`网页搜索查询: ${webSearchQueries.join(' | ')}`)
          }

          const chunks = Array.isArray(groundingMetadata.groundingChunks)
            ? groundingMetadata.groundingChunks
            : []

          const sourceUris: string[] = []
          const sourceImageUris: string[] = []
          for (const chunk of chunks) {
            const uri = chunk?.uri || chunk?.web?.uri
            const imageUri = chunk?.image_uri || chunk?.imageUri
            if (uri && typeof uri === 'string') {
              sourceUris.push(uri)
            }
            if (imageUri && typeof imageUri === 'string') {
              sourceImageUris.push(imageUri)
            }
          }

          const uniqueSourceUris = Array.from(new Set(sourceUris))
          if (uniqueSourceUris.length > 0) {
            groundingLines.push('来源网页:')
            uniqueSourceUris.slice(0, 10).forEach((uri, idx) => {
              groundingLines.push(`${idx + 1}. ${uri}`)
            })
            if (uniqueSourceUris.length > 10) {
              groundingLines.push(`... 其余 ${uniqueSourceUris.length - 10} 条已省略`)
            }
          }

          const uniqueImageUris = Array.from(new Set(sourceImageUris))
          if (uniqueImageUris.length > 0) {
            groundingLines.push('来源图片直链:')
            uniqueImageUris.slice(0, 5).forEach((uri, idx) => {
              groundingLines.push(`${idx + 1}. ${uri}`)
            })
            if (uniqueImageUris.length > 5) {
              groundingLines.push(`... 其余 ${uniqueImageUris.length - 5} 条已省略`)
            }
          }

          if (groundingLines.length > 0) {
            assets.push({
              kind: 'text',
              content: `【Google 搜索接地】\n${groundingLines.join('\n')}`,
              meta: {
                model,
                grounding: true
              }
            })
          }
        }
      }
    }

    logger.debug('[gemini] Response stats: totalParts=%d, thoughtParts=%d, imageParts=%d, assets=%d',
      totalParts, thoughtParts, imageParts, assets.length
    )

    if (assets.length === 0) {
      throw new Error('No content generated in response')
    }

    // 检查是否只有文字输出（无图片/视频/音频）
    const hasMedia = assets.some(a => a.kind === 'image' || a.kind === 'video' || a.kind === 'audio')
    const hasTextOnly = !hasMedia && assets.some(a => a.kind === 'text')

    if (hasTextOnly && !textOnlyAsSuccess) {
      // 纯文字输出且配置为不视为成功，抛出错误（不扣费）
      const textContent = assets
        .filter(a => a.kind === 'text')
        .map(a => a.content)
        .join('\n')
      throw new Error(`模型返回纯文字（无图片）: ${textContent.substring(0, 200)}${textContent.length > 200 ? '...' : ''}`)
    }

    return assets

  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Gemini API error: ${error.message}`)
    }
    throw error
  }
}

/** Gemini 连接器定义 */
export const GeminiConnector: ConnectorDefinition = {
  id: 'gemini-v3',
  name: 'Google Gemini 3',
  description: 'Google Gemini 原生API，支持图像生成',
  icon: 'gemini',
  supportedTypes: ['image'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2img', 'img2img', 'text2video', 'img2video', 'text2audio'],
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const {
      apiUrl,
      model,
      numberOfImages,
      aspectRatio,
      imageSize,
      enableGoogleSearch,
      enableGoogleImageSearch,
      exposeGroundingSources
    } = config

    const parameters: Record<string, any> = {}
    if (numberOfImages !== undefined && numberOfImages !== null && numberOfImages > 1) {
      parameters.numberOfImages = Number(numberOfImages)
    }
    if (aspectRatio) parameters.aspectRatio = aspectRatio
    const normalizedImageSize = normalizeImageSize(imageSize)
    if (normalizedImageSize) parameters.imageSize = normalizedImageSize
    if (enableGoogleSearch) parameters.googleSearch = true
    if (enableGoogleImageSearch) parameters.googleImageSearch = true
    if (exposeGroundingSources) parameters.exposeGroundingSources = true

    return {
      endpoint: apiUrl?.split('?')[0] || 'generativelanguage.googleapis.com',
      model,
      prompt,
      fileCount: files.length,
      parameters
    }
  }
}
