// Koishi 聊天指令插件入口
// 注册渠道名指令，支持收集模式
import {} from 'koishi-plugin-adapter-onebot'
import { definePlugin } from '../../core'
import type { PluginContext } from '../../core/types'
import {
  koishiCommandsConfigFields,
  defaultKoishiCommandsConfig,
  type KoishiCommandsConfig
} from './config'
import { formatGenerationResult, resolveLinkMode } from './shared/delivery'
import type { FileData, GenerationResult, OutputAsset } from '../../types'
import { h, type Session } from 'koishi'

/** 收集状态 */
interface CollectState {
  files: FileData[]
  processedUrls: Set<string>
  prompts: string[]
  presetName?: string
}

type CapabilityKey = 'img2img' | 'img2video' | 'text2img' | 'text2video' | 'text2audio'

const CAPABILITY_GROUPS: Array<{ key: CapabilityKey; label: string }> = [
  { key: 'img2img', label: '图生图' },
  { key: 'img2video', label: '图生视频' },
  { key: 'text2img', label: '文生图' },
  { key: 'text2video', label: '文生视频' },
  { key: 'text2audio', label: '文生音频' }
]

const CAPABILITY_KEYS = new Set<CapabilityKey>(CAPABILITY_GROUPS.map(group => group.key))

/**
 * 从渠道标签解析“直接触发所需图片数”覆盖值。
 * 支持标签格式（不区分大小写）：
 * - direct:1
 * - direct-trigger:1
 * - directTriggerImageCount:1
 */
function resolveDirectTriggerImageCount(channelTags: string[], fallback: number): number {
  for (const rawTag of channelTags || []) {
    const tag = String(rawTag).trim()
    const lowerTag = tag.toLowerCase()

    const patterns = [
      /^direct:(\d+)$/i,
      /^direct-trigger:(\d+)$/i,
      /^directtriggerimagecount:(\d+)$/i
    ]

    for (const pattern of patterns) {
      const match = lowerTag.match(pattern)
      if (match?.[1]) {
        const parsed = Number(match[1])
        if (Number.isInteger(parsed) && parsed >= 0) {
          return parsed
        }
      }
    }
  }

  return fallback
}

