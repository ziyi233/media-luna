// Stable Diffusion WebUI 连接器插件

import { Context } from 'koishi'
import { definePlugin } from '../../core'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorField, CardDisplayField } from '../../core'

/** SD WebUI 配置字段 */
const sdWebuiFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'http://127.0.0.1:7860',
    placeholder: 'http://127.0.0.1:7860'
  },
  {
    key: 'model',
    label: '模型',
    type: 'text',
    placeholder: '留空使用当前加载的模型'
  },
  {
    key: 'sampler',
    label: '采样器',
    type: 'text',
    default: 'Euler a',
    placeholder: 'Euler a',
    description: '常用：Euler a、DPM++ 2M Karras、DPM++ SDE Karras、DDIM'
  },
  {
    key: 'steps',
    label: '步数',
    type: 'number',
    default: 20
  },
  {
    key: 'cfgScale',
    label: 'CFG Scale',
    type: 'number',
    default: 7
  },
  {
    key: 'width',
    label: '宽度',
    type: 'number',
    default: 512
  },
  {
    key: 'height',
    label: '高度',
    type: 'number',
    default: 512
  },
  {
    key: 'negativePrompt',
    label: '负面提示词',
    type: 'textarea',
    default: 'lowres, bad anatomy, bad hands, text, error, missing fingers'
  },
  {
    key: 'batchSize',
    label: '批量大小',
    type: 'number',
    default: 1
  },
  {
    key: 'seed',
    label: '种子',
    type: 'number',
    default: -1,
    placeholder: '-1 为随机'
  },
  {
    key: 'denoisingStrength',
    label: '去噪强度 (img2img)',
    type: 'number',
    default: 0.75
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 600
  }
]

/** 卡片展示字段 */
const sdWebuiCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'width', label: '宽' },
  { source: 'connectorConfig', key: 'height', label: '高' },
  { source: 'connectorConfig', key: 'sampler', label: '采样器' }
]

/** SD WebUI 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    model,
    sampler = 'Euler a',
    steps = 20,
    cfgScale = 7,
    width = 512,
    height = 512,
    negativePrompt = '',
    batchSize = 1,
    seed = -1,
    denoisingStrength = 0.75,
    timeout = 600
  } = config

  const baseUrl = apiUrl.replace(/\/$/, '')

  // 如果有输入图片，使用 img2img，否则使用 txt2img
  const hasInputImage = files.length > 0 && files.some(f => f.mime.startsWith('image/'))
  const endpoint = hasInputImage ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img'

  // 构建请求体
  const requestBody: Record<string, any> = {
    prompt,
    negative_prompt: negativePrompt,
    sampler_name: sampler,
    steps: Number(steps),
    cfg_scale: Number(cfgScale),
    width: Number(width),
    height: Number(height),
    batch_size: Number(batchSize),
    seed: Number(seed)
  }

  // 移除可能为空或无效的字段，防止 API 报错
  if (!negativePrompt) delete requestBody.negative_prompt
  
  // 如果指定了模型，添加模型覆盖
  if (model) {
    requestBody.override_settings = {
      sd_model_checkpoint: model
    }
  }

  // img2img 需要额外参数
  if (hasInputImage) {
    const imageFile = files.find(f => f.mime.startsWith('image/'))!
    const base64Data = Buffer.from(imageFile.data).toString('base64')
    requestBody.init_images = [`data:${imageFile.mime};base64,${base64Data}`]
    requestBody.denoising_strength = Number(denoisingStrength)
  }

  try {
    const response = await ctx.http.post(`${baseUrl}${endpoint}`, requestBody, {
      timeout: timeout * 1000
    })

    if (!response.images || !Array.isArray(response.images)) {
      throw new Error('Invalid response from SD WebUI API')
    }

    // SD WebUI 返回 base64 图片
    return response.images.map((img: string, idx: number) => {
      // 移除可能的 data URI 前缀
      const base64 = img.includes(',') ? img.split(',')[1] : img
      return {
        kind: 'image' as const,
        url: `data:image/png;base64,${base64}`,
        mime: 'image/png',
        meta: {
          seed: response.parameters?.seed,
          info: response.info
        }
      }
    })
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`SD WebUI API error: ${error.message}`)
    }
    throw error
  }
}

/** SD WebUI 连接器定义 */
const SDWebUIConnector: ConnectorDefinition = {
  id: 'sd-webui',
  name: 'Stable Diffusion WebUI',
  supportedTypes: ['image'],
  fields: sdWebuiFields,
  cardFields: sdWebuiCardFields,
  generate
}

export default definePlugin({
  id: 'connector-sd-webui',
  name: 'SD WebUI 连接器',
  description: 'Stable Diffusion WebUI (AUTOMATIC1111) 连接器',
  version: '1.0.0',

  connector: SDWebUIConnector,

  async onLoad(ctx) {
    ctx.logger.info('SD WebUI connector loaded')
  }
})

export { SDWebUIConnector }
