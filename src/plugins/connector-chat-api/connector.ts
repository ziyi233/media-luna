// Chat API 连接器
// 支持 OpenAI Chat Completions 兼容格式，从回复中提取多媒体内容

import { Context } from 'koishi'
import type { ConnectorDefinition, FileData, OutputAsset, ConnectorRequestLog } from '../../core'
import { connectorFields, connectorCardFields } from './config'

/** 媒体扩展名映射 */
const MEDIA_EXTENSIONS: Record<string, 'image' | 'video' | 'audio'> = {
  // 图片
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
  '.webp': 'image', '.svg': 'image', '.bmp': 'image', '.ico': 'image',
  // 视频
  '.mp4': 'video', '.webm': 'video', '.avi': 'video', '.mov': 'video', '.mkv': 'video',
  // 音频
  '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.flac': 'audio', '.m4a': 'audio'
}

/** 已知的媒体托管域名 */
const MEDIA_HOSTS: Record<string, 'image' | 'video'> = {
  'videos.openai.com': 'video',
  'oaidalleapiprodscus.blob.core.windows.net': 'image',
  'replicate.delivery': 'image',
  'i.imgur.com': 'image',
  'cdn.discordapp.com': 'image',
  'storage.googleapis.com': 'image'
}

/**
 * 判断媒体类型
 */
function getMediaKind(url: string): 'image' | 'video' | 'audio' | null {
  const lowerUrl = url.toLowerCase()

  // 1. 检查已知域名
  for (const [host, kind] of Object.entries(MEDIA_HOSTS)) {
    if (lowerUrl.includes(host)) return kind
  }

  // 2. 检查扩展名
  for (const [ext, kind] of Object.entries(MEDIA_EXTENSIONS)) {
    if (lowerUrl.includes(ext)) return kind
  }

  // 3. 启发式：URL 路径包含媒体类型关键词
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    if (pathname.includes('/image') || pathname.includes('/img') || pathname.includes('/photo')) {
      return 'image'
    }
    if (pathname.includes('/video') || pathname.includes('/vid')) {
      return 'video'
    }
    if (pathname.includes('/audio') || pathname.includes('/sound') || pathname.includes('/music')) {
      return 'audio'
    }
  } catch {
    // URL 解析失败，忽略
  }

  return null
}

/**
 * 从回复内容中提取多媒体 URL
 * 简化版：只提取 URL，自动判断类型
 */
function extractMediaFromContent(content: string, mode: string): OutputAsset[] {
  if (mode === 'text') {
    return [{ kind: 'text', content }]
  }

  const assets: OutputAsset[] = []
  const seenUrls = new Set<string>()

  // 1. 优先提取 Markdown 图片语法: ![alt](url)
  const markdownImgRegex = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g
  let match
  while ((match = markdownImgRegex.exec(content)) !== null) {
    const url = match[1]
    if (!seenUrls.has(url)) {
      seenUrls.add(url)
      // Markdown 图片语法明确是图片
      assets.push({ kind: 'image', url })
    }
  }

  // 2. 提取普通 URL
  const urlRegex = /https?:\/\/[^\s"'<>\[\]{}]+/g
  while ((match = urlRegex.exec(content)) !== null) {
    let url = match[0]
    // 清理末尾标点和括号
    url = url.replace(/[.,;:!?)]+$/, '')

    if (seenUrls.has(url)) continue

    const kind = getMediaKind(url)
    if (kind) {
      seenUrls.add(url)
      assets.push({ kind, url })
    }
  }

  // base64 图片
  if (mode === 'auto' || mode === 'base64') {
    const base64Regex = /data:(image\/[^;]+);base64,[A-Za-z0-9+/=]+/g
    while ((match = base64Regex.exec(content)) !== null) {
      if (!seenUrls.has(match[0])) {
        seenUrls.add(match[0])
        assets.push({ kind: 'image', url: match[0], mime: match[1] })
      }
    }
  }

  // 没有提取到媒体时返回空（不返回无关的文字回复）
  return assets
}