export default definePlugin({
  id: 'koishi-commands',
  name: 'Koishi 聊天指令',
  description: '注册 Koishi 聊天指令，支持预设查询',
  version: '1.0.0',

  configFields: koishiCommandsConfigFields,
  configDefaults: defaultKoishiCommandsConfig,

  async onLoad(pluginCtx) {
    const ctx = pluginCtx.ctx
    const config = pluginCtx.getConfig<KoishiCommandsConfig>()
    const logger = pluginCtx.logger

    // 使用实例级 Map/Array 存储 dispose 函数，而不是模块级变量
    // 这样每次插件重载都会创建新的存储，避免状态残留
    // key: channel.id (string), value: { dispose, commandName }
    const channelCommandDisposables = new Map<string, { dispose: () => void; commandName: string }>()
    const presetCommandDisposables: Array<() => void> = []

    // 保存 mediaLuna 引用
    let mediaLunaRef: any = null

    // 父指令名称（固定）
    const PARENT_COMMAND = 'medialuna'

    // 获取系统保留指令名（不允许渠道使用这些名称）
    const getReservedCommandNames = (): Set<string> => {
      const reserved = new Set<string>()
      // 本插件注册的指令
      reserved.add(PARENT_COMMAND.toLowerCase())
      // Koishi 内置指令
      reserved.add('help')
      reserved.add('status')
      reserved.add('echo')
      reserved.add('broadcast')
      // LoRA 相关指令
      reserved.add('loras')
      return reserved
    }

    // 刷新生成指令的函数（清除重建策略）
    const refreshGenerateCommands = async () => {
      if (!mediaLunaRef) {
        logger.warn('MediaLuna service not available')
        return
      }

      // 第一步：清除所有已注册的渠道指令
      for (const [channelId, { dispose, commandName }] of channelCommandDisposables) {
        try {
          dispose()
        } catch (e) {
          // ignore
        }
        logger.debug(`Unregistered command: ${commandName} (channel: ${channelId})`)
      }
      channelCommandDisposables.clear()

      // 第二步：获取当前渠道-预设组合
      const combinations = await mediaLunaRef.getChannelPresetCombinations()

      // 第三步：获取保留指令名
      const reservedNames = getReservedCommandNames()

      // 第四步：记录本轮已注册的指令名（用于检测渠道间重名）
      const registeredInThisRound = new Set<string>()

      // 第五步：注册渠道指令
      for (const { channel, presets } of combinations) {
        const commandName = channel.name
        const commandNameLower = commandName.toLowerCase()

        // 检查渠道级配置是否禁用了 koishi-commands
        if (!mediaLunaRef.isPluginEnabledForChannel('koishi-commands', channel)) {
          logger.debug(`Channel ${commandName}: koishi-commands disabled, skipping`)
          continue
        }

        // 检查是否与保留指令冲突
        if (reservedNames.has(commandNameLower)) {
          logger.warn(`Channel "${commandName}" conflicts with reserved command, skipping`)
          continue
        }

        // 检查是否与其他渠道重名（同名只注册第一个）
        if (registeredInThisRound.has(commandNameLower)) {
          logger.warn(`Channel "${commandName}" (id: ${channel.id}) has duplicate name, skipping`)
          continue
        }

        // 注册渠道指令
        const dispose = registerChannelCommand(ctx, mediaLunaRef, channel, presets, config, logger, PARENT_COMMAND)
        channelCommandDisposables.set(channel.id, { dispose, commandName })
        registeredInThisRound.add(commandNameLower)
      }

      logger.info(`Refreshed generate commands: ${channelCommandDisposables.size} channels registered`)
    }

    // 注册预设指令的函数
    const registerPresetCommands = () => {
      // 注册父指令，带帮助信息
      const parentCmd = ctx.command(PARENT_COMMAND, 'Media Luna 多媒体生成')
        .action(() => {
          const lines: string[] = []
          lines.push('━━━━━━━━━━━━━━━━━━━━')
          lines.push('🎨 Media Luna 多媒体生成')
          lines.push('━━━━━━━━━━━━━━━━━━━━')
          lines.push('')
          lines.push('📋 查询指令：')
          lines.push('  models - 查看所有模型名')
          lines.push('  presets - 查看所有预设名')
          lines.push('  preset <预设名> - 查看具体预设内容')
          lines.push('  mytasks - 查看我的生成记录')
          lines.push('  taskinfo <ID> - 查看任务详情')
          lines.push('  redraw <ID> - 使用相同参数重新生成')
          lines.push('')
          lines.push('🖼️ 基础用法：')
          lines.push('  1. 渠道名 预设名 提示词 [图片]')
          lines.push('     - 图片≥2张: 直接触发生成')
          lines.push('     - 图片≤1张: 进入收集模式，发送"开始"触发')
          lines.push('  2. 渠道名 提示词 [图片]')
          lines.push('     - 不指定预设也可触发')
          lines.push('  3. 引用消息发指令')
          lines.push('     - 被引用消息和引用消息视为一条')
          lines.push('')
          lines.push('⚡ 高级用法：')
          lines.push('  • @用户 会自动获取该用户头像')
          lines.push('  • 使用 #lora名# 指定 LoRA (部分模型)')
          lines.push('  • 提示词包含"润色"自动优化 (部分模型)')
          lines.push('  • 支持 1024x1024/9:16/横屏 指定尺寸')
          lines.push('')
          lines.push('━━━━━━━━━━━━━━━━━━━━')

          return `<message forward><message>${lines.join('\n')}</message></message>`
        })
      presetCommandDisposables.push(() => parentCmd.dispose())

      // medialuna.presets [tag] - 查看预设列表
      const presetsCmd = ctx.command(`${PARENT_COMMAND}.presets [tag:string]`, '查看可用预设')
        .alias('presets')
        .action(async (_: any, tag: string) => {
          const presetService = mediaLunaRef?.presets
          if (!presetService) {
            return '预设服务不可用'
          }

          let presets = await presetService.listEnabled()

          if (tag) {
            presets = presets.filter((p: any) => p.tags.includes(tag))
            if (presets.length === 0) {
              return `没有找到标签为 [${tag}] 的预设`
            }
          }

          if (presets.length === 0) {
            return '没有可用的预设'
          }

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

          if (content.length > 500) {
            return `<message forward><message>${content}</message></message>`
          }

          return content
        })
      presetCommandDisposables.push(() => presetsCmd.dispose())

      // medialuna.preset <name> - 查看预设详情
      const presetCmd = ctx.command(`${PARENT_COMMAND}.preset <name:string>`, '查看预设详情')
        .alias('preset')
        .action(async ({ session }: { session?: Session }, name: string) => {
          if (!name) {
            return '请指定预设名称'
          }

          const presetService = mediaLunaRef?.presets
          if (!presetService) {
            return '预设服务不可用'
          }

          const preset = await presetService.getByName(name)
          if (!preset) {
            return `未找到预设: ${name}`
          }

          const templateLength = preset.promptTemplate?.length || 0
          const hasRefImages = preset.referenceImages && preset.referenceImages.length > 0
          // 有参考图或模板较长时使用转发消息
          const useForward = templateLength > 200 || hasRefImages

          if (useForward) {
            const forwardMessages: string[] = []

            const basicLines: string[] = []
            basicLines.push('━━━━━━━━━━━━━━')
            basicLines.push(`📋 预设：${preset.name}`)
            basicLines.push('━━━━━━━━━━━━━━')
            if (preset.tags && preset.tags.length > 0) {
              basicLines.push(`🏷️ 标签: ${preset.tags.join(', ')}`)
            }
            if (hasRefImages) {
              basicLines.push(`🖼️ 参考图: ${preset.referenceImages.length} 张`)
            }
            basicLines.push('━━━━━━━━━━━━━━')
            forwardMessages.push(`<message>${basicLines.join('\n')}</message>`)

            // 预览图
            if (preset.thumbnail) {
              forwardMessages.push(`<message>📷 预览图：\n<image url="${preset.thumbnail}"/></message>`)
            }

            // 参考图（每张单独一条消息，避免消息过长）
            if (hasRefImages) {
              for (let i = 0; i < preset.referenceImages.length; i++) {
                const refImg = preset.referenceImages[i]
                forwardMessages.push(`<message>🖼️ 参考图 ${i + 1}：\n<image url="${refImg}"/></message>`)
              }
            }

            // Prompt 模板
            if (preset.promptTemplate) {
              forwardMessages.push(`<message>📝 Prompt 模板：\n${preset.promptTemplate}</message>`)
            }

            return `<message forward>${forwardMessages.join('')}</message>`
          } else {
            const messages: string[] = []

            if (preset.thumbnail) {
              messages.push(`<image url="${preset.thumbnail}"/>`)
            }

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

            lines.push('━━━━━━━━━━━━━━')

            messages.push(lines.join('\n'))

            return messages.join('\n')
          }
        })
      presetCommandDisposables.push(() => presetCmd.dispose())

      // medialuna.models - 查看可用模型
      const modelsCmd = ctx.command(`${PARENT_COMMAND}.models [mode:string]`, '查看可用模型')
        .alias('models')
        .action(async (_argv, mode?: string) => {
          const channels = await mediaLunaRef.channels.listEnabled()

          if (!channels || channels.length === 0) {
            return '没有可用的模型'
          }

          const normalizedMode = (mode || '').trim().toLowerCase()
          const validModes = new Set(['all', 'dedupe', ...Array.from(CAPABILITY_KEYS)])
          if (normalizedMode && !validModes.has(normalizedMode)) {
            return [
              `未知模式: ${mode}`,
              '可选模式: all, dedupe, text2img, img2img, text2audio, text2video, img2video'
            ].join('\n')
          }

          const toCapabilityLabel = (key: CapabilityKey) => CAPABILITY_GROUPS.find(group => group.key === key)?.label || key

          const getChannelCapabilities = (channel: any): CapabilityKey[] => {
            const channelTags = Array.isArray(channel.tags) ? channel.tags : []
            return CAPABILITY_GROUPS
              .map(group => group.key)
              .filter(key => channelTags.includes(key))
          }

          const getExtraTags = (channel: any): string[] => {
            const channelTags = Array.isArray(channel.tags) ? channel.tags : []
            return channelTags.filter((tag: string) => !CAPABILITY_KEYS.has(tag as CapabilityKey))
          }

          const getCostInfo = (channel: any): string => {
            const cost = channel.pluginOverrides?.billing?.cost
            if (cost === 0) return '免费'
            if (cost !== undefined && cost > 0) {
              const currencyLabel = channel.pluginOverrides?.billing?.currencyLabel || '积分'
              return `${cost}${currencyLabel}/次`
            }
            return '未配置计费'
          }

          const getPrimaryCapability = (channel: any): CapabilityKey | null => {
            const capabilities = getChannelCapabilities(channel)
            return capabilities[0] || null
          }

          const formatChannelLine = (channel: any, primaryCapability?: CapabilityKey | null): string => {
            const parts: string[] = [channel.name]
            parts.push(getCostInfo(channel))

            if (primaryCapability) {
              parts.push(`主能力:${toCapabilityLabel(primaryCapability)}`)
            }

            const extraTags = getExtraTags(channel)
            if (extraTags.length > 0) {
              const shown = extraTags.slice(0, 2)
              const hiddenCount = extraTags.length - shown.length
              parts.push(`附加:${shown.join(', ')}${hiddenCount > 0 ? ` +${hiddenCount}` : ''}`)
            }

            return `  ${parts.join('  |  ')}`
          }

          const compareChannels = (a: any, b: any): number => {
            const aCost = a.pluginOverrides?.billing?.cost
            const bCost = b.pluginOverrides?.billing?.cost

            const normalizeCost = (cost: any) => {
              if (cost === 0) return 0
              if (typeof cost === 'number' && cost > 0) return cost
              return Number.MAX_SAFE_INTEGER
            }

            const diff = normalizeCost(aCost) - normalizeCost(bCost)
            if (diff !== 0) return diff
            return String(a.name).localeCompare(String(b.name), 'zh-CN')
          }

          const channelByCapability = new Map<CapabilityKey, any[]>()
          for (const group of CAPABILITY_GROUPS) {
            channelByCapability.set(group.key, [])
          }

          for (const channel of channels) {
            const capabilities = getChannelCapabilities(channel)
            for (const key of capabilities) {
              channelByCapability.get(key)?.push(channel)
            }
          }

          const lines: string[] = []
          lines.push('可用模型（按能力分组）')
          lines.push('')

          if (normalizedMode === 'dedupe') {
            lines.push('模式: 去重（图输入优先）')
            lines.push('')

            const grouped = new Map<CapabilityKey, any[]>()
            for (const group of CAPABILITY_GROUPS) {
              grouped.set(group.key, [])
            }

            for (const channel of channels) {
              const primary = getPrimaryCapability(channel)
              if (!primary) continue
              grouped.get(primary)?.push(channel)
            }

            for (const group of CAPABILITY_GROUPS) {
              const list = (grouped.get(group.key) || []).sort(compareChannels)
              if (list.length === 0) continue
              lines.push(`【${group.label}】`)
              for (const channel of list) {
                lines.push(formatChannelLine(channel, group.key))
              }
              lines.push('')
            }
          } else {
            const targetGroups = normalizedMode && normalizedMode !== 'all'
              ? CAPABILITY_GROUPS.filter(group => group.key === normalizedMode)
              : CAPABILITY_GROUPS

            for (const group of targetGroups) {
              const list = (channelByCapability.get(group.key) || []).sort(compareChannels)
              if (list.length === 0) continue

              lines.push(`【${group.label}】`) 
              for (const channel of list) {
                const primary = getPrimaryCapability(channel)
                lines.push(formatChannelLine(channel, primary))
              }
              lines.push('')
            }
          }

          if (lines[lines.length - 1] === '') {
            lines.pop()
          }

          const uniqueCount = new Set(channels.map((channel: any) => channel.id)).size
          const allCapabilityCount = CAPABILITY_GROUPS.reduce(
            (sum, group) => sum + (channelByCapability.get(group.key)?.length || 0),
            0
          )

          lines.push('')
          if (normalizedMode === 'dedupe') {
            lines.push(`共 ${uniqueCount} 个模型（去重）`)
          } else if (normalizedMode && normalizedMode !== 'all') {
            const matched = channelByCapability.get(normalizedMode as CapabilityKey)?.length || 0
            lines.push(`共 ${matched} 个模型（${toCapabilityLabel(normalizedMode as CapabilityKey)}）`)
          } else {
            lines.push(`共 ${uniqueCount} 个模型（分组累计 ${allCapabilityCount}，同一模型可出现在多个分组）`)
          }
          lines.push('用法: 模型名 [预设名] 提示词')
          lines.push('筛选: medialuna.models <all|dedupe|text2img|img2img|text2audio|text2video|img2video>')

          const content = lines.join('\n')

          return `<message forward><message>${content}</message></message>`
        })
      presetCommandDisposables.push(() => modelsCmd.dispose())

      // medialuna.mytasks [count] - 查看我的画图记录
      const myTasksCmd = ctx.command(`${PARENT_COMMAND}.mytasks [count:number]`, '查看我的画图记录')
        .alias('mytasks')
        .action(async ({ session }: { session?: Session }, count?: number) => {
          if (!session) {
            return '会话不可用'
          }

          const uid = (session as any)?.user?.id
          if (!uid) {
            return '请先登录后再查看记录'
          }

          const taskService = mediaLunaRef?.tasks
          const channelService = mediaLunaRef?.channels
          if (!taskService) {
            return '任务服务不可用'
          }

          const limit = count || config.myTasksDefaultCount
          const tasks = await taskService.query({ uid, limit })

          if (tasks.length === 0) {
            return '暂无画图记录'
          }

          // 获取渠道信息用于显示名称
          const channelMap = new Map<number, string>()
          if (channelService) {
            const channels = await channelService.list()
            for (const ch of channels) {
              channelMap.set(ch.id, ch.name)
            }
          }

          // 构建合并转发消息
          const forwardMessages: string[] = []

          // 添加标题
          forwardMessages.push(`<message>📜 我的画图记录（最近 ${tasks.length} 条）</message>`)

          for (const task of tasks) {
            const lines: string[] = []
            const channelName = channelMap.get(task.channelId) || `渠道#${task.channelId}`
            const statusText = task.status === 'success' ? '✅' : task.status === 'failed' ? '❌' : '⏳'

            lines.push(`${statusText}「${task.id}」${channelName}`)
            lines.push(`时间: ${new Date(task.startTime).toLocaleString()}`)

            if (task.duration) {
              lines.push(`耗时: ${formatDuration(task.duration)}`)
            }

            // 提示词摘要
            const prompt = task.requestSnapshot?.prompt || ''
            if (prompt) {
              const truncated = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt
              lines.push(`提示词: ${truncated}`)
            }

            // 如果有输出图片，显示第一张
            if (task.status === 'success' && task.responseSnapshot && task.responseSnapshot.length > 0) {
              const firstImage = task.responseSnapshot.find((a: OutputAsset) => a.kind === 'image' && a.url)
              if (firstImage && firstImage.url) {
                forwardMessages.push(`<message>${lines.join('\n')}\n<image url="${firstImage.url}"/></message>`)
              } else {
                forwardMessages.push(`<message>${lines.join('\n')}</message>`)
              }
            } else {
              forwardMessages.push(`<message>${lines.join('\n')}</message>`)
            }
          }

          // 添加提示
          forwardMessages.push(`<message>使用 ${PARENT_COMMAND}.taskinfo <任务ID> 查看详细信息</message>`)

          return `<message forward>${forwardMessages.join('')}</message>`
        })
      presetCommandDisposables.push(() => myTasksCmd.dispose())

      // medialuna.taskinfo <id> - 查看任务详情
      const taskDetailCmd = ctx.command(`${PARENT_COMMAND}.taskinfo <id:number>`, '查看任务详细信息')
        .alias('taskinfo')
        .action(async ({ session }: { session?: Session }, id: number) => {
          if (!id && id !== 0) {
            return '请指定任务 ID'
          }

          const taskService = mediaLunaRef?.tasks
          const channelService = mediaLunaRef?.channels
          if (!taskService) {
            return '任务服务不可用'
          }

          // 确保 id 是数字
          const taskId = Number(id)
          if (isNaN(taskId)) {
            return `无效的任务 ID: ${id}`
          }

          const task = await taskService.getById(taskId)
          if (!task) {
            return `未找到任务「${taskId}」`
          }

          // 检查权限：只能查看自己的任务（管理员除外）
          const uid = (session as any)?.user?.id
          const isAdmin = (session as any)?.user?.authority >= 3
          if (!isAdmin && task.uid !== uid) {
            return '无权查看此任务'
          }

          // 获取渠道名称
          let channelName = `渠道#${task.channelId}`
          if (channelService) {
            const channel = await channelService.getById(task.channelId)
            if (channel) {
              channelName = channel.name
            }
          }

          const forwardMessages: string[] = []

          // 基本信息
          const statusText = task.status === 'success' ? '✅ 成功' :
            task.status === 'failed' ? '❌ 失败' :
              task.status === 'processing' ? '⏳ 处理中' : '🕐 等待中'

          const basicLines: string[] = []
          basicLines.push('━━━━━━━━━━━━━━')
          basicLines.push(`📋 任务「${task.id}」`)
          basicLines.push('━━━━━━━━━━━━━━')
          basicLines.push(`状态: ${statusText}`)
          basicLines.push(`渠道: ${channelName}`)
          basicLines.push(`开始时间: ${new Date(task.startTime).toLocaleString()}`)
          if (task.endTime) {
            basicLines.push(`结束时间: ${new Date(task.endTime).toLocaleString()}`)
          }
          if (task.duration) {
            basicLines.push(`耗时: ${formatDuration(task.duration)}`)
          }
          basicLines.push('━━━━━━━━━━━━━━')

          forwardMessages.push(`<message>${basicLines.join('\n')}</message>`)

          // 请求信息
          const request = task.requestSnapshot
          if (request) {
            const reqLines: string[] = []
            reqLines.push('📝 请求信息')
            reqLines.push('─────────────')

            if (request.prompt) {
              reqLines.push(`提示词: ${request.prompt}`)
            }

            // 检查预设
            const presetName = request.parameters?.preset
            if (presetName) {
              reqLines.push(`预设: ${presetName}`)
            }

            // 检查中间件处理后的提示词
            const transformedPrompt = (task.middlewareLogs as any)?.preset?.transformedPrompt
            if (transformedPrompt && transformedPrompt !== request.prompt) {
              reqLines.push(`处理后: ${transformedPrompt}`)
            }

            // 输入文件数量
            if (request.files && request.files.length > 0) {
              reqLines.push(`输入文件: ${request.files.length} 个`)
            }

            forwardMessages.push(`<message>${reqLines.join('\n')}</message>`)

            // 显示输入的参考图片（如果有缓存的 URL）
            const inputFiles = (request as any).inputFiles as OutputAsset[] | undefined
            if (inputFiles && inputFiles.length > 0) {
              forwardMessages.push(`<message>📥 输入图片 (${inputFiles.length} 个)</message>`)
              for (const file of inputFiles) {
                if (file.kind === 'image' && file.url) {
                  forwardMessages.push(`<message><image url="${file.url}"/></message>`)
                }
              }
            }
          }

          // 输出结果
          if (task.status === 'success' && task.responseSnapshot && task.responseSnapshot.length > 0) {
            forwardMessages.push(`<message>🎨 输出结果 (${task.responseSnapshot.length} 个)</message>`)

            for (const asset of task.responseSnapshot) {
              if (asset.kind === 'image' && asset.url) {
                forwardMessages.push(`<message><image url="${asset.url}"/></message>`)
              } else if (asset.kind === 'video' && asset.url) {
                forwardMessages.push(`<message><video url="${asset.url}"/></message>`)
              } else if (asset.kind === 'audio' && asset.url) {
                forwardMessages.push(`<message><audio url="${asset.url}"/></message>`)
              } else if (asset.kind === 'text' && asset.content) {
                forwardMessages.push(`<message>文本: ${asset.content}</message>`)
              }
            }
          } else if (task.status === 'failed') {
            const errorInfo = (task.middlewareLogs as any)?._error
            const errorMsg = errorInfo?.message || '未知错误'
            forwardMessages.push(`<message>❌ 错误信息: ${errorMsg}</message>`)
          }

          // 中间件日志（如果有 billing 信息）
          const billingLog = (task.middlewareLogs as any)?.billing
          if (billingLog) {
            const billingLines: string[] = []
            billingLines.push('💰 计费信息')
            billingLines.push('─────────────')
            if (billingLog.cost !== undefined) {
              billingLines.push(`消费: ${billingLog.cost}`)
            }
            if (billingLog.balance !== undefined) {
              billingLines.push(`余额: ${billingLog.balance}`)
            }
            forwardMessages.push(`<message>${billingLines.join('\n')}</message>`)
          }

          return `<message forward>${forwardMessages.join('')}</message>`
        })
      presetCommandDisposables.push(() => taskDetailCmd.dispose())

      // medialuna.redraw <id> [追加提示词] - 重绘任务
      const redrawCmd = ctx.command(`${PARENT_COMMAND}.redraw <id:number> [...appendPrompt:string]`, '使用相同参数重新生成（可追加提示词）')
        .alias('redraw')
        .action(async ({ session }: { session?: Session }, id: number, ...appendPromptParts: string[]) => {
          if (!id && id !== 0) {
            return '请指定任务 ID'
          }

          const taskService = mediaLunaRef?.tasks
          const channelService = mediaLunaRef?.channels
          if (!taskService || !channelService) {
            return '服务不可用'
          }

          // 获取任务信息
          const taskId = Number(id)
          if (isNaN(taskId)) {
            return `无效的任务 ID: ${id}`
          }

          const task = await taskService.getById(taskId)
          if (!task) {
            return `未找到任务「${taskId}」`
          }

          // 检查权限：只能重绘自己的任务（管理员除外）
          const uid = (session as any)?.user?.id
          const isAdmin = (session as any)?.user?.authority >= 3
          if (!isAdmin && task.uid !== uid) {
            return '无权重绘此任务'
          }

          // 获取渠道信息
          const channel = await channelService.getById(task.channelId)
          if (!channel) {
            return `渠道不存在 (ID: ${task.channelId})`
          }

          // 检查渠道是否启用
          if (!channel.enabled) {
            return `渠道「${channel.name}」已禁用`
          }

          // 提取任务参数
          const request = task.requestSnapshot
          const originalPrompt = request?.prompt || ''
          const appendPrompt = appendPromptParts.join(' ').trim()
          const prompt = appendPrompt
            ? (originalPrompt ? `${originalPrompt} ${appendPrompt}` : appendPrompt)
            : originalPrompt
          const presetName = request?.parameters?.preset
          const inputFiles = (request as any)?.inputFiles as OutputAsset[] | undefined

          // 下载参考图片
          const files: FileData[] = []
          let inputFileWarning: string | null = null
          if (inputFiles && inputFiles.length > 0) {
            // 检查输入文件状态
            const hasHttpUrls = inputFiles.some(f => f.url?.startsWith('http'))
            const hasBase64Removed = inputFiles.some(f => f.url === '[base64-data-removed]')
            const hasEmptyUrls = inputFiles.some(f => !f.url || f.url === '')

            if (!hasHttpUrls) {
              // 没有可用的 HTTP URL
              if (hasBase64Removed) {
                inputFileWarning = `原任务有 ${inputFiles.length} 张参考图，但未启用存储中间件，无法重新下载`
              } else if (hasEmptyUrls) {
                inputFileWarning = `原任务有 ${inputFiles.length} 张参考图，但未保存 URL（需启用存储中间件）`
              }
            } else {
              // 尝试下载有 HTTP URL 的文件
              for (const file of inputFiles) {
                if (file.url && file.url.startsWith('http')) {
                  try {
                    const response = await ctx.http.get(file.url, {
                      responseType: 'arraybuffer',
                      timeout: 30000
                    })
                    if (response && response.byteLength > 0) {
                      const buffer = Buffer.from(response)
                      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
                      files.push({
                        data: arrayBuffer,
                        mime: file.mime || 'image/png',
                        filename: `redraw_${files.length}.${(file.mime || 'image/png').split('/')[1] || 'png'}`
                      })
                    }
                  } catch (e) {
                    logger.warn('Failed to download image for redraw: %s', e)
                  }
                }
              }
              // 检查是否全部下载失败
              if (files.length === 0) {
                inputFileWarning = `原任务有 ${inputFiles.length} 张参考图，但下载失败（URL 可能已过期）`
              } else if (files.length < inputFiles.filter(f => f.url?.startsWith('http')).length) {
                inputFileWarning = `部分参考图下载失败 (${files.length}/${inputFiles.length})`
              }
            }
          }

          const infoParts = [`重绘任务「${taskId}」`]
          infoParts.push(`渠道: ${channel.name}`)
          if (presetName) infoParts.push(`预设: ${presetName}`)
          if (appendPrompt) {
            infoParts.push(`追加: ${appendPrompt.length > 30 ? appendPrompt.slice(0, 30) + '...' : appendPrompt}`)
          }
          infoParts.push(`提示词: ${prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt}`)
          if (files.length > 0) {
            infoParts.push(`参考图: ${files.length} 张`)
          } else if (inputFileWarning) {
            infoParts.push(`⚠️ ${inputFileWarning}`)
          }

          return executeGenerate(ctx, session, mediaLunaRef, {
            channelName: channel.name,
            presetName,
            prompt,
            files,
            summaryMsg: infoParts.join(' | ')
          }, config, channel.tags || [])
        })
      presetCommandDisposables.push(() => redrawCmd.dispose())

      logger.info('Preset query commands registered')
    }

    // 等待 mediaLuna 服务就绪后注册指令
    ctx.on('ready', async () => {
      mediaLunaRef = ctx.mediaLuna
      await refreshGenerateCommands()
      // 预设查询指令使用全局配置
      if (mediaLunaRef.isPluginEnabledForChannel('koishi-commands', null)) {
        registerPresetCommands()
      }
    })

    // 监听渠道变化，动态刷新指令
    ctx.on('mediaLuna/channel-updated' as any, async () => {
      if (!mediaLunaRef) return
      logger.debug('Channel updated, refreshing commands...')
      await refreshGenerateCommands()
    })

    // 清理 - 注销所有指令
    pluginCtx.onDispose(() => {
      logger.debug('Disposing koishi-commands: %d channel commands, %d preset commands',
        channelCommandDisposables.size, presetCommandDisposables.length)

      for (const { dispose } of channelCommandDisposables.values()) {
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

      logger.debug('koishi-commands disposed')
    })
  }
})

/**
 * 注册单个渠道指令
 */
function registerChannelCommand(
  ctx: any,
  mediaLuna: any,
  channel: any,
  presets: any[],
  config: KoishiCommandsConfig,
  logger: any,
  parentCommand: string
): () => void {
  // 检查渠道是否需要收集模式
  // 只有带 img2img 或 img2video 标签的渠道才需要收集图片输入
  const channelTags: string[] = channel.tags || []
  const needsImageInput = channelTags.some((tag: string) =>
    tag.startsWith('img2')
  )
  const needsVideoInput = channelTags.some((tag: string) =>
    tag.startsWith('video2')
  )
  const needsMediaInput = needsImageInput || needsVideoInput

  // 注册渠道指令（使用 rest 参数捕获所有输入）
  // 注意：presets 参数仅用于初始 usage 显示，实际预设匹配在执行时实时查询
  //
  // 重要：Koishi 的 ctx.command() 在命令已存在时会返回现有命令对象
  // 此时再调用 .option() 会导致 duplicate option 错误
  // 因此需要检查命令是否已存在，或者选项是否已注册
  const commandName = `${parentCommand}.${channel.name}`
  const channelCmd = ctx.command(`${commandName} [...rest:string]`, `${channel.name} 生成`)
    .alias(channel.name)  // 添加短名别名，允许直接使用渠道名调用

  // 安全添加选项：检查选项是否已存在，避免重复注册
  // Koishi Command 对象的 _options 存储了已注册的选项
  const existingOptions = (channelCmd as any)._options || {}
  if (!existingOptions['image']) {
    channelCmd.option('image', '-i <url:string> 输入图片URL')
  }
  if (!existingOptions['video']) {
    channelCmd.option('video', '-v <url:string> 输入视频URL')
  }

  // 设置用法说明和动作处理器
  channelCmd
    .usage(`用法: ${commandName} [预设名] <提示词>\n可用预设: ${presets.map((p: any) => p.name).join(', ') || '无'}`)
    .action(async ({ session, options }: { session: Session; options: any }) => {
      // 初始化收集状态（预设名稍后解析）
      const state: CollectState = {
        files: [],
        processedUrls: new Set(),
        prompts: [],
        presetName: undefined
      }

      // 创建提取器，传入命令名前缀列表
      const extractor = new MessageExtractor(ctx, logger, state, config, [commandName, channel.name])

      // 从当前消息提取媒体内容（图片、at、引用）
      await extractor.extractMedia(session)

      // 提取文本，自动去除命令名前缀
      const promptText = extractor.extractTextWithoutCommand(session?.elements || [])
      if (promptText) {
        state.prompts.push(promptText)
      }

      // 如果命令行指定了图片 URL，也获取
      if (options?.image) {
        await extractor.fetchImage(options.image, 'input')
      }
      // 如果命令行指定了视频 URL，也获取
      if (options?.video) {
        await extractor.fetchVideo(options.video, 'input')
      }

      // 如果渠道不需要媒体输入（纯 text2xxx 类型），直接生成
      if (!needsMediaInput) {
        // 只要有提示词就可以生成
        if (state.prompts.length === 0 && state.files.length === 0) {
          return '请输入提示词'
        }
        return executeGenerateWithPresetCheck(ctx, session, channel, state, mediaLuna, config)
      }

      // 以下是需要媒体输入的渠道（img2xxx/video2xxx 类型）

      // 判断是否直接触发（渠道标签优先于全局配置）
      const directTriggerCount = resolveDirectTriggerImageCount(channelTags, config.directTriggerImageCount)
      if (state.files.length >= directTriggerCount) {
        const extractResult = extractor.getResult()
        if (extractResult.failed > 0) {
          return [
            `检测到素材收集失败（成功 ${state.files.length} / 失败 ${extractResult.failed}），已取消本次生成。`,
            '请重新发送命令和图片再试。'
          ].join('\n')
        }
        // 图片数量足够，直接生成
        return executeGenerateWithPresetCheck(ctx, session, channel, state, mediaLuna, config)
      }

      // 进入收集模式
      return enterCollectMode(ctx, session, channel, state, config, mediaLuna, logger)
    })

  logger.debug(`Registered command: ${channel.name} (needsMediaInput: ${needsMediaInput}, ${presets.length} presets)`)
  return () => channelCmd.dispose()
}

/**
 * 收集结果统计
 */
interface ExtractResult {
  images: number      // 成功收集的图片数
  avatars: number     // 成功收集的头像数
  failed: number      // 失败的数量
  skipped: number     // 跳过的数量（重复URL）
  failedUrls: string[] // 失败的URL列表
}

/**
 * 消息内容提取器
 * 针对 OneBot 平台优化，统一处理图片、at、引用消息等元素的提取
 */
class MessageExtractor {
  private ctx: any
  private logger: any
  private state: CollectState
  private config: KoishiCommandsConfig
  private result: ExtractResult
  private commandPrefixes: string[]  // 需要去除的命令名前缀列表

  constructor(
    ctx: any,
    logger: any,
    state: CollectState,
    config: KoishiCommandsConfig,
    commandPrefixes: string[] = []
  ) {
    this.ctx = ctx
    this.logger = logger
    this.state = state
    this.config = config
    this.result = { images: 0, avatars: 0, failed: 0, skipped: 0, failedUrls: [] }
    // 按长度降序排列，确保优先匹配更长的命令名
    this.commandPrefixes = [...commandPrefixes].sort((a, b) => b.length - a.length)
  }

  /**
   * 获取本次提取的结果统计
   */
  getResult(): ExtractResult {
    return { ...this.result }
  }

  /**
   * 重置结果统计（用于收集模式中每条消息）
   */
  resetResult(): void {
    this.result = { images: 0, avatars: 0, failed: 0, skipped: 0, failedUrls: [] }
  }

  /**
   * 从 Session 提取所有内容（图片、at、引用、文本）
   */
  async extractAll(session: Session | undefined): Promise<string> {
    if (!session?.elements) return ''

    // 提取媒体内容
    await this.extractMedia(session)

    // 提取文本
    return this.extractText(session.elements)
  }

  get stateInfo() {
    return {
      files: this.state.files.length,
      prompts: this.state.prompts.length
    }
  }

  /**
   * 从 Session 只提取媒体内容（图片、at、引用），不提取文本
   * 顺序：引用图片 → 当前图片 → @头像（符合用户直觉）
   */
  async extractMedia(session: Session | undefined): Promise<void> {
    if (!session?.elements) return

    // 调试：打印消息结构
    this.logger.debug('Message elements: %s', JSON.stringify(session.elements, null, 2))
    if (session.quote) {
      this.logger.debug('Quote message: %s', JSON.stringify(session.quote, null, 2))
    }

    // 1. 先提取引用消息中的图片（引用的内容是"原始素材"，应该在前）
    await this.extractFromQuote(session)

    // 2. 提取当前消息的图片
    await this.extractImages(session.elements)

    // 提取视频
    await this.extractVideos(session.elements, session)

    // 3. 最后提取 @ 用户头像
    await this.extractAtAvatars(session)

    this.logger.info(
      'Extract result: %d images, %d avatars, %d failed, %d skipped. Total files: %d',
      this.result.images, this.result.avatars, this.result.failed, this.result.skipped,
      this.state.files.length
    )

    if (this.result.failedUrls.length > 0) {
      this.logger.warn('Failed URLs: %s', this.result.failedUrls.join(', '))
    }
  }

  /**
   * 从元素数组中提取图片
   * OneBot 平台图片元素：type = 'img' 或 'image'
   * 属性可能是 src、url、file 等
   */
  async extractImages(elements: any[]): Promise<void> {
    for (const el of elements) {
      // 跳过 quote 元素（引用图片单独处理）
      if (el.type === 'quote') continue

      if (el.type === 'img' || el.type === 'image') {
        // OneBot 可能的属性：src, url, file
        const imageUrl = el.attrs?.src || el.attrs?.url || el.attrs?.file
        if (imageUrl) {
          const success = await this.fetchImage(imageUrl, 'image')
          if (success) this.result.images++
        } else {
          this.logger.warn('Image element has no URL, attrs: %s', JSON.stringify(el.attrs))
        }
      }
    }
  }

  /**
   * 从元素数组中提取视频
   */
  async extractVideos(elements: any[], session?: Session): Promise<void> {
    for (const el of elements) {
      if (el.type === 'video') {
        this.logger.info('Found video element. Full structure: %s', JSON.stringify(el, null, 2))

        // 优先寻找 http/https 链接
        let targetUrl = el.attrs?.url || el.attrs?.src

        // 如果 url/src 是本地路径，尝试寻找其他可能的 HTTP 属性
        // 某些适配器可能把 http 链接放在其他字段，或者 src 是本地 file 是远程
        if (targetUrl && !targetUrl.startsWith('http')) {
          // 尝试遍历 attrs 寻找 http 链接
          for (const [key, val] of Object.entries(el.attrs || {})) {
            if (typeof val === 'string' && val.startsWith('http')) {
              this.logger.info('Found alternative HTTP URL in attr %s: %s', key, val)
              targetUrl = val
              break
            }
          }
        }

        // NapCat/OneBot 修复：如果开启了配置且 platform 是 onebot/qq，尝试使用 get_file
        if (this.config.useNapCatFileApi && session?.bot?.platform && ['onebot', 'qq', 'red'].includes(session.bot.platform)) {
          // 检查是否有 file 属性 (NapCat 通常会有 file 属性作为 file_id)
          const fileId = el.attrs?.file || el.attrs?.file_id

          // 如果当前没有 targetUrl 或者 targetUrl 是本地路径，且有 fileId，则尝试获取
          // 本地路径通常包含 "Video" 或 "Tencent Files" 或没有协议头
          const isLocalPath = !targetUrl || !targetUrl.startsWith('http')

          if (isLocalPath && fileId && session.onebot?._request) {
            try {
              this.logger.info(`Attempting to fetch real URL for video fileId: ${fileId} using NapCat API`)
              const {data}  = await session.onebot._request("get_file", { file: fileId })
              // NapCat get_file 返回 { file_name, md5, size, url, ... }
              if (data && data.url && (data.url.startsWith("http://") || data.url.startsWith("https://"))) {
                this.logger.info(`Successfully retrieved NapCat video URL: ${data.url}`)
                targetUrl = data.url
              } else {
                this.logger.warn(`NapCat API returned no URL for fileId: ${fileId}. Trying to use get_group_file_url.`)
                const {data}  = await session.onebot._request("get_group_file_url", { file: fileId, group_id: session.guildId})
                if (data && data.url && (data.url.startsWith("http://") || data.url.startsWith("https://"))) {
                  this.logger.info(`Successfully retrieved NapCat video URL: ${data.url}`)
                  targetUrl = data.url
                } else {
                  this.logger.warn(`get_group_file_url returned no URL for fileId: ${fileId}.`)
                }
              }
            } catch (e) {
              this.logger.warn(`Failed to call NapCat get_file for ${fileId}: ${e}`)
            }
          }
        }

        if (targetUrl) {
          this.logger.info('Attempting to fetch video from: %s', targetUrl)
          await this.fetchVideo(targetUrl, 'input')
        } else {
          this.logger.warn('No URL found for video element')
        }
      }
    }
  }

  /**
   * 从 Session 中提取 at 用户的头像
   */
  async extractAtAvatars(session: Session): Promise<void> {
    if (!session.elements) return

    const atElements = h.select(session.elements, 'at')
    for (const at of atElements) {
      const userId = at.attrs?.id
      if (userId && session.bot) {
        try {
          const user = await session.bot.getUser(userId)
          const avatarUrl = user?.avatar
          if (avatarUrl) {
            const success = await this.fetchImage(avatarUrl, 'avatar')
            if (success) {
              this.result.avatars++
              this.logger.debug('Extracted avatar for user %s', userId)
            }
          } else {
            this.logger.debug('User %s has no avatar', userId)
          }
        } catch (e) {
          this.logger.warn('Failed to get user info for %s: %s', userId, e)
        }
      }
    }
  }

  /**
   * 从引用消息中提取图片
   * 支持：
   * 1. session.elements 中的 quote 元素（内嵌引用）
   * 2. session.quote 属性（独立的被引用消息）
   */
  async extractFromQuote(session: Session): Promise<void> {
    // 1. 从 session.elements 中查找 quote 元素
    if (session.elements) {
      for (const el of session.elements) {
        if (el.type === 'quote' && el.children && el.children.length > 0) {
          for (const child of el.children) {
            if (child.type === 'img' || child.type === 'image') {
              await this.fetchImage(child.attrs?.src || child.attrs?.url, 'quote')
            }
          }
        }
      }
    }

    // 2. 从 session.quote 中提取图片和视频（被引用消息的内容）
    const quote = session.quote as any
    if (quote?.elements) {
      this.logger.debug('Extracting from session.quote.elements')
      for (const el of quote.elements) {
        if (el.type === 'img' || el.type === 'image') {
          await this.fetchImage(el.attrs?.src || el.attrs?.url, 'quote')
        }
      }
    } else if (quote?.content) {
      // 有些平台可能只有 content 字符串，尝试解析
      this.logger.debug('Quote has content but no elements: %s', quote.content)
    }
  }

  /**
   * 从元素数组中提取文本
   */
  extractText(elements: any[]): string {
    const textElements = h.select(elements, 'text')
    return textElements.map(el => el.attrs?.content || '').join('').trim()
  }

  /**
   * 从元素数组中提取文本，并去除命令名前缀
   * 使用构造时传入的 commandPrefixes
   */
  extractTextWithoutCommand(elements: any[]): string {
    let text = this.extractText(elements)
    if (!text || this.commandPrefixes.length === 0) return text

    const textLower = text.toLowerCase()

    for (const cmdName of this.commandPrefixes) {
      const cmdLower = cmdName.toLowerCase()
      if (textLower.startsWith(cmdLower)) {
        // 去除命令名和后面的空格
        text = text.substring(cmdName.length).trimStart()
        break
      }
    }

    return text
  }

  /**
   * 获取图片并添加到 state
   * 返回是否成功
   */
  async fetchImage(url: string | undefined, prefix: string): Promise<boolean> {
    if (!url) {
      this.logger.debug('fetchImage called with empty URL')
      return false
    }

    // 检查是否已处理过（去重）
    if (this.state.processedUrls.has(url)) {
      this.logger.debug('Skipping duplicate URL: %s', url.substring(0, 100))
      this.result.skipped++
      return false
    }

    this.state.processedUrls.add(url)

    try {
      // 设置超时，避免卡住
      const response = await this.ctx.http.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000  // 30秒超时
      })

      if (!response || response.byteLength === 0) {
        this.logger.warn('Empty response for image: %s', url.substring(0, 100))
        this.result.failed++
        this.result.failedUrls.push(url.substring(0, 100))
        return false
      }

      const buffer = Buffer.from(response)
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

      // 尝试检测 MIME 类型
      const mime = this.detectMimeType(buffer) || 'image/png'

      this.state.files.push({
        data: arrayBuffer,
        mime,
        filename: `${prefix}_${this.state.files.length}.${this.getExtFromMime(mime)}`
      })

      this.logger.debug('Fetched image: %s (%d bytes, %s)', prefix, buffer.length, mime)
      return true
    } catch (e: any) {
      const errorMsg = e?.message || String(e)
      this.logger.warn('Failed to fetch image [%s]: %s (URL: %s)', prefix, errorMsg, url.substring(0, 100))
      this.result.failed++
      this.result.failedUrls.push(url.substring(0, 100))
      return false
    }
  }

  /**
   * 获取视频并添加到 state
   */
  async fetchVideo(url: string | undefined, prefix: string): Promise<boolean> {
    if (!url || this.state.processedUrls.has(url)) return false

    this.state.processedUrls.add(url)
    try {
      this.logger.debug('Fetching video from %s', url)
      const response = await this.ctx.http.get(url, { responseType: 'arraybuffer', timeout: 30000 })
      const buffer = Buffer.from(response)

      if (buffer.length === 0) {
        this.logger.warn('Empty video response from %s', url)
        return false
      }

      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

      // 根据 URL 扩展名推断 mime type
      let mime = 'video/mp4'
      if (url.endsWith('.webm')) mime = 'video/webm'
      if (url.endsWith('.mov')) mime = 'video/quicktime'
      if (url.endsWith('.mkv')) mime = 'video/x-matroska'

      this.state.files.push({
        data: arrayBuffer,
        mime,
        filename: `${prefix}_${this.state.files.length}.${mime.split('/')[1] || 'mp4'}`
      })

      this.logger.debug('Fetched video: %s (%d bytes, %s)', prefix, buffer.length, mime)
      return true
    } catch (e: any) {
      this.logger.warn('Failed to fetch video from %s: %s', prefix, e?.message || e)
      return false
    }
  }

  /**
   * 检测图片 MIME 类型（通过魔数）
   */
  private detectMimeType(buffer: Buffer): string | null {
    if (buffer.length < 4) return null

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'image/png'
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg'
    }
    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return 'image/gif'
    }
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer.length > 11 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'image/webp'
    }
    // BMP: 42 4D
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
      return 'image/bmp'
    }

    return null
  }

  /**
   * 根据 MIME 类型获取扩展名
   */
  private getExtFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp'
    }
    return map[mime] || 'png'
  }

  /**
   * 添加文本到提示词
   */
  addPrompt(text: string): void {
    if (text && !['开始', 'go', 'start', '取消', 'cancel'].includes(text.toLowerCase())) {
      this.state.prompts.push(text)
    }
  }
}

