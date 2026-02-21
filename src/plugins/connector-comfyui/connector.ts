// ComfyUI 连接器
// 基于原生 ComfyUI WebSocket API
// 参考 koishi-plugin-comfyclient 的实现

import { Context } from 'koishi'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorRequestLog } from '../../core'
import { connectorFields, connectorCardFields } from './config'
import { WebSocket } from 'ws'
import FormData from 'form-data'

const PROMPT_PLACEHOLDER = '{{prompt}}'

/** 解析服务器地址 */
function parseServerEndpoint(apiUrl: string): string {
  // 移除协议前缀，获取 host:port
  return apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** 获取 HTTP 协议前缀 */
function getHttpProtocol(isSecure: boolean): string {
  return isSecure ? 'https' : 'http'
}

/** 获取 WebSocket 协议前缀 */
function getWsProtocol(isSecure: boolean): string {
  return isSecure ? 'wss' : 'ws'
}

/**
 * 上传图片到 ComfyUI
 */
async function uploadImage(
  ctx: Context,
  serverEndpoint: string,
  isSecure: boolean,
  imageBuffer: ArrayBuffer | Buffer,
  filename: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const logger = ctx.logger('media-luna')
  try {
    const formData = new FormData()
    // 确保转换为 Buffer
    const buffer = imageBuffer instanceof Buffer ? imageBuffer : Buffer.from(new Uint8Array(imageBuffer))
    formData.append('image', buffer, filename)
    formData.append('overwrite', 'true')
    formData.append('type', 'input')

    // 将 FormData 转为 Buffer 以避免 chunked encoding 并计算准确的 Content-Length
    const payload = formData.getBuffer()

    // 显式设置 Content-Length
    const headers = {
      ...formData.getHeaders(),
      'Content-Length': payload.length.toString()
    }

    logger.info('[comfyui] Step 1: Uploading image... (Size: %d bytes)', payload.length)

    const response = await ctx.http.post(
      `${getHttpProtocol(isSecure)}://${serverEndpoint}/upload/image`,
      payload,
      { headers }
    )

    return { success: true, data: response }
  } catch (error) {
    logger.error('[comfyui] Upload failed: %s', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}

/**
 * 获取执行历史
 */
async function getHistory(
  ctx: Context,
  serverEndpoint: string,
  isSecure: boolean,
  promptId: string
): Promise<any> {
  const url = `${getHttpProtocol(isSecure)}://${serverEndpoint}/history/${promptId}`
  const response = await ctx.http.get(url)
  return response[promptId]
}

/**
 * 获取图片数据
 */
async function getImage(
  ctx: Context,
  serverEndpoint: string,
  isSecure: boolean,
  filename: string,
  subfolder: string = '',
  type: string = 'output'
): Promise<Buffer> {
  const url = `${getHttpProtocol(isSecure)}://${serverEndpoint}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${type}`
  const response = await ctx.http.get(url, { responseType: 'arraybuffer' })
  return Buffer.from(response)
}

/**
 * 修改 workflow 避免缓存（随机化所有 seed）
 */
function modifyWorkflowToAvoidCache(workflow: any, avoidCache: boolean): any {
  if (!avoidCache) return workflow

  const modified = JSON.parse(JSON.stringify(workflow))
  const randomSeed = Math.floor(Math.random() * 1000000000000000)

  for (const nodeId in modified) {
    const node = modified[nodeId]
    if (node.inputs) {
      if (typeof node.inputs.seed !== 'undefined') {
        node.inputs.seed = randomSeed
      }
      if (typeof node.inputs.noise_seed !== 'undefined') {
        node.inputs.noise_seed = randomSeed
      }
    }
  }

  return modified
}

function applyParametersToWorkflow(workflow: any, parameters: Record<string, any>, config: Record<string, any>) {
  if (!parameters || Object.keys(parameters).length === 0) return

  // 辅助函数：限制数值范围
  const clamp = (val: number, min?: number, max?: number) => {
    if (min !== undefined && val < min) return min;
    if (max !== undefined && val > max) return max;
    return val;
  }

  // 限制各个标量参数
  if (parameters.steps !== undefined) {
    parameters.steps = clamp(parameters.steps, config.minSteps, config.maxSteps);
  }
  if (parameters.cfg !== undefined) {
    parameters.cfg = clamp(parameters.cfg, config.minCfg, config.maxCfg);
  }
  if (parameters.denoise !== undefined) {
    parameters.denoise = clamp(parameters.denoise, config.minDenoise, config.maxDenoise);
  }
  if (parameters.framerate !== undefined) {
    parameters.framerate = clamp(parameters.framerate, config.minFramerate, config.maxFramerate);
  }
  if (parameters.time !== undefined) {
    parameters.time = clamp(parameters.time, config.minTime, config.maxTime);
  }
  if (parameters.motion !== undefined) {
    parameters.motion = clamp(parameters.motion, config.minMotion, config.maxMotion);
  }

  // 解析分辨率
  let width: number | undefined
  let height: number | undefined
  let maxSide: number | undefined

  if (parameters.resolution) {
    if (typeof parameters.resolution === 'string' && parameters.resolution.includes('x')) {
      const [w, h] = parameters.resolution.split('x').map(x => parseInt(x, 10))
      if (!isNaN(w) && !isNaN(h)) {
        width = w
        height = h
        maxSide = Math.max(w, h)
      }
    } else {
      const v = parseInt(parameters.resolution, 10)
      if (!isNaN(v)) {
        maxSide = v
        width = v
        height = v
      }
    }

    // 应用分辨率限制
    const minRes = config.minResolution
    const maxRes = config.maxResolution

    if (maxSide !== undefined) {
      if (minRes !== undefined && maxSide < minRes) {
        const scale = minRes / maxSide
        maxSide = minRes
        if (width !== undefined) width = Math.round(width * scale)
        if (height !== undefined) height = Math.round(height * scale)
      } else if (maxRes !== undefined && maxSide > maxRes) {
        const scale = maxRes / maxSide
        maxSide = maxRes
        if (width !== undefined) width = Math.round(width * scale)
        if (height !== undefined) height = Math.round(height * scale)
      }
    }
  }

  // 辅助函数：设置节点输入值，支持处理链接情况
  const setPrimitiveInput = (node: any, inputName: string, value: any) => {
    if (!node || !node.inputs) return
    const input = node.inputs[inputName]
    if (Array.isArray(input)) {
      // 遇到链接 [nodeId, slotIndex]
      const linkedNodeId = String(input[0])
      const linkedNode = workflow[linkedNodeId]
      if (linkedNode && linkedNode.inputs) {
        linkedNode.inputs.value = value
      }
    } else if (input !== undefined) {
      node.inputs[inputName] = value
    }
  }

  // 辅助函数：获取节点输入值或其链接指向的值
  const getPrimitiveInput = (node: any, inputName: string): any => {
    if (!node || !node.inputs) return undefined
    const input = node.inputs[inputName]
    if (Array.isArray(input)) {
      const linkedNodeId = String(input[0])
      const linkedNode = workflow[linkedNodeId]
      if (linkedNode && linkedNode.inputs && linkedNode.inputs.value !== undefined) {
        return linkedNode.inputs.value
      }
      return undefined
    }
    return input
  }

  // 先遍历一遍，获取帧率和插值乘数用于计算总帧数
  let finalFramerate = parameters.framerate
  let interpolationMultiplier = 1

  if (finalFramerate === undefined) {
    for (const nodeId in workflow) {
      const node = workflow[nodeId]
      if (node?.class_type === 'VHS_VideoCombine') {
        const fps = getPrimitiveInput(node, 'frame_rate')
        if (typeof fps === 'number') finalFramerate = fps
      }
    }
  }

  for (const nodeId in workflow) {
    const node = workflow[nodeId]
    if (node?.class_type === 'RIFE VFI') {
      const mult = getPrimitiveInput(node, 'multiplier')
      if (typeof mult === 'number') interpolationMultiplier = mult
    }
  }

  for (const nodeId in workflow) {
    const node = workflow[nodeId]
    if (!node?.inputs) continue

    // 步数, CFG, 重绘幅度
    if (['KSampler', 'KSamplerAdvanced'].includes(node.class_type)) {
      if (parameters.steps !== undefined) setPrimitiveInput(node, 'steps', parameters.steps)
      if (parameters.cfg !== undefined) setPrimitiveInput(node, 'cfg', parameters.cfg)
      if (parameters.denoise !== undefined) setPrimitiveInput(node, 'denoise', parameters.denoise)
    }

    // 视频帧率
    if (['VHS_VideoCombine'].includes(node.class_type)) {
      if (parameters.framerate !== undefined) setPrimitiveInput(node, 'frame_rate', parameters.framerate)
    }

    // 视频长度和运动幅度
    if (['PainterI2V', 'WanFirstLastFrameToVideo', 'WanVideoGenerate'].includes(node.class_type)) {
      if (parameters.time !== undefined) {
        const fps = finalFramerate || 8
        const mult = interpolationMultiplier || 1
        const length = Math.ceil((fps / mult) * parameters.time + 1)
        setPrimitiveInput(node, 'length', length)
      }
      if (parameters.motion !== undefined) {
        setPrimitiveInput(node, 'motion_amplitude', parameters.motion)
      }
    }

    // 分辨率处理
    if (node.class_type === 'EmptyLatentImage') {
      if (width !== undefined && height !== undefined) {
        setPrimitiveInput(node, 'width', width)
        setPrimitiveInput(node, 'height', height)
      } else if (maxSide !== undefined) {
        setPrimitiveInput(node, 'width', maxSide)
        setPrimitiveInput(node, 'height', maxSide)
      }
    }

    if (node.class_type === 'LayerUtility: ImageScaleByAspectRatio V2') {
      if (maxSide !== undefined) {
        setPrimitiveInput(node, 'scale_to_length', maxSide)
      }
    }

    if (node.class_type === 'CR SDXL Aspect Ratio') {
      if (width !== undefined && height !== undefined) {
        // 'width' 可能是链接如 ["20", 0]，此时 setPrimitiveInput 会去更改节点 20 的 'value'
        setPrimitiveInput(node, 'width', width)
        setPrimitiveInput(node, 'height', height)
      } else if (maxSide !== undefined) {
        setPrimitiveInput(node, 'width', maxSide)
        setPrimitiveInput(node, 'height', maxSide)
      }
    }
  }
}

/**
 * 等待执行完成并获取结果
 */
/**
 * 建立 WebSocket 连接
 */
function connectWebSocket(
  isSecure: boolean,
  serverEndpoint: string,
  clientId: string
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const wsUrl = `${getWsProtocol(isSecure)}://${serverEndpoint}/ws?clientId=${clientId}`
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false })

    // 设置 10s 连接超时
    const timer = setTimeout(() => {
      cleanup()
      ws.close()
      reject(new Error('WebSocket connection timeout'))
    }, 10000)

    const onOpen = () => {
      cleanup()
      resolve(ws)
    }

    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }

    ws.on('open', onOpen)
    ws.on('error', onError)

    function cleanup() {
      ws.off('open', onOpen)
      ws.off('error', onError)
      clearTimeout(timer)
    }
  })
}

