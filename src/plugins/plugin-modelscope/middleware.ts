// ModelScope 中间件
// 功能：解析 LoRA 标记、注入激发词、解析尺寸

import type { MiddlewareDefinition, MiddlewareContext, MiddlewareRunStatus } from '../../core/types'
import type { LoraAlias, MiddlewareConfig } from './config'

// ============ 尺寸解析辅助函数 ============

interface ParsedSize {
  width: number
  height: number
  source: 'explicit' | 'landscape' | 'portrait'
}

/**
 * 解析 prompt 中的尺寸信息
 * 优先级：明确尺寸 (1024x768) > 横屏/竖屏关键词
 *
 * 支持格式：
 * - 1024x768, 1024*768, 1024X768
 * - 横屏, 横图, landscape
 * - 竖屏, 竖图, portrait
 */
function parseSizeFromPrompt(
  prompt: string,
  config: MiddlewareConfig
): { cleanPrompt: string; size: ParsedSize | null } {
  let cleanPrompt = prompt
  let size: ParsedSize | null = null

  // 1. 优先检测明确尺寸：数字x数字 或 数字*数字
  const explicitSizeRegex = /(\d{2,4})\s*[xX*×]\s*(\d{2,4})/g
  const explicitMatch = explicitSizeRegex.exec(prompt)
  if (explicitMatch) {
    const width = parseInt(explicitMatch[1], 10)
    const height = parseInt(explicitMatch[2], 10)
    // 合理范围检查
    if (width >= 64 && width <= 2048 && height >= 64 && height <= 2048) {
      size = { width, height, source: 'explicit' }
      cleanPrompt = cleanPrompt.replace(explicitMatch[0], '').trim()
    }
  }

  // 2. 如果没有明确尺寸，检测横屏/竖屏关键词
  if (!size) {
    // 横屏关键词
    const landscapeRegex = /(横屏|横图|landscape)/gi
    const landscapeMatch = landscapeRegex.exec(prompt)
    if (landscapeMatch) {
      size = {
        width: config.landscapeWidth,
        height: config.landscapeHeight,
        source: 'landscape'
      }
      cleanPrompt = cleanPrompt.replace(/(横屏|横图|landscape)/gi, '').trim()
    }

    // 竖屏关键词
    if (!size) {
      const portraitRegex = /(竖屏|竖图|portrait)/gi
      const portraitMatch = portraitRegex.exec(prompt)
      if (portraitMatch) {
        size = {
          width: config.portraitWidth,
          height: config.portraitHeight,
          source: 'portrait'
        }
        cleanPrompt = cleanPrompt.replace(/(竖屏|竖图|portrait)/gi, '').trim()
      }
    }
  }

  // 清理多余空格和逗号
  cleanPrompt = cleanPrompt.replace(/,\s*,/g, ',').replace(/^\s*,|,\s*$/g, '').trim()

  return { cleanPrompt, size }
}

// ============ LoRA 解析辅助函数 ============

interface ParsedLora {
  alias: string
  weight: number
}

interface ResolvedLora {
  repoId: string
  weight: number
  triggerWords?: string
}

/**
 * 解析 prompt 中的 LoRA 标记
 * 支持格式：
 * - #别名# 或 #别名:0.6# - 使用配置的别名
 * - #user/repo# 或 #user/repo:0.6# - 直接使用 repo ID
 *
 * 注意：必须使用双井号包围，如 #lora_name# 或 #user/repo:0.6#
 */
function parseLoraTokens(prompt: string): { cleanPrompt: string; loras: ParsedLora[] } {
  const loras: ParsedLora[] = []
  // 必须双井号包围：#xxx# 或 #xxx:0.6#
  const regex = /#([a-zA-Z0-9_\-\/\u4e00-\u9fff]+)(?::?([\d.]+))?#/g

  const cleanPrompt = prompt.replace(regex, (_match, alias, weight) => {
    loras.push({
      alias: alias,
      weight: weight ? parseFloat(weight) : -1  // -1 表示未指定
    })
    return ''
  }).trim().replace(/\s+/g, ' ')

  return { cleanPrompt, loras }
}

