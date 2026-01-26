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
import type { FileData, GenerationResult, OutputAsset } from '../../types'
import { h, type Session } from 'koishi'

/** 收集状态 */
interface CollectState {
  files: FileData[]
  processedUrls: Set<string>
  prompts: string[]
  presetName?: string
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
      const modelsCmd = ctx.command(`${PARENT_COMMAND}.models`, '查看可用模型')
        .alias('models')
        .action(async () => {
          const channels = await mediaLunaRef.channels.listEnabled()

          if (!channels || channels.length === 0) {
            return '没有可用的模型'
          }

          const lines: string[] = []
          lines.push('可用模型')
          lines.push('')

          for (const channel of channels) {
            let line = `  ${channel.name}`

            if (channel.tags && channel.tags.length > 0) {
              line += `  #${channel.tags.join(' #')}`
            }

            const cost = channel.pluginOverrides?.billing?.cost
            if (cost !== undefined && cost > 0) {
              const currencyLabel = channel.pluginOverrides?.billing?.currencyLabel || '积分'
              line += `  ${cost}${currencyLabel}/次`
            } else if (cost === 0) {
              line += '  免费'
            }

            lines.push(line)
          }

          lines.push('')
          lines.push(`共 ${channels.length} 个模型`)
          lines.push('用法: 模型名 [预设名] 提示词')

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

      // 创建提取器
      const extractor = new MessageExtractor(ctx, logger, state, config)

      // 从当前消息提取所有内容（图片、at、引用、文本）
      const messageText = await extractor.extractAll(session)

      // 使用从消息元素中提取的纯文本作为提示词
      // 注意：不使用 rest 参数，因为它可能包含未解析的 HTML 标签（如 <img>）
      // messageText 是通过 h.select(elements, 'text') 正确提取的纯文本内容
      //
      // 重要：session.elements 包含原始完整消息，包括命令名
      // 需要去除开头的命令名（channel.name），只保留命令后的内容
      if (messageText.trim()) {
        let promptText = messageText.trim()
        // 检查是否以命令名开头（不区分大小写）
        const cmdName = channel.name.toLowerCase()
        const promptLower = promptText.toLowerCase()
        if (promptLower.startsWith(cmdName)) {
          // 去除命令名和后面的空格
          promptText = promptText.substring(cmdName.length).trimStart()
        }
        if (promptText) {
          state.prompts.push(promptText)
        }
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

      // 判断是否直接触发
      if (state.files.length >= config.directTriggerImageCount) {
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
 * 消息内容提取器
 * 统一处理图片、at、引用消息等元素的提取
 */
class MessageExtractor {
  private ctx: any
  private logger: any
  private state: CollectState
  private config: KoishiCommandsConfig

  constructor(ctx: any, logger: any, state: CollectState, config: KoishiCommandsConfig) {
    this.ctx = ctx
    this.logger = logger
    this.state = state
    this.config = config
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
   * 用于第一次提取，因为文本中可能包含预设名需要单独处理
   */
  async extractMedia(session: Session | undefined): Promise<void> {
    if (!session?.elements) return

    // 调试：打印消息结构
    this.logger.debug('Message elements: %s', JSON.stringify(session.elements, null, 2))
    if (session.quote) {
      this.logger.debug('Quote message: %s', JSON.stringify(session.quote, null, 2))
    }

    // 提取图片
    await this.extractImages(session.elements)

    // 提取视频
    await this.extractVideos(session.elements, session)

    // 提取 at 用户头像
    await this.extractAtAvatars(session)

    // 提取引用消息中的图片（包括 session.quote）
    await this.extractFromQuote(session)

    this.logger.debug('Extracted files count: %d, urls: %s', this.state.files.length, [...this.state.processedUrls].join(', '))
  }

  /**
   * 从元素数组中提取图片（排除引用中的图片）
   */
  async extractImages(elements: any[]): Promise<void> {
    // 只提取顶层图片，排除 quote 内的图片（避免重复）
    for (const el of elements) {
      if (el.type === 'img' || el.type === 'image') {
        await this.fetchImage(el.attrs?.src || el.attrs?.url, 'input')
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
            await this.fetchImage(avatarUrl, `avatar_${userId}`)
            this.logger.debug('Extracted avatar for user %s', userId)
          }
        } catch (e) {
          this.logger.warn('Failed to get user info for %s: %s', userId, e)
        }
      }
    }
  }

  /**
   * 从引用消息中提取图片
   * 支持两种情况：
   * 1. session.elements 中的 quote 元素（内嵌引用）
   * 2. session.quote 属性（独立的被引用消息）
   */
  async extractFromQuote(session: Session): Promise<void> {
    // 1. 从 session.elements 中查找 quote 元素
    if (session.elements) {
      for (const el of session.elements) {
        if (el.type === 'quote' && el.children && el.children.length > 0) {
          // 递归调用 extractImages 和 extractVideos 处理引用内容
          await this.extractImages(el.children)
          await this.extractVideos(el.children, session)
        }
      }
    }

    // 2. 从 session.quote 中提取图片和视频（被引用消息的内容）
    const quote = session.quote as any
    if (quote?.elements) {
      this.logger.debug('Extracting from session.quote.elements')
      await this.extractImages(quote.elements)
      await this.extractVideos(quote.elements, session)
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
   * 获取图片并添加到 state
   */
  async fetchImage(url: string | undefined, prefix: string): Promise<boolean> {
    if (!url || this.state.processedUrls.has(url)) return false

    this.state.processedUrls.add(url)
    try {
      const response = await this.ctx.http.get(url, { responseType: 'arraybuffer' })
      const buffer = Buffer.from(response)
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      this.state.files.push({
        data: arrayBuffer,
        mime: 'image/png',
        filename: `${prefix}_${this.state.files.length}.png`
      })
      return true
    } catch (e) {
      this.logger.warn('Failed to fetch image from %s: %s', prefix, e)
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
      const response = await this.ctx.http.get(url, { responseType: 'arraybuffer' })
      const buffer = Buffer.from(response)
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

      // 简单检测 mime type (如果 header 没有则默认为 mp4)
      // 注意：Koishi http get 可能不直接返回 headers，这里简化处理，统一视为 video/mp4
      // 如果 url 有扩展名，尝试推断
      let mime = 'video/mp4'
      if (url.endsWith('.webm')) mime = 'video/webm'
      if (url.endsWith('.mov')) mime = 'video/quicktime'
      if (url.endsWith('.mkv')) mime = 'video/x-matroska'

      this.state.files.push({
        data: arrayBuffer,
        mime,
        filename: `${prefix}_${this.state.files.length}.${mime.split('/')[1] || 'mp4'}`
      })
      return true
    } catch (e) {
      this.logger.warn('Failed to fetch video from %s: %s', prefix, e)
      return false
    }
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
      const extractedText = await extractor.extractAll(sess)
      
      // 添加到提示词
      extractor.addPrompt(extractedText)

      const { files, prompts } = state
      
      // 重新计算各类数量
      const imgCount = files.filter(f => f.mime.startsWith('image/')).length
      const videoCount = files.filter(f => f.mime.startsWith('video/')).length
      const promptCount = prompts.length
      
      // 检查是否有主要变化
      const hasNewFiles = files.length > prevFileCount
      // extractedText 是本次提取的文本，如果非空则说明有新提示词
      const hasNewText = !!extractedText

      // 反馈给用户已收集的数量
      if (hasNewFiles || hasNewText) {
        logger.debug(`Collected update: ${imgCount} imgs, ${videoCount} videos, ${promptCount} prompts`)
        await sess.send(`已收集: ${imgCount} 张图片, ${videoCount} 个视频, ${promptCount} 条提示词`)
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
    const linkModeTag = checkLinkMode(config, channelTags)

    return formatResult(result, linkModeTag, config)
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
 * 检查是否应该使用链接模式
 * 返回匹配的标签（用于显示原因），如果不匹配则返回 null
 */
function checkLinkMode(config: KoishiCommandsConfig, channelTags: string[]): string | null {
  if (!config.linkModeEnabled) return null
  if (!config.linkModeTags || typeof config.linkModeTags !== 'string' || !channelTags.length) return null

  // 解析配置的标签（逗号分隔）
  const linkTags = config.linkModeTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  if (linkTags.length === 0) return null

  // 检查渠道标签是否包含任意一个链接模式标签
  const channelTagsLower = channelTags.map(t => t.toLowerCase())
  for (const tag of linkTags) {
    if (channelTagsLower.includes(tag)) {
      // 返回原始大小写的标签
      const originalIndex = channelTagsLower.indexOf(tag)
      return channelTags[originalIndex]
    }
  }
  return null
}

/**
 * 格式化生成结果
 * 根据输出类型使用不同的展示方式：
 * - 图片/文本：常规格式，带任务ID和计费信息
 * - 视频：使用合并转发消息
 * - 纯音频：只发送音频元素，不带任务ID和计费信息
 * - 链接模式：使用合并转发消息，输出链接而不是直接发图
 */
function formatResult(result: GenerationResult, linkModeTag: string | null = null, config?: KoishiCommandsConfig): string {
  const outputTextContent = config?.outputTextContent ?? false
  // 失败情况：始终显示任务ID和错误信息
  if (!result.success) {
    const messages: string[] = []
    if (result.taskId) {
      messages.push(`「${result.taskId}」`)
    }
    messages.push(`生成失败: ${result.error || '未知错误'}`)
    appendFooterInfo(messages, result)
    return messages.join('\n')
  }

  // 无输出情况
  if (!result.output || result.output.length === 0) {
    const messages: string[] = []
    if (result.taskId) {
      messages.push(`「${result.taskId}」`)
    }
    messages.push(`生成完成，但没有输出`)
    appendFooterInfo(messages, result)
    return messages.join('\n')
  }

  // 分析输出类型
  const hasVideo = result.output.some(a => a.kind === 'video' && a.url)
  const hasAudio = result.output.some(a => a.kind === 'audio' && a.url)
  const hasImage = result.output.some(a => a.kind === 'image' && a.url)
  const hasText = outputTextContent && result.output.some(a => a.kind === 'text' && a.content)

  // 纯音频输出：只发送音频元素，不带任何附加信息
  if (hasAudio && !hasVideo && !hasImage && !hasText) {
    const audioElements: string[] = []
    for (const asset of result.output) {
      if (asset.kind === 'audio' && asset.url) {
        audioElements.push(`<audio url="${asset.url}"/>`)
      }
    }
    return audioElements.join('\n')
  }

  // 包含视频：使用合并转发消息
  if (hasVideo) {
    return formatVideoResult(result, linkModeTag, outputTextContent)
  }

  // 链接模式：使用合并转发消息，每个链接单独一条方便复制
  if (linkModeTag) {
    return formatLinkModeResult(result, linkModeTag, outputTextContent)
  }

  // 常规输出：图片/文本，带任务ID和计费信息
  return formatStandardResult(result, outputTextContent)
}

/**
 * 格式化视频输出（使用合并转发消息）
 */
function formatVideoResult(result: GenerationResult, linkModeTag: string | null = null, outputTextContent: boolean = false): string {
  const forwardMessages: string[] = []

  // 第一条消息：任务信息
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

  // 链接模式说明
  if (linkModeTag) {
    forwardMessages.push(`<message>📎 因渠道标签 [${linkModeTag}] 启用链接模式</message>`)
  }

  // 输出内容
  for (const asset of result.output!) {
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

/**
 * 格式化链接模式输出（使用合并转发消息，每个链接单独一条方便复制）
 */
function formatLinkModeResult(result: GenerationResult, linkModeTag: string, outputTextContent: boolean = false): string {
  const forwardMessages: string[] = []

  // 第一条消息：任务信息
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

  // 链接模式说明
  forwardMessages.push(`<message>📎 因渠道标签 [${linkModeTag}] 启用链接模式</message>`)

  // 输出内容：每个链接单独一条消息
  for (const asset of result.output!) {
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

/**
 * 格式化标准输出（图片/文本）
 */
function formatStandardResult(result: GenerationResult, outputTextContent: boolean = false): string {
  const messages: string[] = []

  // 任务 ID 放在最开始
  if (result.taskId) {
    messages.push(`「${result.taskId}」`)
  }

  // 构建输出消息
  for (const asset of result.output!) {
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

  // 底部信息
  appendFooterInfo(messages, result)

  return messages.join('\n')
}

/**
 * 添加底部信息（耗时、计费等）
 */
function appendFooterInfo(messages: string[], result: GenerationResult): void {
  const footerParts: string[] = []

  // 耗时
  if (result.duration) {
    footerParts.push(`耗时 ${formatDuration(result.duration)}`)
  }

  // 计费信息（来自中间件）
  if (result.hints?.after && result.hints.after.length > 0) {
    footerParts.push(...result.hints.after)
  }

  if (footerParts.length > 0) {
    messages.push(footerParts.join(' | '))
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
