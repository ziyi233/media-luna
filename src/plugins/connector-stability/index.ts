// Stability AI 连接器插件
// 基于 Stable Image API (v2beta)
// 文档: https://platform.stability.ai/docs/api-reference

import { Context } from 'koishi'
import { definePlugin } from '../../core'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorField, CardDisplayField, ConnectorRequestLog } from '../../core'

/** Stability AI 配置字段 */
const stabilityFields: ConnectorField[] = [
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    description: 'Stability AI API Key (sk-...)'
  },
  {
    key: 'model',
    label: '模型',
    type: 'text',
    default: 'sd3-large',
    required: true,
    placeholder: 'sd3-large',
    description: 'sd3-large, sd3-large-turbo, sd3-medium, core'
  },
  {
    key: 'aspectRatio',
    label: '宽高比',
    type: 'select',
    default: '1:1',
    options: [
      { label: '1:1', value: '1:1' },
      { label: '16:9', value: '16:9' },
      { label: '21:9', value: '21:9' },
      { label: '2:3', value: '2:3' },
      { label: '3:2', value: '3:2' },
      { label: '4:5', value: '4:5' },
      { label: '5:4', value: '5:4' },
      { label: '9:16', value: '9:16' },
      { label: '9:21', value: '9:21' }
    ],
    description: '生成图像的宽高比'
  },
  {
    key: 'negativePrompt',
    label: '负面提示词',
    type: 'textarea',
    description: '仅部分模型支持 (如 sd3-large, core)'
  },
  {
    key: 'seed',
    label: '种子',
    type: 'number',
    default: 0,
    description: '0 为随机'
  },
  {
    key: 'outputFormat',
    label: '输出格式',
    type: 'select',
    default: 'png',
    options: [
      { label: 'PNG', value: 'png' },
      { label: 'JPEG', value: 'jpeg' }
    ]
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 60
  }
]

/** 卡片展示字段 */
const stabilityCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'aspectRatio', label: '比例' }
]

/** Stability AI 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiKey,
    model = 'sd3-large',
    aspectRatio = '1:1',
    negativePrompt,
    seed = 0,
    outputFormat = 'png',
    timeout = 60
  } = config

  // 根据模型选择 Endpoint
  // Stable Image Core 使用不同端点
  let apiUrl = 'https://api.stability.ai/v2beta/stable-image/generate/sd3'
  if (model === 'core') {
    apiUrl = 'https://api.stability.ai/v2beta/stable-image/generate/core'
  } else if (model.includes('ultra')) {
    apiUrl = 'https://api.stability.ai/v2beta/stable-image/generate/ultra'
  }

  // 构建 FormData
  const formData = new FormData()
  formData.append('prompt', prompt)
  formData.append('aspect_ratio', aspectRatio)
  formData.append('output_format', outputFormat)
  
  // 可选参数
  if (negativePrompt) formData.append('negative_prompt', negativePrompt)
  if (seed && seed !== 0) formData.append('seed', seed.toString())
  
  // 处理垫图 (Image-to-Image)
  // SD3 API 支持 mode: 'image-to-image' 和 image 参数
  const imageFile = files.find(f => f.mime.startsWith('image/'))
  if (imageFile) {
    formData.append('image', new Blob([imageFile.data], { type: imageFile.mime }))
    formData.append('mode', 'image-to-image')
    formData.append('strength', '0.7') // 默认去噪强度
  } else {
    formData.append('mode', 'text-to-image')
  }
  
  // 必须指定 model 参数
  if (model !== 'core' && !model.includes('ultra')) {
    formData.append('model', model)
  }

  try {
    const response = await ctx.http.post(apiUrl, formData, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'image/*' // 请求直接返回图片二进制数据
      },
      responseType: 'arraybuffer',
      timeout: timeout * 1000
    })

    // 检查响应类型
    // 如果 Accept 是 image/*，成功时直接返回二进制图片
    // 失败时通常返回 JSON
    
    // Stability AI v2beta 直接返回图片数据
    const mime = outputFormat === 'png' ? 'image/png' : 'image/jpeg'
    const base64 = Buffer.from(response).toString('base64')
    
    return [{
      kind: 'image',
      url: `data:${mime};base64,${base64}`,
      mime,
      meta: {
        model,
        aspectRatio,
        seed
      }
    }]
    
  } catch (e: any) {
    // 尝试解析错误 JSON
    if (e.response?.data) {
      try {
        const errorText = Buffer.from(e.response.data).toString()
        const errorJson = JSON.parse(errorText)
        if (errorJson.errors) {
          throw new Error(`Stability AI Error: ${errorJson.errors.map((err: any) => err.message).join(', ')}`)
        }
      } catch {
        // ignore
      }
    }
    throw e
  }
}

/** Stability AI 连接器定义 */
const StabilityConnector: ConnectorDefinition = {
  id: 'stability',
  name: 'Stability AI',
  supportedTypes: ['image'],
  fields: stabilityFields,
  cardFields: stabilityCardFields,
  generate,

  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const { model, aspectRatio } = config
    return {
      endpoint: 'api.stability.ai',
      model,
      prompt,
      fileCount: files.length,
      parameters: {
        aspectRatio
      }
    }
  }
}

export default definePlugin({
  id: 'connector-stability',
  name: 'Stability AI 连接器',
  description: 'Stability AI 官方连接器 (SD3/Core)',
  version: '1.0.0',
  connector: StabilityConnector,
  async onLoad(ctx) {
    ctx.logger.info('Stability AI connector loaded')
  }
})

export { StabilityConnector }
