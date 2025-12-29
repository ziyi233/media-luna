// OpenAI TTS 连接器
// 使用 OpenAI TTS API 进行语音合成，支持兼容接口

import { Context } from 'koishi'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorRequestLog } from '../../core'
import { connectorFields, connectorCardFields } from './config'

/** 默认配置值 */
const DEFAULTS = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'tts-1',
  voice: 'alloy',
  speed: 1.0,
  responseFormat: 'mp3'
}

/** 格式对应的 MIME 类型 */
const FORMAT_MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  pcm: 'audio/pcm'
}

/** OpenAI TTS 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const baseUrl = (config.baseUrl || DEFAULTS.baseUrl).replace(/\/$/, '')
  const apiKey = config.apiKey
  const model = config.model || DEFAULTS.model
  const voice = config.voice || DEFAULTS.voice
  const speed = parseFloat(config.speed) || DEFAULTS.speed
  const responseFormat = config.responseFormat || DEFAULTS.responseFormat

  if (!apiKey) {
    throw new Error('缺少 API Key 配置')
  }

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('请输入要合成的文本')
  }

  const logger = ctx.logger('media-luna')
  const endpoint = `${baseUrl}/audio/speech`

  logger.debug('OpenAI TTS request: model=%s, voice=%s, text=%s', model, voice, prompt.substring(0, 50))

  // 构建请求体
  const requestBody = {
    model,
    input: prompt,
    voice,
    response_format: responseFormat,
    speed
  }

  // 发送请求
  const response = await ctx.http(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    data: requestBody,
    responseType: 'arraybuffer'
  })

  const audioBuffer = Buffer.from(response.data)

  if (audioBuffer.length === 0) {
    throw new Error('OpenAI TTS 返回空音频数据')
  }

  // 转换为 base64 data URL
  const base64Audio = audioBuffer.toString('base64')
  const mimeType = FORMAT_MIME_MAP[responseFormat] || 'audio/mpeg'
  const dataUrl = `data:${mimeType};base64,${base64Audio}`

  logger.debug('OpenAI TTS complete: %d bytes', audioBuffer.length)

  return [{
    kind: 'audio',
    url: dataUrl,
    mime: mimeType,
    meta: {
      size: audioBuffer.length,
      model,
      voice
    }
  }]
}

/** OpenAI TTS 连接器定义 */
export const OpenAITTSConnector: ConnectorDefinition = {
  id: 'openai-tts',
  name: 'OpenAI TTS',
  description: 'OpenAI 语音合成 API，支持多种音色和高清模式',
  icon: 'openai',
  supportedTypes: ['audio'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2audio'],
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const baseUrl = (config.baseUrl || DEFAULTS.baseUrl).replace(/\/$/, '')
    return {
      endpoint: `${baseUrl}/audio/speech`,
      model: config.model || DEFAULTS.model,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      parameters: {
        voice: config.voice || DEFAULTS.voice,
        speed: parseFloat(config.speed) || DEFAULTS.speed,
        response_format: config.responseFormat || DEFAULTS.responseFormat
      }
    }
  }
}
