import type { GenerationResult } from '../../../types'

export interface DeliveryPolicyConfig {
  linkModeEnabled?: boolean
  linkModeTags?: string
  linkModeExcludePlatforms?: string
  outputTextContent?: boolean
}

export interface FormatResultOptions {
  config?: DeliveryPolicyConfig
  channelTags?: string[]
  platform?: string
  channelName?: string
  lastSuccessTime?: Date | null
  linkModeTag?: string | null
}

export function resolveLinkMode(config: DeliveryPolicyConfig, channelTags: string[], platform?: string): string | null {
  if (!config.linkModeEnabled) return null
  if (!config.linkModeTags || typeof config.linkModeTags !== 'string' || !channelTags.length) return null

  if (platform && config.linkModeExcludePlatforms) {
    const excludePlatforms = config.linkModeExcludePlatforms.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
    if (excludePlatforms.includes(platform.toLowerCase())) return null
  }

  const linkTags = config.linkModeTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  if (linkTags.length === 0) return null

  const channelTagsLower = channelTags.map(t => t.toLowerCase())
  for (const tag of linkTags) {
    if (channelTagsLower.includes(tag)) {
      const originalIndex = channelTagsLower.indexOf(tag)
      return channelTags[originalIndex]
    }
  }

  return null
}

export function formatGenerationResult(result: GenerationResult, options: FormatResultOptions = {}): string {
  const config = options.config || {}
  const outputTextContent = config.outputTextContent ?? false
  const linkModeTag = options.linkModeTag !== undefined
    ? options.linkModeTag
    : resolveLinkMode(config, options.channelTags || [], options.platform)

  const lastSuccessInfo = options.lastSuccessTime && options.channelName
    ? `「${options.channelName}」上次成功: ${formatChinaTime(options.lastSuccessTime)}`
    : null

  if (!result.success) {
    const messages: string[] = []
    if (result.taskId) {
      messages.push(`「${result.taskId}」`)
    }
    messages.push(`生成失败: ${result.error || '未知错误'}`)
    appendFooterInfo(messages, result, lastSuccessInfo)
    return messages.join('\n')
  }

  if (!result.output || result.output.length === 0) {
    const messages: string[] = []
    if (result.taskId) {
      messages.push(`「${result.taskId}」`)
    }
    messages.push('生成完成，但没有输出')
    appendFooterInfo(messages, result, lastSuccessInfo)
    return messages.join('\n')
  }

  const hasVideo = result.output.some(a => a.kind === 'video' && a.url)
  const hasAudio = result.output.some(a => a.kind === 'audio' && a.url)
  const hasImage = result.output.some(a => a.kind === 'image' && a.url)
  const hasText = outputTextContent && result.output.some(a => a.kind === 'text' && a.content)

  if (hasAudio && !hasVideo && !hasImage && !hasText) {
    const audioElements: string[] = []
    for (const asset of result.output) {
      if (asset.kind === 'audio' && asset.url) {
        audioElements.push(`<audio url="${asset.url}"/>`)
      }
    }
    return audioElements.join('\n')
  }

  if (hasVideo) {
    return formatVideoResult(result, linkModeTag, outputTextContent, lastSuccessInfo)
  }

  if (linkModeTag) {
    return formatLinkModeResult(result, linkModeTag, outputTextContent, lastSuccessInfo)
  }

  return formatStandardResult(result, outputTextContent, lastSuccessInfo)
}