/**
 * 监听任务完成
 */
/**
 * 监听任务完成
 */
function setupCompletionListener(
  ctx: Context,
  serverEndpoint: string,
  isSecure: boolean,
  ws: WebSocket,
  timeoutMs: number
) {
  const logger = ctx.logger('media-luna')
  let targetPromptId: string | undefined
  let resolved = false

  const completionPromise = new Promise<void>((resolve, reject) => {
    // 1. 超时定时器
    const timeoutTimer = setTimeout(() => {
      cleanup()
      if (!resolved) reject(new Error('ComfyUI execution timeout'))
    }, timeoutMs)

    // 2. 轮询定时器 (每 1s 检查一次历史记录)
    // 这是为了防止 WebSocket 事件丢失导致死锁
    const pollingTimer = setInterval(async () => {
      if (!targetPromptId || resolved) return

      try {
        const history = await getHistory(ctx, serverEndpoint, isSecure, targetPromptId)
        if (history) {
          logger.info('[comfyui] Task %s completed (detected via polling)', targetPromptId)
          resolved = true
          cleanup()
          resolve()
        }
      } catch (e) {
        // ignore polling errors
      }
    }, 1000)

    const onMessage = (data: any, isBinary: boolean) => {
      if (isBinary) return

      try {
        const message = JSON.parse(data.toString())

        // Debug log for relevant messages
        if (message.type === 'executing' || message.type === 'execution_error') {
          logger.debug('[comfyui] WS Message: %o', message)
        }

        // 检查执行完成
        if (
          message.type === 'executing' &&
          message.data.node === null &&
          message.data.prompt_id === targetPromptId
        ) {
          logger.info('[comfyui] Task %s completed (detected via WebSocket)', targetPromptId)
          resolved = true
          cleanup()
          resolve()
        }

        // 执行错误
        if (
          message.type === 'execution_error' &&
          message.data.prompt_id === targetPromptId
        ) {
          resolved = true
          cleanup()
          reject(new Error(`ComfyUI Error: ${JSON.stringify(message.data)}`))
        }
      } catch (e) {
        // ignore
      }
    }

    const onClose = () => {
      if (!resolved) {
        // WebSocket 断开不一定是错误，如果轮询能查到结果也算成功
        // 但这里我们简单处理，如果没有 targetPromptId 或者还没有完成，就报错
        // 实际生产中可能由于网络波动 ws 断开，但任务还在跑。
        // 由于我们有轮询，这里可以不立即 reject，而是等待超时。
        // 但为了保持逻辑简单，且 WS 断开通常意味着连接出了问题，我们记录日志。
        logger.warn('[comfyui] WebSocket connection closed unexpectedly')
      }
    }

    ws.on('message', onMessage)
    ws.on('close', onClose)

    function cleanup() {
      ws.off('message', onMessage)
      ws.off('close', onClose)
      clearTimeout(timeoutTimer)
      clearInterval(pollingTimer)
    }
  })

  return {
    setPromptId: (id: string) => { targetPromptId = id },
    completionPromise
  }
}

