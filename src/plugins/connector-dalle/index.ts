// DALL-E 连接器插件

import { Context } from 'koishi'
import { definePlugin } from '../../core'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorField, CardDisplayField, ConnectorRequestLog } from '../../core'

/** DALL-E 配置字段 */
const dalleFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'https://api.openai.com/v1/images/generations',
    placeholder: 'https://api.openai.com/v1/images/generations'
  },
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true
  },
  {
    key: 'model',
    label: '模型',
    type: 'text',
    required: true,
    default: 'nano-banana-2',
    placeholder: 'nano-banana-2',
    description: '模型名称，如 dall-e-3、dall-e-2 或其他兼容模型'
  },
  {
    key: 'size',
    label: '图片尺寸',
    type: 'text',
    required: true,
    default: '1024x1024',
    placeholder: '1024x1024',
    description: '常用尺寸：1024x1024、1792x1024、1024x1792、512x512'
  },
  {
    key: 'quality',
    label: '质量',
    type: 'text',
    default: 'standard',
    placeholder: 'standard',
    description: 'standard 或 hd（DALL-E 3 专用）'
  },
  {
    key: 'style',
    label: '风格',
    type: 'text',
    default: 'vivid',
    placeholder: 'vivid',
    description: 'vivid（生动）或 natural（自然），DALL-E 3 专用'
  },
  {
    key: 'n',
    label: '生成数量',
    type: 'number',
    default: 1
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 600
  }
]

/** 卡片展示字段 */
const dalleCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'size', label: '尺寸', format: 'size' }
]

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
    model = 'dall-e-3',
    size = '1024x1024',
    quality = 'standard',
    style = 'vivid',
    n = 1,
    timeout = 600
  } = config

  const requestBody: Record<string, any> = {
    model,
    prompt,
    n: Number(n)
  }

  // 仅在非默认值时添加参数
  if (size) requestBody.size = size

  // DALL-E 3 专属参数
  if (model === 'dall-e-3') {
    if (quality) requestBody.quality = quality
    if (style) requestBody.style = style
  }

  const response = await ctx.http.post(apiUrl, requestBody, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: timeout * 1000
  })

  if (!response.data || !Array.isArray(response.data)) {
    throw new Error('Invalid response from DALL-E API')
  }

  return response.data.map((item: any) => ({
    kind: 'image' as const,
    url: item.url || item.b64_json,
    mime: 'image/png',
    meta: {
      revisedPrompt: item.revised_prompt
    }
  }))
}

/** DALL-E 连接器定义 */
const DalleConnector: ConnectorDefinition = {
  id: 'dalle',
  name: 'DALL-E',
  supportedTypes: ['image'],
  fields: dalleFields,
  cardFields: dalleCardFields,
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const {
      apiUrl,
      model = 'dall-e-3',
      size = '1024x1024',
      quality = 'standard',
      style = 'vivid',
      n = 1
    } = config

    return {
      endpoint: apiUrl?.split('?')[0],
      model,
      prompt,
      fileCount: files.length,
      parameters: {
        size,
        quality,
        style,
        n: Number(n)
      }
    }
  }
}

export default definePlugin({
  id: 'connector-dalle',
  name: 'DALL-E 连接器',
  description: 'DALL-E / OpenAI 图像生成连接器',
  version: '1.0.0',

  connector: DalleConnector,

  async onLoad(ctx) {
    ctx.logger.info('DALL-E connector loaded')
  }
})

export { DalleConnector }