/**
 * 归一化 LoRA 权重使总和为 1.0
 *
 * 规则：
 * 1. 全部未指定权重: 均分 1.0
 * 2. 部分指定权重: 剩余权重均分给未指定的
 * 3. 全部指定权重: 归一化使总和为 1.0
 */
function normalizeLoraWeights(
  loras: ResolvedLora[]
): ResolvedLora[] {
  if (loras.length === 0) return loras

  const unspecifiedCount = loras.filter(l => l.weight === -1).length
  const specifiedLoras = loras.filter(l => l.weight !== -1)
  const specifiedTotal = specifiedLoras.reduce((sum, l) => sum + l.weight, 0)

  let unspecifiedWeight = 0
  if (unspecifiedCount > 0) {
    const remainingWeight = Math.max(0, 1.0 - specifiedTotal)
    unspecifiedWeight = remainingWeight / unspecifiedCount
  }

  const result = loras.map(l => ({
    ...l,
    weight: l.weight === -1 ? unspecifiedWeight : l.weight
  }))

  const total = result.reduce((sum, l) => sum + l.weight, 0)
  if (total <= 0) {
    // 所有权重为 0 或负数，均分
    const equalWeight = 1.0 / result.length
    return result.map(l => ({
      ...l,
      weight: parseFloat(equalWeight.toFixed(4))
    }))
  }

  // 归一化使总和为 1.0
  return result.map(l => ({
    ...l,
    weight: parseFloat((l.weight / total).toFixed(4))
  }))
}

/**
 * 收集激发词并注入到 prompt
 */
function injectTriggerWords(prompt: string, loras: ResolvedLora[]): string {
  const triggerWords: string[] = []

  for (const lora of loras) {
    if (lora.triggerWords && lora.triggerWords.trim()) {
      triggerWords.push(lora.triggerWords.trim())
    }
  }

  if (triggerWords.length === 0) {
    return prompt
  }

  // 激发词注入到 prompt 最前面，用逗号分隔
  const triggerPart = triggerWords.join(', ')
  return `${triggerPart}, ${prompt}`
}

// ============ 中间件定义 ============