/** ComfyUI 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string,
  parameters?: Record<string, any>
): Promise<OutputAsset[]> {
  const logger = ctx.logger('media-luna')

  const {
    apiUrl,
    isSecureConnection = false,
    workflow,
    promptNodeId,
    imageCount = 1,
    imageNodeId1,
    imageNodeId2,
    imageNodeId3,
    avoidCache = true,
    timeout = 300
  } = config

  if (!workflow) {
    throw new Error('未配置 ComfyUI 工作流')
  }

  // 解析服务器地址
  const serverEndpoint = parseServerEndpoint(apiUrl)
  const isSecure = isSecureConnection || apiUrl.startsWith('https')

  // 解析工作流 JSON
  let workflowJson: any
  try {
    workflowJson = JSON.parse(workflow)
  } catch {
    throw new Error('工作流 JSON 格式无效')
  }

  // 1. 随机化 seed（避免缓存）
  workflowJson = modifyWorkflowToAvoidCache(workflowJson, avoidCache)

  // 应用用户命令行参数
  if (parameters) {
    applyParametersToWorkflow(workflowJson, parameters, config)
  }

  // 2. 替换提示词
  const workflowStr = JSON.stringify(workflowJson)
  if (workflowStr.includes(PROMPT_PLACEHOLDER)) {
    // 使用占位符模式
    workflowJson = JSON.parse(workflowStr.replaceAll(PROMPT_PLACEHOLDER, prompt))
  } else if (promptNodeId) {
    // 使用节点 ID 模式
    if (workflowJson[promptNodeId]?.inputs) {
      workflowJson[promptNodeId].inputs.text = prompt
    }
  } else {
    // 自动查找 CLIPTextEncode 节点
    const textNodeKey = Object.keys(workflowJson).find(
      k => workflowJson[k].class_type === 'CLIPTextEncode'
    )
    if (textNodeKey) {
      workflowJson[textNodeKey].inputs.text = prompt
    } else {
      logger.warn('[comfyui] 未找到提示词节点，工作流将使用原始提示词')
    }
  }

  // 3. 处理输入图片（支持多图）
  // 过滤非图片文件
  const imageFiles = files.filter(f => f.mime?.startsWith('image/'))

  // 检查图片数量是否符合配置要求
  if (imageFiles.length !== imageCount) {
    throw new Error(`图片数量不符：需要 ${imageCount} 张，实际提供了 ${imageFiles.length} 张`)
  }

  const uploadedImages: string[] = []

  if (imageFiles.length > 0) {
    logger.info('[comfyui] Found %d input images', imageFiles.length)

    // 上传所有图片
    for (const [index, imageFile] of imageFiles.entries()) {
      if (imageFile.data) {
        const filename = `input_${Date.now()}_${index}.png`
        logger.info('[comfyui] Uploading image %d/%d...', index + 1, imageFiles.length)
        const uploadResult = await uploadImage(ctx, serverEndpoint, isSecure, imageFile.data, filename)

        if (!uploadResult.success) {
          logger.error('[comfyui] Upload failed for image %d: %s', index + 1, uploadResult.error)
          throw new Error(`图片 ${index + 1} 上传失败: ${uploadResult.error}`)
        }

        const uploadedFilename = uploadResult.data?.name || filename
        uploadedImages.push(uploadedFilename)
      }
    }

    if (uploadedImages.length > 0) {
      logger.info('[comfyui] Images uploaded successfully. Assigning to LoadImage nodes...')

      // 查找所有 LoadImage 节点
      const loadImageNodes = Object.keys(workflowJson).filter(
        k => workflowJson[k].class_type === 'LoadImage'
      )

      if (loadImageNodes.length === 0) {
        logger.warn('[comfyui] Workflow has no LoadImage nodes, but input images were provided.')
      } else {
        const assignedNodes = new Set<string>()

        // 辅助函数：尝试分配图片到节点
        const assignImageToNode = (imageIndex: number, nodeId: string | undefined, imageFilename: string) => {
          if (nodeId && workflowJson[nodeId]) {
            workflowJson[nodeId].inputs.image = imageFilename
            assignedNodes.add(nodeId)
            logger.info('[comfyui] Assigned image %d to specified node %s', imageIndex + 1, nodeId)
            return true
          }
          return false
        }

        // 1. 优先尝试分配到指定 ID 的节点
        const imageNodeIds = [imageNodeId1, imageNodeId2, imageNodeId3]

        for (let i = 0; i < uploadedImages.length; i++) {
          const targetNodeId = imageNodeIds[i]
          if (targetNodeId) {
            assignImageToNode(i, targetNodeId, uploadedImages[i])
          }
        }

        // 2. 对于没有被指定 ID 分配的图片，顺序分配给尚未使用的 LoadImage 节点
        let currentNodeIndex = 0
        for (let i = 0; i < uploadedImages.length; i++) {
          // 如果该图片已经通过指定 ID 分配了，跳过
          // (注意：这里的逻辑是，如果 imageNodeId[i] 存在且有效，上面已经处理了。
          //  我们需要检查的是，这张图片是否 *已经* 被分配给了某个节点？ 
          //  上面的 assignImageToNode 直接修改了 workflowJson。这里我们需要知道这张图是否已经有着落了。
          //  为了简化，我们可以只对 *未指定* ID 的图片进行自动分配。

          if (imageNodeIds[i] && workflowJson[imageNodeIds[i]]) {
            continue // 已经指定了有效 ID，跳过自动分配
          }

          // 寻找下一个未使用的 LoadImage 节点
          while (currentNodeIndex < loadImageNodes.length && assignedNodes.has(loadImageNodes[currentNodeIndex])) {
            currentNodeIndex++
          }

          if (currentNodeIndex < loadImageNodes.length) {
            const nodeId = loadImageNodes[currentNodeIndex]
            workflowJson[nodeId].inputs.image = uploadedImages[i]
            assignedNodes.add(nodeId)
            logger.info('[comfyui] Auto-assigned image %d to node %s', i + 1, nodeId)
            currentNodeIndex++ // 移动到下一个节点
          } else {
            logger.warn('[comfyui] No available LoadImage node for image %d', i + 1)
          }
        }
      }
    }
  }

  // 4. 生成客户端 ID
  const clientId = Math.random().toString(36).substring(2, 15)

  let ws: WebSocket | undefined
  try {
    // 关键修复：先建立 WebSocket 连接，再提交任务
    // 这样可以确保不会漏掉执行开始和完成的事件，同时让服务器正确关联 Client ID
    ws = await connectWebSocket(isSecure, serverEndpoint, clientId)

    // 设置监听器
    // 设置监听器
    const { setPromptId, completionPromise } = setupCompletionListener(ctx, serverEndpoint, isSecure, ws, timeout * 1000)

    logger.info('[comfyui] Step 3: Queueing workflow...')
    const queueResponse = await ctx.http.post(
      `${getHttpProtocol(isSecure)}://${serverEndpoint}/prompt`,
      {
        prompt: workflowJson,
        client_id: clientId
      },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    )

    const promptId = queueResponse.prompt_id
    if (!promptId) {
      throw new Error('提交工作流失败：未返回 prompt_id')
    }

    // 更新监听的目标 ID
    setPromptId(promptId)
    logger.info('[comfyui] Step 4: Workflow queued: %s', promptId)

    // 5. 等待执行完成
    await completionPromise

    // 6. 从历史记录中获取输出图片
    const history = await getHistory(ctx, serverEndpoint, isSecure, promptId)
    const assets: OutputAsset[] = []

    if (history?.outputs) {
      for (const nodeId of Object.keys(history.outputs)) {
        const nodeOutput = history.outputs[nodeId]

        // 辅助函数：处理输出文件
        const processOutputFiles = async (outputFiles: any[], kind: 'image' | 'video') => {
          if (!Array.isArray(outputFiles)) return

          for (const fileInfo of outputFiles) {
            // 只获取 output 类型的文件
            if (fileInfo.type === 'output' || !fileInfo.type) {
              try {
                const fileBuffer = await getImage(
                  ctx,
                  serverEndpoint,
                  isSecure,
                  fileInfo.filename,
                  fileInfo.subfolder || '',
                  fileInfo.type || 'output'
                )

                // 简单的 MIME 推断
                let mime = ''
                const ext = fileInfo.filename.toLowerCase().split('.').pop()
                if (kind === 'image') {
                  mime = ext === 'png' ? 'image/png' : 'image/jpeg'
                } else {
                  if (ext === 'mp4') mime = 'video/mp4'
                  else if (ext === 'webm') mime = 'video/webm'
                  else if (ext === 'gif') mime = 'image/gif' // GIF 可以视为图片或视频
                  else mime = 'application/octet-stream'
                }

                // 修正 AssetKind
                const assetKind = (ext === 'gif') ? 'image' : kind
                const base64 = fileBuffer.toString('base64')

                assets.push({
                  kind: assetKind,
                  url: `data:${mime};base64,${base64}`,
                  mime,
                  meta: {
                    promptId,
                    filename: fileInfo.filename,
                    nodeId
                  }
                })
              } catch (e) {
                logger.warn('[comfyui] Failed to get output %s: %s', fileInfo.filename, e)
              }
            }
          }
        }

        // 处理图片输出
        if (nodeOutput.images) {
          await processOutputFiles(nodeOutput.images, 'image')
        }

        // 处理视频输出
        if (nodeOutput.videos) {
          await processOutputFiles(nodeOutput.videos, 'video')
        }

        // 处理 GIF 输出
        if (nodeOutput.gifs) {
          await processOutputFiles(nodeOutput.gifs, 'video')
        }
      }
    }

    if (assets.length === 0) {
      throw new Error('ComfyUI 执行完成但未返回图片')
    }

    return assets

  } finally {
    if (ws) {
      ws.close()
    }
  }
}

/** ComfyUI 连接器定义 */
export const ComfyUIConnector: ConnectorDefinition = {
  id: 'comfyui',
  name: 'ComfyUI',
  description: '基于节点的图像生成工作流，支持自定义 Workflow',
  icon: 'comfyui',
  supportedTypes: ['image', 'video'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2img', 'img2img', 'text2video', 'img2video'],
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
