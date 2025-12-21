// Koishi 指令插件入口
// 注册渠道名指令，预设名作为可选参数

import { definePlugin } from '../../core'
import {
  koishiCommandsConfigFields,
  defaultKoishiCommandsConfig,
  type KoishiCommandsConfig
} from './config'
import type { FileData, GenerationResult } from '../../types'
import { h, type Session } from 'koishi'

// 已注册的渠道指令注销函数（按渠道 ID 索引）
const channelCommandDisposables: Map<string, () => void> = new Map()
// 预设指令注销函数
const presetCommandDisposables: Array<() => void> = []

export default definePlugin({
  id: 'koishi-commands',
  name: 'Koishi 指令',
  description: '注册 Koishi 聊天指令，支持预设查询',
  version: '1.0.0',

  configFields: koishiCommandsConfigFields,
  configDefaults: defaultKoishiCommandsConfig,

  async onLoad(pluginCtx) {
    const ctx = pluginCtx.ctx
    const config = pluginCtx.getConfig<KoishiCommandsConfig>()

    if (!config.enabled) {
      pluginCtx.logger.info('Koishi commands disabled')
      return
    }

    // 保存 mediaLuna 引用，避免在事件处理器中重复访问 ctx.mediaLuna 触发警告
    let mediaLunaRef: any = null

    // 等待 mediaLuna 服务就绪后注册指令
    ctx.on('ready', async () => {
      mediaLunaRef = ctx.mediaLuna
      await refreshGenerateCommands(pluginCtx, config, mediaLunaRef)
      registerPresetCommands(pluginCtx, config, mediaLunaRef)
    })

    // 监听渠道变化，动态刷新指令
    ctx.on('mediaLuna/channel-updated' as any, async () => {
      if (!mediaLunaRef) return
      pluginCtx.logger.debug('Channel updated, refreshing commands...')
      await refreshGenerateCommands(pluginCtx, config, mediaLunaRef)
    })

    // 清理
    pluginCtx.onDispose(() => {
      for (const dispose of channelCommandDisposables.values()) {
        try {
          dispose()
        } catch (e) {
          // ignore
        }
      }
      channelCommandDisposables.clear()

      for (const dispose of presetCommandDisposables) {
        try {
          dispose()
        } catch (e) {
          // ignore
        }
      }
      presetCommandDisposables.length = 0
    })
  }
})

/**
 * 刷新生成指令
 *
 * 根据当前启用的渠道动态注册/注销指令
 */
async function refreshGenerateCommands(pluginCtx: any, config: KoishiCommandsConfig, mediaLuna: any): Promise<void> {
  const ctx = pluginCtx.ctx

  if (!mediaLuna) {
    pluginCtx.logger.warn('MediaLuna service not available')
    return
  }

  // 获取当前渠道-预设组合
  const combinations = await mediaLuna.getChannelPresetCombinations()
  const currentChannelIds = new Set(combinations.map((c: any) => c.channel.id))

  // 注销已删除或禁用的渠道指令
  for (const [channelId, dispose] of channelCommandDisposables) {
    if (!currentChannelIds.has(channelId)) {
      try {
        dispose()
      } catch (e) {
        // ignore
      }
      channelCommandDisposables.delete(channelId)
      pluginCtx.logger.debug(`Unregistered command for channel: ${channelId}`)
    }
  }

  // 注册新渠道或更新已有渠道
  for (const { channel, presets } of combinations) {
    // 如果已注册，先注销
    if (channelCommandDisposables.has(channel.id)) {
      try {
        channelCommandDisposables.get(channel.id)!()
      } catch (e) {
        // ignore
      }
      channelCommandDisposables.delete(channel.id)
    }

    // 注册渠道指令
    const dispose = registerChannelCommand(ctx, mediaLuna, channel, presets, config, pluginCtx.logger)
    channelCommandDisposables.set(channel.id, dispose)
  }

  pluginCtx.logger.info(`Refreshed generate commands: ${channelCommandDisposables.size} channels`)
}

/**
 * 注册单个渠道指令
 */