function formatVideoResult(
  result: GenerationResult,
  linkModeTag: string | null = null,
  outputTextContent: boolean = false,
  lastSuccessInfo: string | null = null
): string {
  const forwardMessages: string[] = []
  const infoLines: string[] = []

  if (result.taskId) {
    infoLines.push(`任务「${result.taskId}」`)
  }
  if (result.duration) {
    infoLines.push(`耗时 ${formatDuration(result.duration)}`)
  }
  if (result.hints?.after && result.hints.after.length > 0) {
    infoLines.push(...result.hints.after)
  }
  if (infoLines.length > 0) {
    forwardMessages.push(`<message>${infoLines.join(' | ')}</message>`)
  }

  if (lastSuccessInfo) {
    forwardMessages.push(`<message>${lastSuccessInfo}</message>`)
  }

  if (linkModeTag) {
    forwardMessages.push(`<message>📎 因渠道标签 [${linkModeTag}] 启用链接模式</message>`)
  }

  for (const asset of result.output || []) {
    if (asset.kind === 'video' && asset.url) {
      if (linkModeTag) {
        forwardMessages.push(`<message>${asset.url}</message>`)
      } else {
        forwardMessages.push(`<message><video url="${asset.url}"/></message>`)
      }
    } else if (asset.kind === 'image' && asset.url) {
      if (linkModeTag) {
        forwardMessages.push(`<message>${asset.url}</message>`)
      } else {
        forwardMessages.push(`<message><image url="${asset.url}"/></message>`)
      }
    } else if (asset.kind === 'audio' && asset.url) {
      forwardMessages.push(`<message><audio url="${asset.url}"/></message>`)
    } else if (outputTextContent && asset.kind === 'text' && asset.content) {
      forwardMessages.push(`<message>${asset.content}</message>`)
    }
  }

  return `<message forward>${forwardMessages.join('')}</message>`
}

function formatLinkModeResult(
  result: GenerationResult,
  linkModeTag: string,
  outputTextContent: boolean = false,
  lastSuccessInfo: string | null = null
): string {
  const forwardMessages: string[] = []
  const infoLines: string[] = []

  if (result.taskId) {
    infoLines.push(`任务「${result.taskId}」`)
  }
  if (result.duration) {
    infoLines.push(`耗时 ${formatDuration(result.duration)}`)
  }
  if (result.hints?.after && result.hints.after.length > 0) {
    infoLines.push(...result.hints.after)
  }
  if (infoLines.length > 0) {
    forwardMessages.push(`<message>${infoLines.join(' | ')}</message>`)
  }

  if (lastSuccessInfo) {
    forwardMessages.push(`<message>${lastSuccessInfo}</message>`)
  }

  forwardMessages.push(`<message>📎 因渠道标签 [${linkModeTag}] 启用链接模式</message>`)

  for (const asset of result.output || []) {
    if (asset.kind === 'image' && asset.url) {
      forwardMessages.push(`<message>${asset.url}</message>`)
    } else if (asset.kind === 'video' && asset.url) {
      forwardMessages.push(`<message>${asset.url}</message>`)
    } else if (asset.kind === 'audio' && asset.url) {
      forwardMessages.push(`<message><audio url="${asset.url}"/></message>`)
    } else if (outputTextContent && asset.kind === 'text' && asset.content) {
      forwardMessages.push(`<message>${asset.content}</message>`)
    }
  }

  return `<message forward>${forwardMessages.join('')}</message>`
}

function formatStandardResult(
  result: GenerationResult,
  outputTextContent: boolean = false,
  lastSuccessInfo: string | null = null
): string {
  const messages: string[] = []

  if (result.taskId) {
    messages.push(`「${result.taskId}」`)
  }

  for (const asset of result.output || []) {
    if (asset.kind === 'image' && asset.url) {
      messages.push(`<image url="${asset.url}"/>`)
    } else if (asset.kind === 'audio' && asset.url) {
      messages.push(`<audio url="${asset.url}"/>`)
    } else if (asset.kind === 'video' && asset.url) {
      messages.push(`<video url="${asset.url}"/>`)
    } else if (outputTextContent && asset.kind === 'text' && asset.content) {
      messages.push(asset.content)
    }
  }

  appendFooterInfo(messages, result, lastSuccessInfo)
  return messages.join('\n')
}

function appendFooterInfo(messages: string[], result: GenerationResult, lastSuccessInfo: string | null = null): void {
  const footerParts: string[] = []

  if (result.duration) {
    footerParts.push(`耗时 ${formatDuration(result.duration)}`)
  }

  if (result.hints?.after && result.hints.after.length > 0) {
    footerParts.push(...result.hints.after)
  }

  if (footerParts.length > 0) {
    messages.push(footerParts.join(' | '))
  }

  if (lastSuccessInfo) {
    messages.push(lastSuccessInfo)
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = (seconds % 60).toFixed(0)
  return `${minutes}m ${remainingSeconds}s`
}

function formatChinaTime(date: Date): string {
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}