/** Chat API 生成函数 */
async function generate(
  ctx: Context,
  config: Record<string, any>,
  files: FileData[],
  prompt: string
): Promise<OutputAsset[]> {
  const {
    apiUrl,
    apiKey,
    model,
    systemPrompt = '',
    extractMode = 'auto',
    temperature = 0.7,
    topP = 1,
    presencePenalty = 0,
    frequencyPenalty = 0,
    stream = false,
    maxTokens = 40960,
    timeout = 600
  } = config

  // 验证必需配置
  if (!apiUrl) {
    throw new Error('API URL 未配置，请在渠道设置中配置 API URL')
  }
  if (!apiKey) {
    throw new Error('API Key 未配置，请在渠道设置中配置 API Key')
  }
  if (!model) {
    throw new Error('模型未配置，请在渠道设置中配置模型名称')
  }

  // 构建消息
  const messages: any[] = []

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }

  // 构建用户消息（支持多模态输入）
  if (files.length > 0) {
    const content: any[] = [{ type: 'text', text: prompt }]

    for (const file of files) {
      if (file.mime.startsWith('image/')) {
        // 将图片转为 base64
        const base64 = Buffer.from(file.data).toString('base64')
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${file.mime};base64,${base64}`
          }
        })
      } else if (file.mime.startsWith('video/')) {
        // 将视频转为 base64
        const base64 = Buffer.from(file.data).toString('base64')
        content.push({
          type: 'video_url',
          video_url: {
            url: `data:${file.mime};base64,${base64}`
          }
        })
      }
    }

    messages.push({ role: 'user', content })
  } else {
    messages.push({ role: 'user', content: prompt })
  }

  // 构建完整 API Endpoint
  const baseUrl = apiUrl.replace(/\/$/, '')
  const endpoint = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`

  // 发送请求
  const requestBody: any = {
    model,
    messages,
    stream: Boolean(stream),
    max_tokens: Number(maxTokens)
  }

  // 仅在非默认值时添加参数
  if (temperature != null) requestBody.temperature = Number(temperature)
  if (topP != null) requestBody.top_p = Number(topP)
  if (presencePenalty) requestBody.presence_penalty = Number(presencePenalty)
  if (frequencyPenalty) requestBody.frequency_penalty = Number(frequencyPenalty)

  const response = await ctx.http.post(endpoint, requestBody, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': '*/*'
    },
    timeout: timeout * 1000,
    responseType: stream ? 'text' : 'json'
  })

  let content = ''
  if (stream) {
    // 处理流式响应
    const lines = (response as string).split('\n')
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      // SSE 格式: data: {...}
      if (trimmedLine.startsWith('data: ')) {
        const data = trimmedLine.slice(6)
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) content += delta
        } catch (e) {
          // ignore parse error
        }
      }
      // 非 SSE 格式：每行直接是 JSON（某些 API 的流式格式）
      else if (trimmedLine.startsWith('{')) {
        try {
          const json = JSON.parse(trimmedLine)
          // 尝试 delta 格式
          const delta = json.choices?.[0]?.delta?.content
          if (delta) {
            content += delta
            continue
          }
          // 尝试 message 格式
          const message = json.choices?.[0]?.message?.content
          if (message) {
            content += message
          }
        } catch (e) {
          // ignore parse error
        }
      }
    }

    // 如果没有解析出内容，尝试直接解析整个响应
    if (!content) {
      try {
        const json = JSON.parse(response as string)
        content = json.choices?.[0]?.message?.content || ''
      } catch {
        // ignore
      }
    }
  } else {
    // 提取回复内容
    const choice = (response as any).choices?.[0]
    if (!choice) {
      throw new Error('No response from Chat API')
    }
    content = choice.message?.content || ''
  }

  // 根据提取模式处理回复
  return extractMediaFromContent(content, extractMode)
}

/** Chat API 连接器定义 */
export const ChatApiConnector: ConnectorDefinition = {
  id: 'chat-api',
  name: 'Chat API',
  description: '通用 OpenAI 兼容接口',
  icon: 'openai',
  supportedTypes: ['image', 'audio', 'video'],
  fields: connectorFields,
  cardFields: connectorCardFields,
  defaultTags: ['text2img', 'img2img', 'text2video', 'img2video', 'text2audio'],
  generate,

  /** 获取请求日志 */
  getRequestLog(config, files, prompt): ConnectorRequestLog {
    const {
      apiUrl,
      model,
      systemPrompt = '',
      extractMode = 'auto',
      temperature = 0.7,
      maxTokens = 40960
    } = config

    return {
      endpoint: apiUrl?.split('?')[0],
      model,
      prompt,
      fileCount: files.length,
      parameters: {
        systemPrompt: systemPrompt ? `${systemPrompt.slice(0, 100)}${systemPrompt.length > 100 ? '...' : ''}` : undefined,
        extractMode,
        temperature,
        maxTokens,
        hasImages: files.some(f => f.mime.startsWith('image/')),
        hasVideos: files.some(f => f.mime.startsWith('video/'))
      }
    }
  }
}
