// ModelScope 连接器

import { Context } from 'koishi'
import { createHash } from 'crypto'
import type { ConnectorDefinition, OutputAsset, FileData, ConnectorRequestLog } from '../../core/types'
import { connectorFields, connectorCardFields, type ModelScopeApiKeyEntry } from './config'

interface ResolvedApiKey {
  key: string
  index: number
  weight: number
  note?: string
}

function resolveApiKeys(config: Record<string, any>): ResolvedApiKey[] {
  const result: ResolvedApiKey[] = []
  const rawApiKeys = Array.isArray(config.apiKeys) ? config.apiKeys : []

  for (let index = 0; index < rawApiKeys.length; index++) {
    const item = rawApiKeys[index] as ModelScopeApiKeyEntry | undefined
    const key = typeof item?.key === 'string' ? item.key.trim() : ''
    if (!key) continue
    if (item?.enabled === false) continue
    const weight = Number(item?.weight)
    result.push({
      key,
      index,
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
      note: typeof item?.note === 'string' ? item.note.trim() || undefined : undefined
    })
  }

  if (result.length > 0) return result

  const fallbackKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
  if (!fallbackKey) return []
  return [{ key: fallbackKey, index: 0, weight: 1 }]
}

function computeStableKeySeed(prompt: string, config: Record<string, any>, files: FileData[]): number {
  const seedInput = JSON.stringify({
    model: config.model || '',
    prompt,
    width: config.width || null,
    height: config.height || null,
    fileCount: files.length,
    firstFileName: files[0]?.filename || '',
    firstFileMime: files[0]?.mime || ''
  })
  const hash = createHash('sha256').update(seedInput).digest()
  return hash.readUInt32BE(0)
}

function buildApiKeyAttemptOrder(prompt: string, config: Record<string, any>, files: FileData[]): ResolvedApiKey[] {
  const keys = resolveApiKeys(config)
  if (keys.length <= 1) return keys

  const totalWeight = keys.reduce((sum, item) => sum + item.weight, 0)
  const seed = computeStableKeySeed(prompt, config, files)
  let cursor = totalWeight > 0 ? seed % totalWeight : 0
  let selectedIndex = 0

  for (let index = 0; index < keys.length; index++) {
    cursor -= keys[index].weight
    if (cursor < 0) {
      selectedIndex = index
      break
    }
  }

  return [
    ...keys.slice(selectedIndex),
    ...keys.slice(0, selectedIndex)
  ]
}

function shouldRetryWithNextKey(error: any): boolean {
  const status = Number(error?.response?.status ?? error?.status)
  if ([401, 403, 429].includes(status)) return true

  const message = String(error?.message || error || '').toLowerCase()
  return message.includes('401')
    || message.includes('403')
    || message.includes('429')
    || message.includes('rate limit')
    || message.includes('too many requests')
    || message.includes('unauthorized')
    || message.includes('forbidden')
    || message.includes('invalid api key')
    || message.includes('token is invalid')
}

