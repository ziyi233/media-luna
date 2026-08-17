// ChatLuna 变量注册
// 提供可嵌入 AI 预设上下文的变量

import { Context } from 'koishi'

/** Vits Speaker ID 基数（与 vits 插件保持一致） */
const CHANNEL_SPEAKER_ID_BASE = 1000000

// 存储注册的变量 dispose 函数
const variableDisposers: (() => void)[] = []

/**
 * 注册 Media Luna 变量到 ChatLuna
 */
export function registerChatLunaVariables(
  ctx: Context,
  config: { enableVariables: boolean },
  logger: any
) {
  const chatluna = (ctx as any).chatluna

  if (!chatluna) {
    logger.warn('ChatLuna service not available, skipping variable registration')
    return
  }

  if (!chatluna.promptRenderer) {
    logger.warn('ChatLuna promptRenderer not available, skipping variable registration')
    return
  }

  // 清理之前注册的变量
  unregisterChatLunaVariables()

  if (!config.enableVariables) {
    logger.debug('Variables registration disabled')
    return
  }

  // 注册 medialuna_channels 变量
  // 用法: {{medialuna_channels()}} 或 {{medialuna_channels(tag1, tag2)}}
  try {
    const channelsDispose = chatluna.promptRenderer.registerFunctionProvider(
      'medialuna_channels',
      async (args: string[], _variables: Record<string, unknown>, _configurable: any) => {
        try {
          const mediaLuna = (ctx as any).mediaLuna
          if (!mediaLuna?.channelService) {
            return '[MediaLuna 服务不可用]'
          }

          const channels = await mediaLuna.channelService.list()
          let filtered = channels.filter((c: any) => c.enabled)

          // 如果有参数，按标签筛选
          if (args.length > 0) {
            const filterTags = args.map(t => t.trim().toLowerCase())
            filtered = filtered.filter((c: any) => {
              const channelTags = (c.tags || []).map((t: string) => t.toLowerCase())
              return filterTags.some(ft => channelTags.includes(ft))
            })
          }

          if (filtered.length === 0) {
            return args.length > 0
              ? `没有找到包含标签 [${args.join(', ')}] 的渠道`
              : '没有可用的渠道'
          }

          return filtered.map((c: any) => {
            const tags = c.tags?.length > 0 ? ` (${c.tags.join(', ')})` : ''
            return `- ${c.name}: ${c.displayName || c.name}${tags}`
          }).join('\n')
        } catch (e) {
          logger.error('medialuna_channels error:', e)
          return '[获取渠道列表失败]'
        }
      }
    )
    variableDisposers.push(channelsDispose)
    logger.info('Registered ChatLuna variable: medialuna_channels')
  } catch (e) {
    logger.error('Failed to register medialuna_channels:', e)
  }

  // 注册 medialuna_presets 变量
  // 用法: {{medialuna_presets()}} 或 {{medialuna_presets(tag1, tag2)}}
  try {
    const presetsDispose = chatluna.promptRenderer.registerFunctionProvider(
      'medialuna_presets',
      async (args: string[], _variables: Record<string, unknown>, _configurable: any) => {
        try {
          const mediaLuna = (ctx as any).mediaLuna
          if (!mediaLuna?.presets) {
            return '[MediaLuna 服务不可用]'
          }

          const presets = await mediaLuna.presets.list({ enabledOnly: true })

          let filtered = presets

          // 如果有参数，按标签筛选
          if (args.length > 0) {
            const filterTags = args.map(t => t.trim().toLowerCase())
            filtered = presets.filter((p: any) => {
              const presetTags = (p.tags || []).map((t: string) => t.toLowerCase())
              return filterTags.some(ft => presetTags.includes(ft))
            })
          }

          if (filtered.length === 0) {
            return args.length > 0
              ? `没有找到包含标签 [${args.join(', ')}] 的预设`
              : '没有可用的预设'
          }

          return filtered.map((p: any) => {
            const tags = p.tags?.length > 0 ? ` [${p.tags.join(', ')}]` : ''
            const template = p.promptTemplate
              ? `\n  模板: ${p.promptTemplate.substring(0, 100)}${p.promptTemplate.length > 100 ? '...' : ''}`
              : ''
            return `- ${p.name}${tags}${template}`
          }).join('\n')
        } catch (e) {
          logger.error('medialuna_presets error:', e)
          return '[获取预设列表失败]'
        }
      }
    )
    variableDisposers.push(presetsDispose)
    logger.info('Registered ChatLuna variable: medialuna_presets')
  } catch (e) {
    logger.error('Failed to register medialuna_presets:', e)
  }

  // 注册 medialuna_preset_detail 变量
  // 用法: {{medialuna_preset_detail(preset_name)}}
  try {
    const presetDetailDispose = chatluna.promptRenderer.registerFunctionProvider(
      'medialuna_preset_detail',
      async (args: string[], _variables: Record<string, unknown>, _configurable: any) => {
        try {
          if (args.length === 0) {
            return '[请提供预设名称]'
          }

          const presetName = args[0].trim()
          const mediaLuna = (ctx as any).mediaLuna
          if (!mediaLuna?.presets) {
            return '[MediaLuna 服务不可用]'
          }

          const preset = await mediaLuna.presets.getByName(presetName)
          if (!preset) {
            return `[未找到预设: ${presetName}]`
          }

          const parts: string[] = [
            `预设名称: ${preset.name}`,
            `显示名称: ${preset.displayName || preset.name}`
          ]

          if (preset.tags?.length > 0) {
            parts.push(`标签: ${preset.tags.join(', ')}`)
          }

          if (preset.promptTemplate) {
            parts.push(`提示词模板:\n${preset.promptTemplate}`)
          }

          if (preset.referenceImages?.length > 0) {
            parts.push(`参考图片数量: ${preset.referenceImages.length}`)
          }

          return parts.join('\n')
        } catch (e) {
          logger.error('medialuna_preset_detail error:', e)
          return '[获取预设详情失败]'
        }
      }
    )
    variableDisposers.push(presetDetailDispose)
    logger.info('Registered ChatLuna variable: medialuna_preset_detail')
  } catch (e) {
    logger.error('Failed to register medialuna_preset_detail:', e)
  }

  // 注册 medialuna_channel_detail 变量
  // 用法: {{medialuna_channel_detail(channel_name)}}
  try {
    const channelDetailDispose = chatluna.promptRenderer.registerFunctionProvider(
      'medialuna_channel_detail',
      async (args: string[], _variables: Record<string, unknown>, _configurable: any) => {
        try {
          if (args.length === 0) {
            return '[请提供渠道名称]'
          }

          const channelName = args[0].trim()
          const mediaLuna = (ctx as any).mediaLuna
          if (!mediaLuna?.channelService) {
            return '[MediaLuna 服务不可用]'
          }

          const channel = await mediaLuna.channelService.getByName(channelName)
          if (!channel) {
            return `[未找到渠道: ${channelName}]`
          }

          const parts: string[] = [
            `渠道名称: ${channel.name}`,
            `显示名称: ${channel.displayName || channel.name}`,
            `状态: ${channel.enabled ? '已启用' : '已禁用'}`,
            `连接器: ${channel.connectorId}`
          ]

          if (channel.tags?.length > 0) {
            parts.push(`标签: ${channel.tags.join(', ')}`)
          }

          return parts.join('\n')
        } catch (e) {
          logger.error('medialuna_channel_detail error:', e)
          return '[获取渠道详情失败]'
        }
      }
    )
    variableDisposers.push(channelDetailDispose)
    logger.info('Registered ChatLuna variable: medialuna_channel_detail')
  } catch (e) {
    logger.error('Failed to register medialuna_channel_detail:', e)
  }

  // 注册 medialuna_vits_speakers 变量
  // 用法: {{medialuna_vits_speakers()}}
  // 返回所有 text2audio 渠道的音色列表，格式为 "音色名(ID)"
  try {
    const vitsSpeakersDispose = chatluna.promptRenderer.registerFunctionProvider(
      'medialuna_vits_speakers',
      async (_args: string[], _variables: Record<string, unknown>, _configurable: any) => {
        try {
          const mediaLuna = (ctx as any).mediaLuna
          if (!mediaLuna?.channels) {
            return '[MediaLuna 服务不可用]'
          }

          // 获取所有 text2audio 标签的渠道
          const audioChannels = await mediaLuna.channels.getByTags(['text2audio'])
          const enabledChannels = audioChannels.filter((c: any) => c.enabled)

          if (enabledChannels.length === 0) {
            return '没有可用的语音音色'
          }

          // 格式化输出：音色名(ID)
          return enabledChannels.map((channel: any) => {
            const speakerId = CHANNEL_SPEAKER_ID_BASE + channel.id
            const displayName = channel.displayName || channel.name
            return `- ${displayName} (ID: ${speakerId})`
          }).join('\n')
        } catch (e) {
          logger.error('medialuna_vits_speakers error:', e)
          return '[获取音色列表失败]'
        }
      }
    )
    variableDisposers.push(vitsSpeakersDispose)
    logger.info('Registered ChatLuna variable: medialuna_vits_speakers')
  } catch (e) {
    logger.error('Failed to register medialuna_vits_speakers:', e)
  }

  // 注册 medialuna_pending_tasks 变量
  // 用法: {{medialuna_pending_tasks()}}
  // 返回当前用户正在进行的任务列表（pending 和 processing 状态）
  try {
    const pendingTasksDispose = chatluna.promptRenderer.registerFunctionProvider(
      'medialuna_pending_tasks',
      async (_args: string[], _variables: Record<string, unknown>, configurable: any) => {
        try {
          const session = configurable?.session
          const uid = session?.user?.id
          if (uid == null) {
            return '无法获取用户信息'
          }

          const mediaLuna = (ctx as any).mediaLuna
          if (!mediaLuna?.tasks) {
            return '[MediaLuna 任务服务不可用]'
          }

          // 查询 pending 和 processing 状态的任务
          const pendingTasks = await mediaLuna.tasks.query({ uid, status: 'pending', limit: 10 })
          const processingTasks = await mediaLuna.tasks.query({ uid, status: 'processing', limit: 10 })

          const allTasks = [...pendingTasks, ...processingTasks]

          if (allTasks.length === 0) {
            return '当前没有正在进行的生成任务'
          }

          // 格式化输出
          return `当前有 ${allTasks.length} 个任务正在进行:\n` + allTasks.map((task: any) => {
            const prompt = task.requestSnapshot?.prompt || '(无提示词)'
            const shortPrompt = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt
            const status = task.status === 'pending' ? '等待中' : '处理中'
            return `- [${status}] ${shortPrompt}`
          }).join('\n')
        } catch (e) {
          logger.error('medialuna_pending_tasks error:', e)
          return '[获取任务列表失败]'
        }
      }
    )
    variableDisposers.push(pendingTasksDispose)
    logger.info('Registered ChatLuna variable: medialuna_pending_tasks')
  } catch (e) {
    logger.error('Failed to register medialuna_pending_tasks:', e)
  }

  logger.info(`Registered ${variableDisposers.length} ChatLuna variables`)
}

/**
 * 注销所有已注册的变量
 */
export function unregisterChatLunaVariables() {
  for (const dispose of variableDisposers) {
    try {
      dispose()
    } catch (e) {
      // ignore
    }
  }
  variableDisposers.length = 0
}
