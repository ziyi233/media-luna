// 审核绕过中间件
// 通过前置提示词注入和 Unicode 编码绕过内容审核

import {
  MiddlewareDefinition,
  MiddlewareContext,
  MiddlewareRunStatus
} from '../../types'
import { CensorBypassConfig, defaultCensorBypassConfig } from './config'

/**
 * 判断字符是否为中文
 */
function isChinese(char: string): boolean {
  const code = char.codePointAt(0) || 0
  // CJK 统一汉字范围
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
    (code >= 0x20000 && code <= 0x2A6DF) || // CJK Extension B
    (code >= 0x2A700 && code <= 0x2B73F) || // CJK Extension C
    (code >= 0x2B740 && code <= 0x2B81F) || // CJK Extension D
    (code >= 0x2B820 && code <= 0x2CEAF) || // CJK Extension E
    (code >= 0x2CEB0 && code <= 0x2EBEF) || // CJK Extension F
    (code >= 0xF900 && code <= 0xFAFF) ||   // CJK Compatibility Ideographs
    (code >= 0x2F800 && code <= 0x2FA1F)    // CJK Compatibility Supplement
  )
}

/**
 * 判断字符是否为非 ASCII
 */
function isNonAscii(char: string): boolean {
  const code = char.codePointAt(0) || 0
  return code > 127
}

/**
 * 将字符编码为 Unicode 转义序列
 */
function encodeCharUnicode(char: string): string {
  const code = char.codePointAt(0) || 0
  if (code > 0xFFFF) {
    // 处理 surrogate pair (emoji 等)
    const high = Math.floor((code - 0x10000) / 0x400) + 0xD800
    const low = ((code - 0x10000) % 0x400) + 0xDC00
    return `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`
  }
  return `\\u${code.toString(16).padStart(4, '0')}`
}

/**
 * 将字符编码为 HTML 实体
 */
function encodeCharHtmlEntity(char: string): string {
  const code = char.codePointAt(0) || 0
  return `&#x${code.toString(16)};`
}

/**
 * 将字符编码为 URL 编码
 */
function encodeCharUrl(char: string): string {
  return encodeURIComponent(char)
}

/**
 * 根据配置编码 prompt
 */
function encodePrompt(prompt: string, config: CensorBypassConfig): string {
  if (!config.enableUnicodeEscape) {
    return prompt
  }

  const chars = [...prompt]
  let encoded = ''

  for (const char of chars) {
    let shouldEncode = false

    switch (config.encodeRange) {
      case 'chinese':
        shouldEncode = isChinese(char)
        break
      case 'non-ascii':
        shouldEncode = isNonAscii(char)
        break
      case 'all':
        // 编码所有字符，除了空格和换行
        shouldEncode = char !== ' ' && char !== '\n' && char !== '\r' && char !== '\t'
        break
    }

    if (shouldEncode) {
      switch (config.escapeFormat) {
        case 'unicode':
          encoded += encodeCharUnicode(char)
          break
        case 'html-entity':
          encoded += encodeCharHtmlEntity(char)
          break
        case 'url-encode':
          encoded += encodeCharUrl(char)
          break
        default:
          encoded += encodeCharUnicode(char)
      }
    } else {
      encoded += char
    }
  }

  // 添加解码提示
  if (config.addDecodeHint && config.decodeHintTemplate) {
    encoded = config.decodeHintTemplate + encoded
  }

  return encoded
}

/**
 * 创建审核绕过中间件
 */
export function createCensorBypassMiddleware(): MiddlewareDefinition {
  return {
    name: 'prompt-censor-bypass',
    displayName: '审核绕过',
    description: '通过前置提示词注入和 Unicode 编码绕过内容审核',
    category: 'transform',
    phase: 'lifecycle-pre-request',
    after: ['preset'], // 确保在预设处理之后运行

    async execute(context: MiddlewareContext, next) {
      // 获取配置
      const mwConfig = await context.getMiddlewareConfig<CensorBypassConfig>('prompt-censor-bypass')
      const config: CensorBypassConfig = {
        ...defaultCensorBypassConfig,
        ...(mwConfig || {})
      }

      // 解析匹配标签
      const matchTags = config.matchChannelTags
        ? config.matchChannelTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
        : []

      // 获取渠道标签
      const channelTags = (context.channel?.tags || []).map(t => t.toLowerCase())

      // 检查是否匹配渠道标签
      const shouldApply = matchTags.length === 0 || matchTags.some(tag => channelTags.includes(tag))

      // 调试日志：输出配置
      context.setMiddlewareLog('prompt-censor-bypass-debug', {
        mwConfigReceived: !!mwConfig,
        matchTags,
        channelTags,
        shouldApply,
        enablePrefixPrompt: config.enablePrefixPrompt,
        enableUnicodeEscape: config.enableUnicodeEscape
      })

      // 如果不匹配渠道标签，跳过
      if (!shouldApply) {
        context.setMiddlewareLog('prompt-censor-bypass', { skipped: true, reason: 'channel tags not matched' })
        return next()
      }

      // 如果两个功能都未启用，直接跳过
      if (!config.enablePrefixPrompt && !config.enableUnicodeEscape) {
        context.setMiddlewareLog('prompt-censor-bypass', { skipped: true, reason: 'both features disabled' })
        return next()
      }

      // 处理 prompt
      if (context.prompt) {
        let processedPrompt = context.prompt
        const logInfo: Record<string, any> = {}

        // 1. 先注入前置提示词（在编码之前）
        if (config.enablePrefixPrompt && config.prefixPrompt) {
          processedPrompt = config.prefixPrompt + processedPrompt
          logInfo.prefixInjected = true
          logInfo.prefixLength = config.prefixPrompt.length
        }

        // 2. 再进行 Unicode 编码（如果启用）
        if (config.enableUnicodeEscape) {
          const beforeEncoding = processedPrompt
          processedPrompt = encodePrompt(processedPrompt, config)
          if (beforeEncoding !== processedPrompt) {
            logInfo.encoded = true
            logInfo.encodeRange = config.encodeRange
            logInfo.escapeFormat = config.escapeFormat
            logInfo.originalLength = beforeEncoding.length
            logInfo.encodedLength = processedPrompt.length
          }
        }

        if (Object.keys(logInfo).length > 0) {
          context.setMiddlewareLog('prompt-censor-bypass', logInfo)
          context.prompt = processedPrompt
        }
      }

      return next()
    }
  }
}
