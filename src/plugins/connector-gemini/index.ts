// Google Gemini 3 连接器插件
// 基于原生 HTTP 请求实现，支持 gemini-3-pro-image-preview 等新模型

import { Context } from 'koishi'
import { definePlugin } from '../../core'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorField, CardDisplayField, ConnectorRequestLog } from '../../core'

/** Gemini 配置字段 */
const geminiFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'https://generativelanguage.googleapis.com',
    placeholder: 'https://generativelanguage.googleapis.com',
    description: 'API 基础地址，用于反向代理或自定义端点'
  },
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    description: 'Google AI Studio API Key'
  },
  {
    key: 'model',
    label: '模型',
    type: 'text',
    required: true,
    default: 'gemini-3-pro-image-preview',
    placeholder: 'gemini-3-pro-image-preview',
    description: '模型名称，如 gemini-3-pro-image-preview'
  },
  {
    key: 'numberOfImages',
    label: '生成数量',
    type: 'number',
    default: 1,
    description: '生成图片的数量'
  },
  {
    key: 'aspectRatio',
    label: '宽高比',
    type: 'text',
    default: '1:1',
    placeholder: '1:1',
    description: '支持：1:1, 3:4, 4:3, 9:16, 16:9'
  },
  {
    key: 'resolution',
    label: '分辨率',
    type: 'select',
    default: '1K',
    options: [
      { label: '1024x1024 (1K)', value: '1K' },
      { label: '2048x2048 (2K)', value: '2K' },
      { label: '4096x4096 (4K)', value: '4K' }
    ],
    description: '生成图像的分辨率'
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 600
  }
]

/** 卡片展示字段 */
const geminiCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'aspectRatio', label: '比例' }
]

/** Gemini 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl = 'https://generativelanguage.googleapis.com',
    apiKey,
    model = 'gemini-3-pro-image-preview',
    numberOfImages = 1,
    aspectRatio = '1:1',
    resolution = '1K',
    timeout = 600
  } = config

  // 构建完整 API Endpoint
  const baseUrl = apiUrl.replace(/\/$/, '')
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
        parts
      }
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: resolution
      },
      candidateCount: Number(numberOfImages)
    }
  }

  try {
    const response = await ctx.http.post(endpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: timeout * 1000
    })

    const assets: OutputAsset[] = []
    const candidates = response.candidates || []

    for (const candidate of candidates) {
      const parts = candidate.content?.parts || []
      
      for (const part of parts) {
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
              aspectRatio
            }
          })
        }
      }
    }

    if (assets.length === 0) {
      // 检查是否有文本错误信息
      const textParts = candidates.flatMap((c: any) => c.content?.parts || [])
        .filter((p: any) => p.text)
        .map((p: any) => p.text)
      
      if (textParts.length > 0) {
        throw new Error(`Gemini API returned text instead of image: ${textParts.join('\n')}`)
      }
      
      throw new Error('No image generated in response')
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
const GeminiConnector: ConnectorDefinition = {
  id: 'gemini-v3',
  name: 'Google Gemini 3',
  supportedTypes: ['image'],
  fields: geminiFields,
  cardFields: geminiCardFields,
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const {
      apiUrl,
      model,
      aspectRatio,
      resolution
    } = config

    return {
      endpoint: apiUrl?.split('?')[0] || 'generativelanguage.googleapis.com',
      model,
      prompt,
      fileCount: files.length,
      parameters: {
        aspectRatio,
        resolution
      }
    }
  }
}

export default definePlugin({
  id: 'connector-gemini',
  name: 'Gemini 连接器',
  description: 'Google Gemini 3 图像生成连接器 ',
  version: '1.0.0',

  connector: GeminiConnector,

  async onLoad(ctx) {
    ctx.logger.info('Gemini connector loaded')
  }
})

export { GeminiConnector }