function registerChannelCommand(
  ctx: any,
  mediaLuna: any,
  channel: any,
  presets: any[],
  config: KoishiCommandsConfig,
  logger: any
): () => void {
  // 构建预设名集合（小写）用于匹配
  const presetNamesLower = new Set(presets.map((p: any) => p.name.toLowerCase()))
  // 保存原始预设名映射
  const presetNameMap = new Map(presets.map((p: any) => [p.name.toLowerCase(), p.name]))

  // 注册渠道指令（使用 rest 参数捕获所有输入）
  const channelCmd = ctx.command(`${channel.name} [...rest:string]`, `${channel.name} 生成`)
    .option('image', '-i <url:string> 输入图片URL')
    .usage(`用法: ${channel.name} [预设名] <提示词>\n可用预设: ${presets.map((p: any) => p.name).join(', ') || '无'}`)
    .action(async ({ session, options }: { session: Session; options: any }, ...rest: string[]) => {
      // rest 是所有参数的数组
      // 对于 /draw anime xxx，rest = ['anime', 'xxx']
      // 对于 /draw xxx，rest = ['xxx']

      let presetName: string | undefined
      let promptParts = rest

      if (rest.length > 0) {
        const firstWord = rest[0]?.toLowerCase()

        // 检查首词是否是预设名
        if (firstWord && presetNamesLower.has(firstWord)) {
          presetName = presetNameMap.get(firstWord) as string
          promptParts = rest.slice(1)
        }
      }

      const actualPrompt = promptParts.join(' ')

      // 严格标签匹配检查
      if (config.strictTagMatch && presetName) {
        const presetService = mediaLuna?.presets
        if (presetService) {
          const presetData = await presetService.getByName(presetName)
          if (presetData) {
            const channelTags = channel.tags || []
            const presetTags = presetData.tags || []
            const hasMatch = channelTags.length === 0 ||
              presetTags.some((t: string) => channelTags.includes(t))

            if (!hasMatch) {
              await session?.send(`该模型类别不支持预设「${presetName}」，输入"确认"继续，输入其他取消`)
              const confirmInput = await session?.prompt(config.confirmTimeout * 1000)

              if (confirmInput?.trim() !== '确认') {
                return '已取消'
              }
            }
          }
        }
      }

      return executeGenerate(ctx, session, {
        channelName: channel.name,
        presetName,
        prompt: actualPrompt,
        imageUrl: options?.image
      })
    })

  logger.debug(`Registered command: ${channel.name} (${presets.length} presets available)`)
  return () => channelCmd.dispose()
}

/**
 * 注册预设查询指令
 */
function registerPresetCommands(pluginCtx: any, config: KoishiCommandsConfig, mediaLuna: any): void {
  const ctx = pluginCtx.ctx

  // /presets [tag] - 查看预设列表（只显示预设名）
  const presetsCmd = ctx.command(`${config.presetsCommand} [tag:string]`, '查看可用预设')
    .action(async (_: any, tag: string) => {
      const presetService = mediaLuna?.presets
      if (!presetService) {
        return '预设服务不可用'
      }

      // 获取预设列表
      let presets = await presetService.listEnabled()

      // 按标签筛选
      if (tag) {
        presets = presets.filter((p: any) => p.tags.includes(tag))
        if (presets.length === 0) {
          return `没有找到标签为 [${tag}] 的预设`
        }
      }

      if (presets.length === 0) {
        return '没有可用的预设'
      }

      // 构建预设列表内容
      const lines: string[] = []
      lines.push('━━━━━━━━━━━━━━')
      if (tag) {
        lines.push(`📂 标签 [${tag}] 下的预设`)
      } else {
        lines.push('📂 可用预设列表')
      }
      lines.push(`共 ${presets.length} 个预设`)
      lines.push('━━━━━━━━━━━━━━')
      lines.push('')

      // 所有预设放在一起
      for (const preset of presets) {
        if (preset.tags && preset.tags.length > 0) {
          lines.push(`• ${preset.name}  [${preset.tags.join(', ')}]`)
        } else {
          lines.push(`• ${preset.name}`)
        }
      }

      lines.push('')
      lines.push('━━━━━━━━━━━━━━')

      const content = lines.join('\n')

      // 如果内容过长（超过 500 字符），使用合并转发
      if (content.length > 500) {
        return `<message forward><message>${content}</message></message>`
      }

      return content
    })

  presetCommandDisposables.push(() => presetsCmd.dispose())

  // /preset <name> - 查看预设详情（含缩略图）
  const presetCmd = ctx.command(`${config.presetCommand} <name:string>`, '查看预设详情')
    .action(async ({ session }: { session: Session }, name: string) => {
      if (!name) {
        return '请指定预设名称'
      }

      const presetService = mediaLuna?.presets
      if (!presetService) {
        return '预设服务不可用'
      }

      const preset = await presetService.getByName(name)
      if (!preset) {
        return `未找到预设: ${name}`
      }

      // 检查模板长度，超过 200 字符使用合并转发
      const templateLength = preset.promptTemplate?.length || 0
      const useForward = templateLength > 200

      if (useForward) {
        // 使用合并转发消息
        const forwardMessages: string[] = []

        // 基本信息
        const basicLines: string[] = []
        basicLines.push('━━━━━━━━━━━━━━')
        basicLines.push(`📋 预设：${preset.name}`)
        basicLines.push('━━━━━━━━━━━━━━')
        if (preset.tags && preset.tags.length > 0) {
          basicLines.push(`🏷️ 标签: ${preset.tags.join(', ')}`)
        }
        if (preset.referenceImages && preset.referenceImages.length > 0) {
          basicLines.push(`🖼️ 参考图: ${preset.referenceImages.length} 张`)
        }
        basicLines.push('━━━━━━━━━━━━━━')
        forwardMessages.push(`<message>${basicLines.join('\n')}</message>`)

        // 缩略图单独一条
        if (preset.thumbnail) {
          forwardMessages.push(`<message><image url="${preset.thumbnail}"/></message>`)
        }

        // 模板单独一条
        if (preset.promptTemplate) {
          forwardMessages.push(`<message>📝 Prompt 模板:\n${preset.promptTemplate}</message>`)
        }

        return `<message forward>${forwardMessages.join('')}</message>`
      } else {
        // 普通消息
        const messages: string[] = []

        // 缩略图
        if (preset.thumbnail) {
          messages.push(`<image url="${preset.thumbnail}"/>`)
        }

        // 文本信息
        const lines: string[] = []
        lines.push('━━━━━━━━━━━━━━')
        lines.push(`📋 预设：${preset.name}`)
        lines.push('━━━━━━━━━━━━━━')

        if (preset.tags && preset.tags.length > 0) {
          lines.push(`🏷️ 标签: ${preset.tags.join(', ')}`)
        }

        if (preset.promptTemplate) {
          lines.push(`📝 模板: ${preset.promptTemplate}`)
        }

        if (preset.referenceImages && preset.referenceImages.length > 0) {
          lines.push(`🖼️ 参考图: ${preset.referenceImages.length} 张`)
        }

        lines.push('━━━━━━━━━━━━━━')

        messages.push(lines.join('\n'))

        return messages.join('\n')
      }
    })

  presetCommandDisposables.push(() => presetCmd.dispose())

  pluginCtx.logger.info('Preset query commands registered')
}