/**
 * 解析预设名并执行生成
 * 从 prompts 的第一个词判断是否为预设名
 * 预设列表在执行时实时查询，确保新增预设能被识别
 */
async function executeGenerateWithPresetCheck(
  ctx: any,
  session: Session | undefined,
  channel: any,
  state: CollectState,
  mediaLuna: any,
  config: KoishiCommandsConfig
): Promise<string> {
  // 实时获取该渠道匹配的预设列表（基于渠道标签与预设标签匹配）
  const combinations = await mediaLuna.getChannelPresetCombinations()
  const channelCombo = combinations.find((c: any) => c.channel.id === channel.id)
  const presets: any[] = channelCombo?.presets || []

  // 构建预设名集合和映射
  const presetNamesLower = new Set(presets.map((p: any) => p.name.toLowerCase()))
  const presetNameMap = new Map(presets.map((p: any) => [p.name.toLowerCase(), p.name]))

  // 合并所有提示词
  const fullPrompt = state.prompts.join(' ').trim()
  const words = fullPrompt.split(/\s+/)

  let presetName: string | undefined
  let actualPrompt = fullPrompt

  // 检查第一个词是否是预设名
  if (words.length > 0 && words[0]) {
    const firstWord = words[0].toLowerCase()
    if (presetNamesLower.has(firstWord)) {
      presetName = presetNameMap.get(firstWord)
      actualPrompt = words.slice(1).join(' ')
    }
  }

  // 构建生成摘要信息
  const summaryParts: string[] = []
  if (presetName) {
    summaryParts.push(`预设: ${presetName}`)
  } else {
    summaryParts.push('无预设')
  }
  summaryParts.push(`提示词: ${actualPrompt.length} 字`)
  summaryParts.push(`图片: ${state.files.length} 张`)

  const summaryMsg = `开始生成 | ${summaryParts.join(' | ')}`

  // 执行生成（传递 config 和渠道标签用于链接模式检查）
  return executeGenerate(ctx, session, mediaLuna, {
    channelName: channel.name,
    presetName,
    prompt: actualPrompt,
    files: state.files,
    summaryMsg
  }, config, channel.tags || [])
}

