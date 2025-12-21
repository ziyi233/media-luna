// Flux 连接器插件

import { Context } from 'koishi'
import { definePlugin } from '../../core'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorField, CardDisplayField, ConnectorRequestLog } from '../../core'

/** Flux 配置字段 */
const fluxFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'https://api.replicate.com/v1/predictions',
    placeholder: 'https://api.replicate.com/v1/predictions'
  },
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true
  },
  {
    key: 'model',
    label: '模型版本',
    type: 'text',
    default: 'flux-schnell',
    placeholder: 'flux-schnell',
    description: '常用：flux-schnell、flux-dev、flux-pro、flux-1.1-pro'
  },
  {
    key: 'aspectRatio',
    label: '宽高比',
    type: 'text',
    default: '1:1',
    placeholder: '1:1',
    description: '常用：1:1、16:9、9:16、4:3、3:4、21:9'
  },
  {
    key: 'outputFormat',
    label: '输出格式',
    type: 'text',
    default: 'webp',
    placeholder: 'webp',
    description: '支持：webp、png、jpg'
  },
  {
    key: 'outputQuality',
    label: '输出质量',
    type: 'number',
    default: 80
  },
  {
    key: 'numOutputs',
    label: '生成数量',
    type: 'number',
    default: 1
  },
  {
    key: 'seed',
    label: '种子',
    type: 'number',
    placeholder: '留空随机'
  },
  {
    key: 'guidanceScale',
    label: 'Guidance Scale',
    type: 'number',
    default: 3.5
  },
  {
    key: 'numInferenceSteps',
    label: '推理步数',
    type: 'number',
    default: 28
  },
  {
    key: 'disableSafetyChecker',
    label: '禁用安全检查',
    type: 'boolean',
    default: false
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 600
  },
  {
    key: 'pollInterval',
    label: '轮询间隔（毫秒）',
    type: 'number',
    default: 2000
  }
]

/** 卡片展示字段 */
const fluxCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'aspectRatio', label: '宽高比' }
]

/** Flux 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    model = 'flux-schnell',
    aspectRatio = '1:1',
    outputFormat = 'webp',
    outputQuality = 80,
    numOutputs = 1,
    seed,
    guidanceScale = 3.5,
    numInferenceSteps = 28,
    disableSafetyChecker = false,
    timeout = 600,
    pollInterval = 2000
  } = config

  // 模型版本映射 (Replicate 格式)
  const modelVersionMap: Record<string, string> = {
    'flux-schnell': 'black-forest-labs/flux-schnell',
    'flux-dev': 'black-forest-labs/flux-dev',
    'flux-pro': 'black-forest-labs/flux-pro',
    'flux-1.1-pro': 'black-forest-labs/flux-1.1-pro'
  }

  const modelVersion = modelVersionMap[model] || model

  // 构建请求体
  const requestBody: Record<string, any> = {
    version: modelVersion,
    input: {
      prompt,
      num_outputs: Number(numOutputs),
      disable_safety_checker: Boolean(disableSafetyChecker)
    }
  }

  // 仅在非默认值或必要时添加可选参数
  if (aspectRatio) requestBody.input.aspect_ratio = aspectRatio
  if (outputFormat) requestBody.input.output_format = outputFormat
  if (outputQuality) requestBody.input.output_quality = Number(outputQuality)
  if (guidanceScale) requestBody.input.guidance_scale = Number(guidanceScale)
  if (numInferenceSteps) requestBody.input.num_inference_steps = Number(numInferenceSteps)

  if (seed !== undefined && seed !== null && seed !== '') {
    requestBody.input.seed = Number(seed)
  }

  // 如果有输入图片（img2img），添加到请求
  if (files.length > 0) {
    const imageFile = files.find(f => f.mime.startsWith('image/'))
    if (imageFile) {
      const base64Data = Buffer.from(imageFile.data).toString('base64')
      requestBody.input.image = `data:${imageFile.mime};base64,${base64Data}`
    }
  }

  try {
    // 创建预测任务
    const createResponse = await ctx.http.post(apiUrl, requestBody, {
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    })

    if (!createResponse.id) {
      throw new Error('Failed to create prediction')
    }

    const predictionId = createResponse.id
    const getUrl = createResponse.urls?.get || `${apiUrl}/${predictionId}`

    // 轮询等待结果
    const startTime = Date.now()
    const timeoutMs = timeout * 1000

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))

      const statusResponse = await ctx.http.get(getUrl, {
        headers: {
          'Authorization': `Token ${apiKey}`
        },
        timeout: 30000
      })

      if (statusResponse.status === 'succeeded') {
        const output = statusResponse.output
        if (!output) {
          throw new Error('No output from Flux API')
        }

        // 处理输出（可能是单个 URL 或 URL 数组）
        const urls = Array.isArray(output) ? output : [output]

        return urls.map((url: string) => ({
          kind: 'image' as const,
          url,
          mime: `image/${outputFormat === 'jpg' ? 'jpeg' : outputFormat}`,
          meta: {
            predictionId,
            model: modelVersion,
            aspectRatio
          }
        }))
      }

      if (statusResponse.status === 'failed') {
        throw new Error(statusResponse.error || 'Flux generation failed')
      }

      if (statusResponse.status === 'canceled') {
        throw new Error('Flux generation was canceled')
      }

      // 继续轮询 (processing/starting)
    }

    throw new Error('Flux generation timed out')
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Flux API error: ${error.message}`)
    }
    throw error
  }
}

/** Flux 连接器定义 */
const FluxConnector: ConnectorDefinition = {
  id: 'flux',
  name: 'Flux',
  supportedTypes: ['image'],
  fields: fluxFields,
  cardFields: fluxCardFields,
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const {
      apiUrl,
      model = 'flux-schnell',
      aspectRatio = '1:1',
      outputFormat = 'webp',
      numOutputs = 1,
      seed,
      guidanceScale = 3.5,
      numInferenceSteps = 28
    } = config

    return {
      endpoint: apiUrl?.split('?')[0],
      model,
      prompt,
      fileCount: files.length,
      parameters: {
        aspectRatio,
        outputFormat,
        numOutputs: Number(numOutputs),
        seed: seed !== undefined && seed !== '' ? Number(seed) : undefined,
        guidanceScale: Number(guidanceScale),
        numInferenceSteps: Number(numInferenceSteps),
        hasInputImage: files.some(f => f.mime.startsWith('image/'))
      }
    }
  }
}

export default definePlugin({
  id: 'connector-flux',
  name: 'Flux 连接器',
  description: 'Flux 图像生成连接器（支持 Replicate API）',
  version: '1.0.0',

  connector: FluxConnector,

  async onLoad(ctx) {
    ctx.logger.info('Flux connector loaded')
  }
})

export { FluxConnector }
