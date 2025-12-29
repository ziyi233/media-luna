// Azure TTS 连接器
// 通过微软翻译器 App 接口免费使用 Azure 语音服务

import { Context } from 'koishi'
import crypto from 'crypto'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorRequestLog } from '../../core'
import { connectorFields, connectorCardFields } from './config'

/** 常量定义 */
const ENDPOINT_URL = 'https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0'
const USER_AGENT = 'okhttp/4.5.0'
const CLIENT_VERSION = '4.0.530a 5fe1dc6c'
const USER_ID = '0f04d16a175c411e'
const HOME_GEOGRAPHIC_REGION = 'zh-Hans-CN'
const CLIENT_TRACE_ID = 'aab069b9-70a7-4844-a734-96cd78d94be9'
const VOICE_DECODE_KEY = 'oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw=='

/** 默认配置 */
const DEFAULTS = {
  voice: 'zh-CN-XiaoxiaoMultilingualNeural',
  rate: '0',
  pitch: '0',
  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
  style: 'general'
}

/** 格式对应的 MIME 类型 */
const FORMAT_MIME_MAP: Record<string, string> = {
  'audio-24khz-48kbitrate-mono-mp3': 'audio/mpeg',
  'audio-24khz-96kbitrate-mono-mp3': 'audio/mpeg',
  'audio-24khz-160kbitrate-mono-mp3': 'audio/mpeg',
  'audio-48khz-96kbitrate-mono-mp3': 'audio/mpeg',
  'audio-48khz-192kbitrate-mono-mp3': 'audio/mpeg',
  'ogg-24khz-16bit-mono-opus': 'audio/ogg',
  'ogg-48khz-16bit-mono-opus': 'audio/ogg',
  'raw-24khz-16bit-mono-pcm': 'audio/pcm',
  'raw-48khz-16bit-mono-pcm': 'audio/pcm',
  'webm-24khz-16bit-mono-opus': 'audio/webm'
}

/** 缓存的 endpoint 信息 */
let cachedEndpoint: { t: string, r: string } | null = null
let endpointExpiredAt = 0

/** 生成签名 */
function sign(urlStr: string): string {
  const u = urlStr.split('://')[1]
  const encodedUrl = encodeURIComponent(u)
  const uuidStr = crypto.randomUUID().replace(/-/g, '')

  // 生成格式化日期
  const now = new Date()
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const formattedDate = `${days[now.getUTCDay()]}, ${String(now.getUTCDate()).padStart(2, '0')} ${months[now.getUTCMonth()]} ${now.getUTCFullYear()} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}gmt`

  const bytesToSign = `MSTranslatorAndroidApp${encodedUrl}${formattedDate}${uuidStr}`.toLowerCase()

  const decode = Buffer.from(VOICE_DECODE_KEY, 'base64')
  const hmacSha256 = crypto.createHmac('sha256', decode)
  hmacSha256.update(bytesToSign)
  const secretKey = hmacSha256.digest()
  const signBase64 = secretKey.toString('base64')

  return `MSTranslatorAndroidApp::${signBase64}::${formattedDate}::${uuidStr}`
}

/** 获取 endpoint */
async function getEndpoint(ctx: Context): Promise<{ t: string, r: string }> {
  const currentTime = Math.floor(Date.now() / 1000)

  // 检查缓存是否有效（提前 60 秒刷新）
  if (cachedEndpoint && currentTime < endpointExpiredAt - 60) {
    return cachedEndpoint
  }

  const signature = sign(ENDPOINT_URL)

  const response = await ctx.http.post(ENDPOINT_URL, null, {
    headers: {
      'Accept-Language': 'zh-Hans',
      'X-ClientVersion': CLIENT_VERSION,
      'X-UserId': USER_ID,
      'X-HomeGeographicRegion': HOME_GEOGRAPHIC_REGION,
      'X-ClientTraceId': CLIENT_TRACE_ID,
      'X-MT-Signature': signature,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': '0',
      'Accept-Encoding': 'gzip'
    }
  })

  // 解析 JWT 获取过期时间
  const jwt = response.t.split('.')[1]
  const decodedJwt = JSON.parse(Buffer.from(jwt, 'base64').toString('utf-8'))
  endpointExpiredAt = decodedJwt.exp

  cachedEndpoint = response
  return response
}

/** 生成 SSML */
function getSSML(text: string, voice: string, rate: string, pitch: string, style: string): string {
  // 转义 XML 特殊字符
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

  return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN">
<voice name="${voice}">
    <mstts:express-as style="${style}" styledegree="1.0" role="default">
        <prosody rate="${rate}%" pitch="${pitch}%">
            ${escapedText}
        </prosody>
    </mstts:express-as>
</voice>
</speak>`
}

/** Azure TTS 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const voice = config.voice || DEFAULTS.voice
  const rate = config.rate || DEFAULTS.rate
  const pitch = config.pitch || DEFAULTS.pitch
  const outputFormat = config.outputFormat || DEFAULTS.outputFormat
  const style = config.style || DEFAULTS.style

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('请输入要合成的文本')
  }

  const logger = ctx.logger('media-luna')
  logger.debug('Azure TTS request: voice=%s, style=%s, text=%s', voice, style, prompt.substring(0, 50))

  // 获取 endpoint
  const endpoint = await getEndpoint(ctx)
  const ttsUrl = `https://${endpoint.r}.tts.speech.microsoft.com/cognitiveservices/v1`

  // 生成 SSML
  const ssml = getSSML(prompt, voice, rate, pitch, style)

  // 发送请求
  const response = await ctx.http(ttsUrl, {
    method: 'POST',
    headers: {
      'Authorization': endpoint.t,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': outputFormat,
      'User-Agent': USER_AGENT
    },
    data: ssml,
    responseType: 'arraybuffer'
  })

  const audioBuffer = Buffer.from(response.data)

  if (audioBuffer.length === 0) {
    throw new Error('Azure TTS 返回空音频数据')
  }

  // 转换为 base64 data URL
  const base64Audio = audioBuffer.toString('base64')
  const mimeType = FORMAT_MIME_MAP[outputFormat] || 'audio/mpeg'
  const dataUrl = `data:${mimeType};base64,${base64Audio}`

  logger.debug('Azure TTS complete: %d bytes', audioBuffer.length)

  return [{
    kind: 'audio',
    url: dataUrl,
    mime: mimeType,
    meta: {
      size: audioBuffer.length,
      voice,
      style
    }
  }]
}

/** Azure TTS 连接器定义 */
export const AzureTTSConnector: ConnectorDefinition = {
  id: 'azure-tts',
  name: 'Azure TTS',
  description: '微软 Azure 语音合成服务，免费使用，支持多语言和语音风格',
  icon: 'azure',
  supportedTypes: ['audio'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2audio'],
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    return {
      endpoint: 'Azure TTS (via Translator)',
      model: config.voice || DEFAULTS.voice,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      parameters: {
        voice: config.voice || DEFAULTS.voice,
        style: config.style || DEFAULTS.style,
        rate: config.rate || DEFAULTS.rate,
        pitch: config.pitch || DEFAULTS.pitch,
        outputFormat: config.outputFormat || DEFAULTS.outputFormat
      }
    }
  }
}
