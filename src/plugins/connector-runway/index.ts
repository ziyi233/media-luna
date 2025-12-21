// Runway 连接器插件
// 适配 Runway Gen-3 Alpha (第三方/模拟 API)
// 视频生成通常耗时较长，必须异步轮询

import { Context } from 'koishi'
import { definePlugin } from '../../core'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorField, CardDisplayField, ConnectorRequestLog } from '../../core'

/** Runway 配置字段 */
const runwayFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'https://api.runwayml.com/v1', // 示意地址
    placeholder: 'https://api.your-provider.com/runway',
    description: 'Runway API 基础地址'
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
    default: 'gen-3-alpha',
    placeholder: 'gen-3-alpha, gen-2',
    description: '模型名称'
  },
  {
    key: 'duration',
    label: '时长 (秒)',
    type: 'select',
    default: '5',
    options: [
      { label: '5 秒', value: '5' },
      { label: '10 秒', value: '10' }
    ],
    description: '生成视频的时长'
  },
  {
    key: 'aspectRatio',
    label: '宽高比',
    type: 'select',
    default: '16:9',
    options: [
      { label: '16:9', value: '16:9' },
      { label: '9:16', value: '9:16' }
    ]
  },
  {
    key: 'seed',
    label: '种子',
    type: 'number',
    placeholder: '留空随机'
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 600 // 视频生成很慢
  }
]

/** 卡片展示字段 */
const runwayCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'duration', label: '时长' }
]

/** Runway 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    model = 'gen-3-alpha',
    duration = '5',
    aspectRatio = '16:9',
    seed,
    timeout = 600
  } = config

  const baseUrl = apiUrl.replace(/\/$/, '')
  
  // 1. 发起任务 (POST /image_to_video 或 /text_to_video)
  let endpoint = `${baseUrl}/tasks` // 假设通用任务接口
  
  const body: any = {
    promptText: prompt,
    model: model,
    parameters: {
      durationSeconds: Number(duration),
      aspectRatio: aspectRatio
    }
  }

  if (seed) body.parameters.seed = Number(seed)

  // 处理输入图片 (Gen-3 支持 Image-to-Video)
  const imageFile = files.find(f => f.mime.startsWith('image/'))
  if (imageFile) {
    const base64 = Buffer.from(imageFile.data).toString('base64')
    body.promptImage = `data:${imageFile.mime};base64,${base64}`
    // 或者需要先上传图片获得 URL，视具体 API 实现而定
  }

  let taskId: string

  try {
    const res = await ctx.http.post(endpoint, body, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    
    taskId = res.id || res.taskId
    if (!taskId) throw new Error(`Invalid Runway response: ${JSON.stringify(res)}`)

  } catch (e: any) {
    if (e.response?.data) {
      throw new Error(`Runway API Error: ${JSON.stringify(e.response.data)}`)
    }
    throw e
  }

  // 2. 轮询结果
  const startTime = Date.now()
  const interval = 5000

  while (Date.now() - startTime < timeout * 1000) {
    await new Promise(resolve => setTimeout(resolve, interval))

    try {
      const res = await ctx.http.get(`${baseUrl}/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })

      const status = res.status // PENDING, RUNNING, SUCCEEDED, FAILED
      
      if (status === 'SUCCEEDED') {
        const url = res.output?.[0] || res.url
        if (!url) throw new Error('Task succeeded but no URL found')
        
        return [{
          kind: 'video',
          url: url,
          mime: 'video/mp4',
          meta: {
            model,
            duration,
            taskId
          }
        }]
      } else if (status === 'FAILED') {
        throw new Error(`Runway Task Failed: ${res.failureReason || 'Unknown error'}`)
      }
      
    } catch (e) {
      // ignore
    }
  }

  throw new Error('Runway task timeout')
}

/** Runway 连接器定义 */
const RunwayConnector: ConnectorDefinition = {
  id: 'runway',
  name: 'Runway',
  supportedTypes: ['video'],
  fields: runwayFields,
  cardFields: runwayCardFields,
  generate,

  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const { apiUrl, model } = config
    return {
      endpoint: apiUrl,
      model,
      prompt,
      fileCount: files.length,
      parameters: {}
    }
  }
}

export default definePlugin({
  id: 'connector-runway',
  name: 'Runway 连接器',
  description: '适配 Runway Gen-2/Gen-3 视频生成',
  version: '1.0.0',
  connector: RunwayConnector,
  async onLoad(ctx) {
    ctx.logger.info('Runway connector loaded')
  }
})

export { RunwayConnector }