/** ModelScope 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl = 'https://api-inference.modelscope.cn/',
    model = 'MusePublic/Qwen-image',
    enableImageInput = false,
    negativePrompt,
    width,
    height,
    numImages,
    steps,
    guidance,
    seed,
    loras,
    timeout = 300,
    pollInterval = 5000
  } = config

  const apiKeyAttempts = buildApiKeyAttemptOrder(prompt, config, files)
  if (apiKeyAttempts.length === 0) {
    throw new Error('ModelScope API Key is required')
  }

  const baseUrl = apiUrl.endsWith('/') ? apiUrl : apiUrl + '/'

  // 构建请求体 - 仅包含 API 支持的参数
  const requestBody: Record<string, any> = {
    model,
    prompt
  }

  // 可选参数 - 仅在有值时添加
  if (negativePrompt) {
    requestBody.negative_prompt = negativePrompt
  }

  // size 参数格式：宽x高
  if (width && height) {
    requestBody.size = `${width}x${height}`
  }

  // n 参数：生成数量
  if (numImages && numImages > 1) {
    requestBody.n = Number(numImages)
  }

  if (seed !== undefined && seed !== null && seed !== '') {
    requestBody.seed = Number(seed)
  }

  // steps 参数：采样步数
  if (steps !== undefined && steps !== null && steps !== '') {
    requestBody.steps = Number(steps)
  }

  // guidance 参数：提示词引导系数
  if (guidance !== undefined && guidance !== null && guidance !== '') {
    requestBody.guidance = Number(guidance)
  }

  // 处理图片输入（如果启用且有图片）
  // ModelScope 参考图字段为 image_url（数组），单个字符串的 image 字段会被静默忽略
  if (enableImageInput && files.length > 0) {
    const imageFiles = files.filter(f => f.mime?.startsWith('image/') && f.data)
    if (imageFiles.length > 0) {
      requestBody.image_url = imageFiles.map(f => {
        const base64 = Buffer.from(f.data).toString('base64')
        return `data:${f.mime};base64,${base64}`
      })
      ctx.logger('media-luna').debug('[ModelScope] Image input enabled, added %d reference image(s)', imageFiles.length)
    }
  }

  // 处理 LoRA 配置
  if (loras) {
    try {
      if (typeof loras === 'string') {
        const trimmed = loras.trim()
        if (trimmed.startsWith('{')) {
          // JSON 对象格式
          requestBody.loras = JSON.parse(trimmed)
        } else if (trimmed.startsWith('[')) {
          // JSON 数组格式，转换为对象
          const parsed = JSON.parse(trimmed)
          const loraObj: Record<string, number> = {}
          for (const item of parsed) {
            loraObj[item.lora_id || item.repoId || item] = item.weight ?? 1
          }
          requestBody.loras = loraObj
        } else {
          // 单个 LoRA repo ID
          requestBody.loras = trimmed
        }
      } else if (typeof loras === 'object') {
        requestBody.loras = loras
      }
    } catch (e) {
      ctx.logger('media-luna').warn('[ModelScope] Failed to parse loras config:', e)
    }
  }

  ctx.logger('media-luna').debug('[ModelScope] Request body: %o', requestBody)

  let lastError: any = null
  for (let attemptIndex = 0; attemptIndex < apiKeyAttempts.length; attemptIndex++) {
    const apiKeyEntry = apiKeyAttempts[attemptIndex]
    const headers = {
      'Authorization': `Bearer ${apiKeyEntry.key}`,
      'Content-Type': 'application/json',
      'X-ModelScope-Async-Mode': 'true'
    }

    try {
      ctx.logger('media-luna').debug('[ModelScope] Using api key #%d%s', apiKeyEntry.index + 1, apiKeyEntry.note ? ` (${apiKeyEntry.note})` : '')

      const createResponse = await ctx.http.post(`${baseUrl}v1/images/generations`, requestBody, {
        headers,
        timeout: 30000
      })

      ctx.logger('media-luna').debug('[ModelScope] Create response: %o', createResponse)

      const taskId = createResponse.task_id
      if (!taskId) {
        throw new Error(`No task_id in response: ${JSON.stringify(createResponse)}`)
      }

      const startTime = Date.now()
      const timeoutMs = timeout * 1000

      while (Date.now() - startTime < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, pollInterval))

        const statusResponse = await ctx.http.get(`${baseUrl}v1/tasks/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${apiKeyEntry.key}`,
            'Content-Type': 'application/json',
            'X-ModelScope-Task-Type': 'image_generation'
          },
          timeout: 30000
        })

        ctx.logger('media-luna').debug('[ModelScope] Status response: %o', statusResponse)

        const taskStatus = statusResponse.task_status

        if (taskStatus === 'SUCCEED') {
          const outputImages = statusResponse.output_images || []
          return outputImages.map((url: string) => ({
            kind: 'image' as const,
            url,
            mime: 'image/png',
            meta: { source: 'modelscope', model, taskId, apiKeyIndex: apiKeyEntry.index }
          }))
        }

        if (taskStatus === 'FAILED') {
          throw new Error(statusResponse.message || 'ModelScope generation failed')
        }
      }

      throw new Error('ModelScope generation timed out')
    } catch (error) {
      lastError = error
      const canRetry = attemptIndex < apiKeyAttempts.length - 1 && shouldRetryWithNextKey(error)
      ctx.logger('media-luna').warn('[ModelScope] api key #%d failed%s: %s', apiKeyEntry.index + 1, canRetry ? ', fallback next key' : '', error instanceof Error ? error.message : String(error))
      if (!canRetry) {
        throw error
      }
    }
  }

  throw lastError || new Error('ModelScope generation failed')
}

/** ModelScope 连接器定义 */
export const ModelScopeConnector: ConnectorDefinition = {
  id: 'modelscope',
  name: 'ModelScope',
  description: '阿里魔搭社区图像生成 API，支持通义万相等模型',
  icon: 'modelscope',
  supportedTypes: ['image'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2img', 'img2img'],
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const {
      apiUrl = 'https://api-inference.modelscope.cn/',
      model = 'MusePublic/Qwen-image',
      enableImageInput = false,
      width,
      height,
      numImages,
      steps,
      guidance,
      seed,
      loras
    } = config
    const apiKeys = resolveApiKeys(config)

    // 计算实际会发送的图片数量
    const imageCount = enableImageInput
      ? files.filter(f => f.mime?.startsWith('image/')).length
      : 0

    return {
      endpoint: apiUrl?.split('?')[0],
      model,
      prompt,
      fileCount: imageCount,
      parameters: {
        size: width && height ? `${width}x${height}` : undefined,
        n: numImages ? Number(numImages) : undefined,
        steps: steps ? Number(steps) : undefined,
        guidance: guidance ? Number(guidance) : undefined,
        seed: seed !== undefined && seed !== null && seed !== '' ? Number(seed) : undefined,
        loras: loras || undefined,
        imageInput: enableImageInput && imageCount > 0 ? true : undefined,
        apiKeyCount: apiKeys.length > 0 ? apiKeys.length : undefined
      }
    }
  }
}
