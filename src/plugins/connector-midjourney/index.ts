// Midjourney 连接器插件
// 适配通用 Midjourney API Proxy (如 GoAPI, TTApi, userapi.ai 等)
// 通常遵循: POST /imagine -> { task_id } -> GET /fetch -> { status, imageUrl }

import { Context } from 'koishi'
import { definePlugin } from '../../core'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorField, CardDisplayField, ConnectorRequestLog } from '../../core'

/** Midjourney 配置字段 */
const mjFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'https://api.midjourneyapi.xyz/mj/v2',
    placeholder: 'https://api.midjourneyapi.xyz/mj/v2',
    description: 'MJ Proxy 服务的基础地址'
  },
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    description: 'Proxy 服务商提供的 API Key'
  },
  {
    key: 'webhookUrl',
    label: 'Webhook 回调地址',
    type: 'text',
    placeholder: 'https://your-domain.com/mj-webhook',
    description: '可选：用于接收任务完成通知（若服务商支持且您配置了公网回调）'
  },
  {
    key: 'aspectRatio',
    label: '默认宽高比 (--ar)',
    type: 'text',
    default: '1:1',
    placeholder: '16:9',
    description: '默认宽高比，如 16:9, 9:16, 2:3'
  },
  {
    key: 'mode',
    label: '模式',
    type: 'select',
    default: 'fast',
    options: [
      { label: 'Fast (快速)', value: 'fast' },
      { label: 'Relax (慢速)', value: 'relax' },
      { label: 'Turbo (极速)', value: 'turbo' }
    ]
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 600
  }
]

/** 卡片展示字段 */
const mjCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'mode', label: '模式' },
  { source: 'connectorConfig', key: 'aspectRatio', label: '比例' }
]

/** 轮询任务状态 */
async function pollTask(
  ctx: Context,
  fetchUrl: string,
  apiKey: string,
  timeoutMs: number
): Promise<string[]> {
  const startTime = Date.now()
  const interval = 3000 // 3秒轮询一次

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, interval))

    try {
      const res = await ctx.http.post(fetchUrl, {}, {
        headers: { 'X-API-KEY': apiKey }
      })

      // 适配常见 Proxy 格式
      // GoAPI: { status: 'finished', task_id: '...', task_result: { image_url: '...' } }
      // TTApi: { status: 'SUCCESS', imageUrl: '...' }
      
      const status = res.status?.toLowerCase()
      
      if (status === 'finished' || status === 'success' || status === 'completed') {
        const url = res.task_result?.image_url || res.imageUrl || res.url
        if (url) {
          return [url]
        }
        // 有些返回的是 grid 图片，可能需要进一步分割，这里简化为返回主图
      } else if (status === 'failed' || status === 'error') {
        throw new Error(`MJ Task Failed: ${JSON.stringify(res)}`)
      }
      
      // continue polling if 'processing', 'pending', 'started'
      
    } catch (e) {
      // ignore network glitch, continue polling
    }
  }

  throw new Error('Midjourney task timeout')
}

/** Midjourney 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    webhookUrl,
    aspectRatio = '1:1',
    mode = 'fast',
    timeout = 600
  } = config

  const baseUrl = apiUrl.replace(/\/$/, '')
  
  // 1. 发起 Imagine 任务
  // 注意：不同 Proxy 的 API 路径和参数可能略有不同，这里适配一种通用格式
  // 通常是 POST /imagine
  const imagineUrl = `${baseUrl}/imagine`
  
  // 拼接参数到 prompt
  let fullPrompt = prompt
  if (aspectRatio && !fullPrompt.includes('--ar')) {
    fullPrompt += ` --ar ${aspectRatio}`
  }
  
  // 处理垫图 (Image Prompt)
  // 如果有输入图片，需要先上传或者直接把 URL 拼在 prompt 前面
  // 由于 Proxy 通常只接受 URL，这里假设 files 已经被中间件上传并替换为了 url (需要 storage-input 中间件配合)
  // 这里暂时只处理文本 Prompt

  const body: any = {
    prompt: fullPrompt,
    process_mode: mode
  }
  if (webhookUrl) body.webhook_url = webhookUrl

  let taskId: string

  try {
    const res = await ctx.http.post(imagineUrl, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      }
    })
    
    taskId = res.task_id || res.taskId || res.id
    if (!taskId) {
      throw new Error(`Failed to start MJ task: ${JSON.stringify(res)}`)
    }
  } catch (e) {
    if (e instanceof Error) throw new Error(`MJ API Error: ${e.message}`)
    throw e
  }

  // 2. 轮询结果 (如果没有 Webhook 或需要同步等待)
  // POST /fetch 或 GET /task/{id}
  const fetchUrl = `${baseUrl}/result` // 或者是 /fetch
  
  // 这里的轮询逻辑需要根据具体 Proxy 的协议调整
  // 这是一个基于 GoAPI 风格的示例
  
  const imageUrls = await pollTask(ctx, fetchUrl, apiKey, timeout * 1000)

  return imageUrls.map(url => ({
    kind: 'image',
    url,
    mime: 'image/png', // MJ 通常返回 PNG 或 WebP
    meta: {
      taskId,
      prompt: fullPrompt
    }
  }))
}

/** Midjourney 连接器定义 */
const MidjourneyConnector: ConnectorDefinition = {
  id: 'midjourney',
  name: 'Midjourney (Proxy)',
  supportedTypes: ['image'],
  fields: mjFields,
  cardFields: mjCardFields,
  generate,

  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const { apiUrl, aspectRatio, mode } = config
    return {
      endpoint: apiUrl,
      model: 'midjourney-v6', // MJ 版本通常包含在 prompt 里，这里写死 v6 示意
      prompt,
      fileCount: files.length,
      parameters: {
        aspectRatio,
        mode
      }
    }
  }
}

export default definePlugin({
  id: 'connector-midjourney',
  name: 'Midjourney 连接器',
  description: '适配通用 Midjourney API Proxy 服务',
  version: '1.0.0',
  connector: MidjourneyConnector,
  async onLoad(ctx) {
    ctx.logger.info('Midjourney connector loaded')
  }
})

export { MidjourneyConnector }