/**
 * 进入收集模式
 * 使用中间件捕获完整消息（包括图片）
 * 预设列表在执行生成时实时查询
 */
async function enterCollectMode(
  ctx: any,
  session: Session | undefined,
  channel: any,
  state: CollectState,
  config: KoishiCommandsConfig,
  mediaLuna: any,
  logger: any
): Promise<string> {
  if (!session) {
    return '会话不可用'
  }

  // 发送收集模式提示
  const imgCount = state.files.filter(f => f.mime.startsWith('image/')).length
  const videoCount = state.files.filter(f => f.mime.startsWith('video/')).length
  
  const hintMsgIds = await session.send(
    `已进入收集模式，请继续发送图片/视频/@用户/文字\n发送「开始」触发生成，发送「取消」退出\n当前已收集: ${imgCount} 张图片, ${videoCount} 个视频`
  )

  const timeoutMs = config.collectTimeout * 1000
  const extractor = new MessageExtractor(ctx, logger, state, config)

  // 使用 Promise 来等待收集完成
  return new Promise<string>((resolve) => {
    let disposed = false
    // 防止同一消息被多次处理（QQ 平台可能对同一消息发送多个事件）
    const processedMessageIds = new Set<string>()

    // 超时处理
    const timeoutHandle = setTimeout(async () => {
      if (disposed) return
      disposed = true
      disposeMiddleware()
      await deleteMessages(session, hintMsgIds)
      resolve('收集超时，已取消')
    }, timeoutMs)

    // 注册中间件来捕获消息
    const disposeMiddleware = ctx.middleware(async (sess: Session, next: () => Promise<void>) => {
      // 只处理同一用户、同一频道、同一 bot 的消息
      if (disposed) return next()
      if (sess.userId !== session.userId) return next()
      if (sess.channelId !== session.channelId) return next()
      // 关键：只处理同一 bot 的消息（多 bot 场景下避免重复处理）
      if (sess.selfId !== session.selfId) return next()

      // DEBUG: 打印收到的消息结构
      logger.info('Collection middleware received: %s', JSON.stringify({
        content: sess.content,
        elements: sess.elements,
        messageId: sess.messageId
      }, null, 2))

      // 检查消息是否已处理过（防止重复处理）
      const messageId = sess.messageId
      if (messageId && processedMessageIds.has(messageId)) {
        logger.debug('Skipping already processed message: %s', messageId)
        return  // 不调用 next()，阻止继续传播
      }
      if (messageId) {
        processedMessageIds.add(messageId)
      }

      // 提取文本
      const textContent = extractor.extractText(sess.elements || []).toLowerCase()

      // 检查触发词
      if (textContent === '开始' || textContent === 'go' || textContent === 'start') {
        if (disposed) return
        disposed = true
        clearTimeout(timeoutHandle)
        disposeMiddleware()
        await deleteMessages(session, hintMsgIds)

        // 检查是否有内容可生成
        if (state.files.length === 0 && state.prompts.length === 0) {
          resolve('没有可生成的内容')
          return
        }

        // 开始生成（带预设检查）
        const result = await executeGenerateWithPresetCheck(
          ctx, session, channel, state, mediaLuna, config
        )
        resolve(result)
        return
      }

      if (textContent === '取消' || textContent === 'cancel') {
        if (disposed) return
        disposed = true
        clearTimeout(timeoutHandle)
        disposeMiddleware()
        await deleteMessages(session, hintMsgIds)
        resolve('已取消')
        return
      }

      // 记录当前文件数量
      const prevFileCount = state.files.length

      // 从消息中提取所有内容
      extractor.resetResult()  // 重置统计
      const text = await extractor.extractAll(sess)
      extractor.addPrompt(text)

      const { files, prompts } = state

      // 重新计算各类数量
      const imgCount = files.filter(f => f.mime.startsWith('image/')).length
      const videoCount = files.filter(f => f.mime.startsWith('video/')).length
      const promptCount = prompts.length

      // 检查是否有主要变化
      const hasNewFiles = files.length > prevFileCount
      const hasNewText = !!text

      // 反馈给用户已收集的数量
      if (hasNewFiles || hasNewText) {
        logger.debug(`Collected update: ${imgCount} imgs, ${videoCount} videos, ${promptCount} prompts`)
        await sess.send(`已收集: ${imgCount} 张图片, ${videoCount} 个视频, ${promptCount} 条提示词`)
      }

      // 只在有图片收集失败时反馈
      const result = extractor.getResult()
      if (result.failed > 0) {
        sess.send(`⚠️ ${result.failed}张图片收集失败，当前共${state.files.length}张`).catch(() => {})
      }

      // 不传递给下一个中间件，阻止其他指令处理
    }, true) // true 表示优先级高
  })
}

