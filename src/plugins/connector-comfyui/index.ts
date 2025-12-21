// ComfyUI 连接器插件
// 基于原生 ComfyUI WebSocket API
// 工作流: HTTP POST /prompt -> WebSocket 监听进度 -> HTTP GET /view (下载图片)

import { Context } from 'koishi'
import { definePlugin } from '../../core'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorField, CardDisplayField, ConnectorRequestLog } from '../../core'
import { WebSocket } from 'ws'

/** ComfyUI 配置字段 */
const comfyFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'http://127.0.0.1:8188',
    placeholder: 'http://127.0.0.1:8188',
    description: 'ComfyUI 服务地址'
  },
  {
    key: 'workflow',
    label: '默认工作流 (JSON)',
    type: 'textarea',
    description: '默认的 workflow_api.json 内容 (必须包含 KSampler 和 SaveImage 节点)',
    default: ''
  },
  {
    key: 'promptNodeId',
    label: 'Prompt 节点 ID',
    type: 'text',
    default: '6', // 默认 workflow 通常是 6
    description: '输入正向提示词的 CLIPTextEncode 节点 ID'
  },
  {
    key: 'seedNodeId',
    label: 'Seed 节点 ID',
    type: 'text',
    default: '3', // 默认 workflow KSampler 通常是 3
    description: 'KSampler 节点 ID (用于设置随机种子)'
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 300
  }
]

/** 卡片展示字段 */
const comfyCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'apiUrl', label: '节点' }
]

/**
 * 连接 WebSocket 并等待执行结果
 */
function waitForExecution(
  wsUrl: string,
  promptId: string,
  timeoutMs: number
): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error('ComfyUI execution timeout'))
    }, timeoutMs)

    ws.on('open', () => {
      // 可以在这里发送鉴权信息如果需要
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        
        // 监听执行完成事件
        if (msg.type === 'executing' && msg.data.node === null && msg.data.prompt_id === promptId) {
          // 整个 prompt 执行完成
          // 但我们需要的是 output 数据，这个消息只表示执行结束
        }
        
        if (msg.type === 'status' && msg.data.status?.exec_info?.queue_remaining === 0) {
          // 队列空了，可能完成了
        }

        // 最准确的是监听 executed 事件，获取输出图片文件名
        if (msg.type === 'executed' && msg.data.prompt_id === promptId) {
          clearTimeout(timer)
          ws.close()
          resolve(msg.data.output) // 包含 images: [{filename, subfolder, type}]
        }
        
        if (msg.type === 'execution_error' && msg.data.prompt_id === promptId) {
          clearTimeout(timer)
          ws.close()
          reject(new Error(`ComfyUI Error: ${JSON.stringify(msg.data)}`))
        }

      } catch (e) {
        // ignore parse error
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/** ComfyUI 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    workflow,
    promptNodeId = '6',
    seedNodeId = '3',
    timeout = 300
  } = config

  if (!workflow) {
    throw new Error('No workflow configured for ComfyUI')
  }

  let promptData: any
  try {
    promptData = JSON.parse(workflow)
  } catch {
    throw new Error('Invalid workflow JSON')
  }

  // 1. 修改 Prompt
  if (promptData[promptNodeId]) {
    // 假设是 CLIPTextEncode 节点
    promptData[promptNodeId].inputs.text = prompt
  } else {
    // 尝试找任意 CLIPTextEncode 节点? 不，还是报错比较安全
    // throw new Error(`Node ${promptNodeId} not found in workflow`)
    // 或者宽容处理：遍历寻找第一个 CLIPTextEncode
    const textNodeKey = Object.keys(promptData).find(k => promptData[k].class_type === 'CLIPTextEncode')
    if (textNodeKey) {
      promptData[textNodeKey].inputs.text = prompt
    }
  }

  // 2. 修改 Seed (KSampler)
  if (promptData[seedNodeId]) {
    const seed = Math.floor(Math.random() * 1000000000000000)
    if (promptData[seedNodeId].inputs.seed !== undefined) {
      promptData[seedNodeId].inputs.seed = seed
    } else if (promptData[seedNodeId].inputs.noise_seed !== undefined) {
      promptData[seedNodeId].inputs.noise_seed = seed
    }
  }

  // 3. 处理输入图片 (LoadImage)
  // ComfyUI 处理图片上传比较麻烦，需要先 POST /upload/image
  const imageFile = files.find(f => f.mime.startsWith('image/'))
  if (imageFile) {
    const formData = new FormData()
    formData.append('image', new Blob([imageFile.data], { type: imageFile.mime }), 'input.png')
    formData.append('type', 'input')
    formData.append('overwrite', 'true')

    await ctx.http.post(`${apiUrl}/upload/image`, formData)

    // 修改 LoadImage 节点
    const loadNodeKey = Object.keys(promptData).find(k => promptData[k].class_type === 'LoadImage')
    if (loadNodeKey) {
      promptData[loadNodeKey].inputs.image = 'input.png'
    }
  }

  // 4. 提交任务
  const clientId = Math.random().toString(36).substring(7)
  const res = await ctx.http.post(`${apiUrl}/prompt`, {
    prompt: promptData,
    client_id: clientId
  })
  
  const promptId = res.prompt_id
  if (!promptId) throw new Error('Failed to queue prompt in ComfyUI')

  // 5. 监听 WebSocket 等待结果
  // ws://host:port/ws?clientId=...
  const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws?clientId=${clientId}`
  
  const outputData: any = await waitForExecution(wsUrl, promptId, timeout * 1000)
  
  // 6. 获取图片
  // outputData: { images: [ { filename: '...', subfolder: '...', type: 'output' } ] }
  const assets: OutputAsset[] = []
  
  if (outputData && outputData.images) {
    for (const img of outputData.images) {
      const imageUrl = `${apiUrl}/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`
      
      // 下载图片转为 base64 (为了统一输出格式，或者直接返回 URL 让前端/中间件下载)
      // 建议：如果 connector 设计为返回 URL，这里直接返回 URL 即可
      // 但 ComfyUI 是本地/内网服务，外网可能访问不到，所以最好下载转成 base64
      
      const imageBuf = await ctx.http.get(imageUrl, { responseType: 'arraybuffer' })
      const mime = img.filename.endsWith('.png') ? 'image/png' : 'image/jpeg'
      const base64 = Buffer.from(imageBuf).toString('base64')

      assets.push({
        kind: 'image',
        url: `data:${mime};base64,${base64}`,
        mime,
        meta: {
          promptId,
          filename: img.filename
        }
      })
    }
  }

  if (assets.length === 0) {
    throw new Error('ComfyUI finished but no images returned')
  }

  return assets
}

/** ComfyUI 连接器定义 */
const ComfyUIConnector: ConnectorDefinition = {
  id: 'comfyui',
  name: 'ComfyUI',
  supportedTypes: ['image'],
  fields: comfyFields,
  cardFields: comfyCardFields,
  generate,

  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const { apiUrl } = config
    return {
      endpoint: apiUrl,
      model: 'comfyui-workflow',
      prompt,
      fileCount: files.length,
      parameters: {}
    }
  }
}

export default definePlugin({
  id: 'connector-comfyui',
  name: 'ComfyUI 连接器',
  description: '适配 ComfyUI 工作流',
  version: '1.0.0',
  connector: ComfyUIConnector,
  async onLoad(ctx) {
    ctx.logger.info('ComfyUI connector loaded')
  }
})

export { ComfyUIConnector }