/** ModelScope 中间件 */
export const ModelScopeMiddleware: MiddlewareDefinition = {
  name: 'modelscope',
  displayName: 'ModelScope LoRA',
  description: '解析 LoRA 标记、尺寸（如 1024x768、横屏）并注入激发词',
  category: 'transform',
  phase: 'lifecycle-pre-request',
  after: ['preset'],
  configGroup: 'modelscope',

  async execute(context: MiddlewareContext, next): Promise<MiddlewareRunStatus> {
    const logger = context.ctx.logger('media-luna')

    logger.debug('[ModelScope] prompt=%s', context.prompt)

    // 获取中间件配置
    const config = await context.getMiddlewareConfig<MiddlewareConfig>('modelscope') || {
      loraAliases: [],
      normalizeWeights: true,
      enableSizeParsing: true,
      landscapeWidth: 1024,
      landscapeHeight: 768,
      portraitWidth: 768,
      portraitHeight: 1024
    }

    let currentPrompt = context.prompt
    let parsedSize: { width: number; height: number; source: string } | null = null

    // ============ 尺寸解析 ============
    if (config.enableSizeParsing) {
      const sizeResult = parseSizeFromPrompt(currentPrompt, config)
      // 只有当清理后的 prompt 不为空时才更新，避免只输入尺寸关键词导致空 prompt
      if (sizeResult.cleanPrompt || !sizeResult.size) {
        currentPrompt = sizeResult.cleanPrompt
      }
      parsedSize = sizeResult.size

      if (parsedSize && context.channel) {
        context.channel.connectorConfig = {
          ...context.channel.connectorConfig,
          width: parsedSize.width,
          height: parsedSize.height
        }
        logger.debug('[ModelScope] Size parsed: %dx%d (source: %s)',
          parsedSize.width, parsedSize.height, parsedSize.source)
      }
    }

    // ============ LoRA 解析 ============
    const { cleanPrompt, loras } = parseLoraTokens(currentPrompt)
    logger.debug('[ModelScope] Parsed: cleanPrompt=%s, loras=%o', cleanPrompt, loras)

    if (loras.length === 0) {
      context.prompt = cleanPrompt
      // 记录尺寸解析结果
      if (parsedSize) {
        context.setMiddlewareLog('modelscope', {
          sizeDetected: parsedSize
        })
      }
      logger.debug('[ModelScope] No LoRA tokens found')
      return next()
    }

    // 构建别名映射
    const loraAliases = config.loraAliases || []
    const aliasMap = new Map<string, LoraAlias>()
    for (const alias of loraAliases) {
      aliasMap.set(alias.alias.toLowerCase(), alias)
    }

    logger.debug('[ModelScope] Alias map size: %d', aliasMap.size)

    // 解析 LoRA
    const resolvedLoras: ResolvedLora[] = []
    const unresolvedAliases: string[] = []

    for (const lora of loras) {
      const aliasConfig = aliasMap.get(lora.alias.toLowerCase())
      if (aliasConfig) {
        // 找到别名配置
        resolvedLoras.push({
          repoId: aliasConfig.repoId,
          weight: lora.weight > 0 ? lora.weight : (aliasConfig.defaultWeight ?? -1),
          triggerWords: aliasConfig.triggerWords
        })
        logger.debug('[ModelScope] Resolved alias: %s -> %s (trigger: %s)',
          lora.alias, aliasConfig.repoId, aliasConfig.triggerWords || 'none')
      } else if (lora.alias.includes('/')) {
        // 直接使用 repo ID 格式（如 ziyi2333/Kotone_Fujita）
        resolvedLoras.push({
          repoId: lora.alias,
          weight: lora.weight > 0 ? lora.weight : -1
        })
        logger.debug('[ModelScope] Direct repo ID: %s', lora.alias)
      } else {
        unresolvedAliases.push(lora.alias)
        logger.debug('[ModelScope] Unresolved alias: %s', lora.alias)
      }
    }

    if (unresolvedAliases.length > 0) {
      context.setMiddlewareLog('modelscope', {
        warning: 'Unresolved LoRA aliases',
        aliases: unresolvedAliases
      })
    }

    if (resolvedLoras.length === 0) {
      context.prompt = cleanPrompt
      return next()
    }

    // 归一化权重
    const finalLoras = config.normalizeWeights
      ? normalizeLoraWeights(resolvedLoras)
      : resolvedLoras.map(l => ({
          ...l,
          weight: l.weight === -1 ? (1.0 / resolvedLoras.length) : l.weight
        }))

    // 注入激发词到 prompt
    const promptWithTriggers = injectTriggerWords(cleanPrompt, finalLoras)
    context.prompt = promptWithTriggers

    logger.debug('[ModelScope] Prompt with triggers: %s', context.prompt)

    if (!context.channel) {
      return next()
    }

    // 格式化为 ModelScope 格式
    const loraConfig: Record<string, number> = {}
    for (const l of finalLoras) {
      loraConfig[l.repoId] = l.weight
    }

    context.channel.connectorConfig = {
      ...context.channel.connectorConfig,
      loras: finalLoras.length === 1 ? finalLoras[0].repoId : JSON.stringify(loraConfig)
    }

    logger.debug('[ModelScope] Modified: prompt=%s, loras=%s',
      context.prompt,
      context.channel.connectorConfig.loras
    )

    context.setMiddlewareLog('modelscope', {
      sizeDetected: parsedSize || undefined,
      parsedLoras: loras,
      resolvedLoras: finalLoras.map(l => ({
        repoId: l.repoId,
        weight: l.weight,
        triggerWords: l.triggerWords
      })),
      injectedTriggerWords: finalLoras.filter(l => l.triggerWords).map(l => l.triggerWords),
      unresolvedAliases: unresolvedAliases.length > 0 ? unresolvedAliases : undefined
    })

    return next()
  }
}