/**
 * 删除消息
 */
async function deleteMessages(session: Session, msgIds: string[]): Promise<void> {
  if (!msgIds || msgIds.length === 0) return

  for (const msgId of msgIds) {
    try {
      await session.bot?.deleteMessage(session.channelId!, msgId)
    } catch (e) {
      // 忽略删除失败（可能没有权限或消息已删除）
    }
  }
}

/**
 * 执行生成请求
 */
async function executeGenerate(
  ctx: any,
  session: Session | undefined,
  mediaLuna: any,
  options: {
    channelName: string
    presetName?: string
    prompt: string
    files: FileData[]
    summaryMsg?: string
  },
  config: KoishiCommandsConfig,
  channelTags: string[] = []
): Promise<string> {
  const logger = ctx.logger('media-luna/commands')

  // 获取用户 ID
  const uid = (session as any)?.user?.id

  // 用于存储"正在生成中"消息的 ID，以便后续撤回
  let generatingMsgIds: string[] | undefined

  try {
    const result: GenerationResult = await mediaLuna.generateByName({
      channelName: options.channelName,
      presetName: options.presetName,
      prompt: options.prompt,
      files: options.files,
      session,
      uid,
      // prepare 阶段完成后的回调：将 before hints 和状态消息合并发送
      onPrepareComplete: async (beforeHints: string[]) => {
        if (!session) return

        // 构建合并后的状态消息
        const parts: string[] = []

        // 添加 before hints（如预扣费信息）
        if (beforeHints.length > 0) {
          parts.push(beforeHints.join('\n'))
        }

        // 添加摘要信息
        if (options.summaryMsg) {
          parts.push(options.summaryMsg)
        }

        // 添加"正在生成中"
        parts.push('正在生成中...')

        const statusMsg = parts.join('\n')
        generatingMsgIds = await session.send(statusMsg)
      }
    })

    // 如果没有触发 onPrepareComplete（如 prepare 阶段抛出异常），需要撤回可能的消息
    // 撤销"正在生成中"消息
    if (session && generatingMsgIds) {
      await deleteMessages(session, generatingMsgIds)
    }

    // 检查是否需要使用链接模式（返回匹配的标签名或 null）
    const linkModeTag = resolveLinkMode(config, channelTags, session?.bot?.platform)

    // 查询上次成功生成时间（无论本次成功失败都显示）
    let lastSuccessTime: Date | null = null
    if (config.showLastSuccessTime) {
      try {
        const channel = await mediaLuna.channels.getByName(options.channelName)
        if (channel) {
          const tasks = await mediaLuna.tasks.query({
            channelId: channel.id,
            status: 'success',
            limit: result.success ? 2 : 1  // 成功时取2条跳过当前，失败时取1条
          })
          // 成功时跳过当前任务（第一条），取上一条的时间
          // 失败时直接取第一条（最近一次成功）
          const targetTask = result.success ? tasks[1] : tasks[0]
          if (targetTask) {
            lastSuccessTime = targetTask.endTime || targetTask.startTime
          }
        }
      } catch (e) {
        logger.debug('Failed to get last success time: %s', e)
      }
    }

    return formatGenerationResult(result, {
      config,
      channelTags,
      platform: session?.bot?.platform,
      channelName: options.channelName,
      lastSuccessTime,
      linkModeTag
    })
  } catch (error) {
    // 撤销"正在生成中"消息
    if (session && generatingMsgIds) {
      await deleteMessages(session, generatingMsgIds)
    }

    logger.error('Generate failed: %s', error)
    return `生成失败: ${error instanceof Error ? error.message : '未知错误'}`
  }
}

/**
 * 格式化耗时
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = (seconds % 60).toFixed(0)
  return `${minutes}m ${remainingSeconds}s`
}

// 导出类型
export type { KoishiCommandsConfig } from './config'
