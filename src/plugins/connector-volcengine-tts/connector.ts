// 火山引擎 TTS 连接器
// 使用火山引擎豆包语音合成服务 - 单向流式 API

import { Context } from 'koishi'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorRequestLog } from '../../core'
import { connectorFields, connectorCardFields } from './config'

/** API 端点 */
const API_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'

/** 默认配置 */
const DEFAULTS = {
  resourceId: 'seed-tts-1.0',
  speaker: 'zh_female_shuangkuaisisi_moon_bigtts',
  format: 'mp3',
  sampleRate: 24000,
  speechRate: 0
}

/** 格式对应的 MIME 类型 */
const FORMAT_MIME_MAP: Record<string, string> = {
  'mp3': 'audio/mpeg',
  'ogg_opus': 'audio/ogg',
  'pcm': 'audio/pcm'
}

/** 火山引擎 TTS 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const appId = config.appId
  const accessKey = config.accessKey
  const resourceId = config.resourceId || DEFAULTS.resourceId
  const speaker = config.speaker || DEFAULTS.speaker
  const format = config.format || DEFAULTS.format
  const sampleRate = parseInt(config.sampleRate) || DEFAULTS.sampleRate
  const speechRate = parseInt(config.speechRate) || DEFAULTS.speechRate
  const emotion = config.emotion || ''
  const explicitLanguage = config.explicitLanguage || ''
  const disableMarkdownFilter = config.disableMarkdownFilter !== false
  const enableTimestamp = config.enableTimestamp === true

  if (!appId) {
    throw new Error('缺少 App ID 配置')
  }

  if (!accessKey) {
    throw new Error('缺少 Access Token 配置')
  }

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('请输入要合成的文本')
  }

  const logger = ctx.logger('media-luna')
  logger.debug('Volcengine TTS request: speaker=%s, text=%s', speaker, prompt.substring(0, 50))

  // 构建 audio_params
  const audioParams: Record<string, any> = {
    format: format,
    sample_rate: sampleRate,
    speech_rate: speechRate
  }

  // 如果设置了情感
  if (emotion) {
    audioParams.emotion = emotion
  }

  // 启用时间戳
  if (enableTimestamp) {
    audioParams.enable_timestamp = true
  }

  // 构建 additions 对象
  const additions: Record<string, any> = {}
  if (explicitLanguage) {
    additions.explicit_language = explicitLanguage
  }
  if (disableMarkdownFilter) {
    additions.disable_markdown_filter = true
  }
  if (enableTimestamp) {
    additions.enable_timestamp = true
  }

  // 构建请求体
  const requestBody: Record<string, any> = {
    user: {
      uid: 'media-luna'
    },
    req_params: {
      text: prompt,
      speaker: speaker,
      audio_params: audioParams
    }
  }

  // 如果有 additions 参数
  if (Object.keys(additions).length > 0) {
    requestBody.req_params.additions = JSON.stringify(additions)
  }

  // 发送请求 - 流式响应
  const response = await ctx.http(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-App-Id': appId,
      'X-Api-Access-Key': accessKey,
      'X-Api-Resource-Id': resourceId,
      'Connection': 'keep-alive'
    },
    data: requestBody,
    responseType: 'text'
  })

  // 解析流式响应，收集所有音频数据
  const audioChunks: Buffer[] = []
  const lines = response.data.split('\n')

  for (const line of lines) {
    if (!line.trim()) continue

    try {
      const json = JSON.parse(line)

      // 检查错误 - code 为 0 或不存在表示正常，20000000 表示成功结束
      if (json.code && json.code !== 0 && json.code !== 20000000) {
        throw new Error(json.message || `火山引擎 TTS 错误: ${json.code}`)
      }

      // 收集音频数据
      if (json.code === 0 && json.data) {
        const audioBuffer = Buffer.from(json.data, 'base64')
        audioChunks.push(audioBuffer)
      }

      // 句子信息（可用于调试）
      if (json.sentence) {
        logger.debug('Volcengine TTS sentence: %o', json.sentence)
      }

      // 成功结束
      if (json.code === 20000000) {
        if (json.usage) {
          logger.debug('Volcengine TTS usage: %o', json.usage)
        }
        break
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        // 忽略非 JSON 行
        continue
      }
      throw e
    }
  }

  if (audioChunks.length === 0) {
    throw new Error('火山引擎 TTS 未返回音频数据')
  }

  // 合并所有音频数据
  const audioBuffer = Buffer.concat(audioChunks)

  // 转换为 base64 data URL
  const base64Audio = audioBuffer.toString('base64')
  const mimeType = FORMAT_MIME_MAP[format] || 'audio/mpeg'
  const dataUrl = `data:${mimeType};base64,${base64Audio}`

  logger.debug('Volcengine TTS complete: %d bytes', audioBuffer.length)

  return [{
    kind: 'audio',
    url: dataUrl,
    mime: mimeType,
    meta: {
      size: audioBuffer.length,
      speaker,
      format
    }
  }]
}

/** 火山引擎 TTS 连接器定义 */
export const VolcengineTTSConnector: ConnectorDefinition = {
  id: 'volcengine-tts',
  name: '火山引擎 TTS',
  description: '火山引擎豆包语音合成服务，支持多音色、多情感',
  icon: 'volcengine',
  supportedTypes: ['audio'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2audio'],
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    return {
      endpoint: API_ENDPOINT,
      model: config.speaker || DEFAULTS.speaker,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      parameters: {
        resourceId: config.resourceId || DEFAULTS.resourceId,
        speaker: config.speaker || DEFAULTS.speaker,
        format: config.format || DEFAULTS.format,
        sampleRate: config.sampleRate || DEFAULTS.sampleRate,
        speechRate: config.speechRate || DEFAULTS.speechRate,
        emotion: config.emotion || '',
        explicitLanguage: config.explicitLanguage || '',
        disableMarkdownFilter: config.disableMarkdownFilter !== false,
        enableTimestamp: config.enableTimestamp === true
      }
    }
  }
}