/**
 * 执行生成请求
 */
async function executeGenerate(
  ctx: any,
  session: Session | undefined,
  options: {
    channelName: string
    presetName?: string
    prompt: string
    imageUrl?: string
  }
): Promise<string> {
  const logger = ctx.logger('media-luna/commands')

  // 获取用户 ID
  const uid = (session as any)?.user?.id

  // 处理输入文件
  const files: FileData[] = []

  // 从消息中提取图片（使用 Koishi 元素选择器）
  if (session?.elements) {
    const imageElements = h.select(session.elements, 'img,image')
    for (const img of imageElements) {
      const src = img.attrs?.src || img.attrs?.url
      if (src) {
        try {
          const response = await ctx.http.get(src, { responseType: 'arraybuffer' })
          const buffer = Buffer.from(response)
          const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
          files.push({
            data: arrayBuffer,
            mime: 'image/png',
            filename: `input_${files.length}.png`
          })
        } catch (e) {
          logger.warn('Failed to fetch image from message: %s', e)
        }
      }
    }
  }

  // 如果命令行指定了图片 URL，也获取
  if (options.imageUrl) {
    try {
      const response = await ctx.http.get(options.imageUrl, { responseType: 'arraybuffer' })
      const buffer = Buffer.from(response)
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      files.push({
        data: arrayBuffer,
        mime: 'image/png',
        filename: `input_${files.length}.png`
      })
    } catch (e) {
      logger.warn('Failed to fetch input image: %s', e)
    }
  }

  // 清理 prompt 中的图片标签，只保留文本
  let cleanPrompt = options.prompt
  if (session?.elements) {
    const textElements = h.select(session.elements, 'text')
    cleanPrompt = textElements.map(el => el.attrs?.content || '').join('').trim()
  }

  // 发送"正在生成中"提示
  await session?.send('正在生成中...')

  try {
    const result: GenerationResult = await ctx.mediaLuna.generateByName({
      channelName: options.channelName,
      presetName: options.presetName,
      prompt: cleanPrompt,
      files,
      session,
      uid
    })

    return formatResult(result)
  } catch (error) {
    logger.error('Generate failed: %s', error)
    return `生成失败: ${error instanceof Error ? error.message : '未知错误'}`
  }
}

/**
 * 格式化生成结果
 */
function formatResult(result: GenerationResult): string {
  if (!result.success) {
    // TODO: 支持自定义错误消息模板
    return `生成失败: ${result.error || '未知错误'}`
  }

  if (!result.output || result.output.length === 0) {
    return '生成完成，但没有输出'
  }

  // 构建输出消息
  const messages: string[] = []

  for (const asset of result.output) {
    if (asset.kind === 'image' && asset.url) {
      messages.push(`<image url="${asset.url}"/>`)
    } else if (asset.kind === 'audio' && asset.url) {
      messages.push(`<audio url="${asset.url}"/>`)
    } else if (asset.kind === 'video' && asset.url) {
      messages.push(`<video url="${asset.url}"/>`)
    }
  }

  // TODO: 添加成功消息模板支持（如消费 {cost}{currency}，余额 {balance}）

  return messages.join('\n')
}

// 导出类型
export type { KoishiCommandsConfig } from './config'
