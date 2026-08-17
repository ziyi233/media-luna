import { h, type Session } from 'koishi'
import type {
  ConnectorCommandOption,
  ConnectorDefinition,
  StandardGenerationParameter
} from '../../../core'
import type { KoishiCommandsConfig } from '../config'
import { MessageExtractor, type CollectState } from '../services/message-extractor'
import {
  enterCollectMode,
  executeGenerateWithPresetCheck,
  resolveDirectTriggerImageCount
} from '../services/generation-flow'
import { hasTaskRefs, resetTaskRefRegex, resolveTaskRefsInPrompt } from '../services/task-reference'

interface RegisterChannelCommandOptions {
  ctx: any
  mediaLuna: any
  channel: any
  presets: any[]
  config: KoishiCommandsConfig
  logger: any
  parentCommand: string
}

interface StandardCommandOption extends ConnectorCommandOption {
  name: StandardGenerationParameter
}

const STANDARD_COMMAND_OPTIONS: Record<StandardGenerationParameter, StandardCommandOption> = {
  mode: { name: 'mode', declaration: '--mode <mode:string>', description: '生成模式' },
  duration: { name: 'duration', declaration: '-t, --duration, --time <duration:number>', description: '视频时长（秒）' },
  resolution: { name: 'resolution', declaration: '-r, --resolution <resolution:string>', description: '输出分辨率' },
  aspectRatio: { name: 'aspectRatio', declaration: '-a, --aspect-ratio <aspectRatio:string>', description: '输出宽高比' },
  fps: { name: 'fps', declaration: '-f, --fps <fps:number>', description: '视频帧率' },
  seed: { name: 'seed', declaration: '--seed <seed:number>', description: '随机种子' },
  steps: { name: 'steps', declaration: '-s, --steps <steps:number>', description: '推理步数' },
  cfg: { name: 'cfg', declaration: '-c, --cfg <cfg:number>', description: 'CFG 比例' },
  denoise: { name: 'denoise', declaration: '-d, --denoise <denoise:number>', description: '重绘幅度' },
  motion: { name: 'motion', declaration: '-m, --motion <motion:number>', description: '运动幅度' },
  quality: { name: 'quality', declaration: '-q, --quality <quality:string>', description: '生成质量' },
  count: { name: 'count', declaration: '-n, --count <count:number>', description: '生成数量' },
  negativePrompt: { name: 'negativePrompt', declaration: '--negative-prompt <negativePrompt:string>', description: '负面提示词' }
}

export function registerConnectorOptions(command: any, connector: ConnectorDefinition | undefined, logger: any): void {
  if (!connector) return

  const registered = new Set<string>(Object.keys((command as any)._options || {}))
  const registeredAliases = new Set<string>(Object.keys((command as any)._namedOptions || {}))
  const getAliases = (declaration: string) => Array.from(
    declaration.matchAll(/(?:^|[\s,])--?([\w-]+)/g),
    match => match[1]
  )
  const addOption = (option: ConnectorCommandOption) => {
    if (!option.name || registered.has(option.name)) return
    const aliases = getAliases(option.declaration)
    const conflict = aliases.find(alias => registeredAliases.has(alias))
    if (conflict) {
      logger.warn(`Connector ${connector.id}: command option ${option.name} conflicts with alias --${conflict}`)
      return
    }
    command.option(option.name, `${option.declaration} ${option.description}`)
    registered.add(option.name)
    for (const alias of aliases) registeredAliases.add(alias)
  }

  for (const key of connector.commandParameters || []) {
    const option = STANDARD_COMMAND_OPTIONS[key]
    if (option) addOption(option)
  }

  for (const option of connector.commandOptions || []) {
    if (STANDARD_COMMAND_OPTIONS[option.name as StandardGenerationParameter]) {
      logger.warn(`Connector ${connector.id}: custom command option conflicts with standard parameter ${option.name}`)
      continue
    }
    addOption(option)
  }

}

export function registerChannelCommand(options: RegisterChannelCommandOptions): () => void {
  const { ctx, mediaLuna, channel, presets, config, logger, parentCommand } = options

  const channelTags: string[] = channel.tags || []
  const needsImageInput = channelTags.some((tag: string) => tag.startsWith('img2'))
  const needsVideoInput = channelTags.some((tag: string) => tag.startsWith('video2'))
  const needsMediaInput = needsImageInput || needsVideoInput

  const commandName = `${parentCommand}.${channel.name}`
  const channelCmd = ctx.command(`${commandName} [...rest:string]`, `${channel.name} 生成`)
    .alias(channel.name)

  const existingOptions = (channelCmd as any)._options || {}
  if (!existingOptions.image) {
    channelCmd.option('image', '-i <url:string> 输入图片URL')
  }
  if (!existingOptions.video) {
    channelCmd.option('video', '-v <url:string> 输入视频URL')
  }
  registerConnectorOptions(channelCmd, mediaLuna.connectors.get(channel.connectorId), logger)

  channelCmd
    .usage(`用法: ${commandName} [预设名] <提示词>\n可用预设: ${presets.map((p: any) => p.name).join(', ') || '无'}`)
    .action(async ({ session, options: commandOptions }: { session: Session; options: any }, ...rest: string[]) => {
      const state: CollectState = {
        files: [],
        processedUrls: new Set(),
        prompts: [],
        presetName: undefined
      }

      const extractor = new MessageExtractor(ctx, logger, state, config, [commandName, channel.name])
      await extractor.extractMedia(session)

      const rawPrompt = rest.join(' ')
      const parsedElements = h.parse(rawPrompt)
      const promptText = extractor.extractText(parsedElements)
      if (promptText) {
        state.prompts.push(promptText)
      }

      if (state.prompts.length > 0) {
        const mergedPrompt = state.prompts.join(' ').trim()
        if (hasTaskRefs(mergedPrompt)) {
          resetTaskRefRegex()
          const resolved = await resolveTaskRefsInPrompt(ctx, mediaLuna, session, mergedPrompt, state.files, logger)
          state.prompts = resolved.prompt ? [resolved.prompt] : []
          if (resolved.injectedCount > 0) {
            const taskHint = resolved.injectedTasks
              .map(item => item.index ? `#${item.taskId}(${item.index}) x${item.count}` : `#${item.taskId} x${item.count}`)
              .join(', ')
            await session?.send(`已注入任务参考图 ${resolved.injectedCount} 张（${taskHint}）`)
          }
        }

      }

      if (commandOptions?.image) {
        await extractor.fetchImage(commandOptions.image, 'input')
      }
      if (commandOptions?.video) {
        await extractor.fetchVideo(commandOptions.video, 'input')
      }

      if (!needsMediaInput) {
        if (state.prompts.length === 0 && state.files.length === 0) {
          return '请输入提示词'
        }
        return executeGenerateWithPresetCheck(ctx, session, channel, state, mediaLuna, config, commandOptions)
      }

      const directTriggerCount = resolveDirectTriggerImageCount(channelTags, config.directTriggerImageCount)
      if (state.files.length >= directTriggerCount) {
        const extractResult = extractor.getResult()
        if (extractResult.failed > 0) {
          return [
            `检测到素材收集失败（成功 ${state.files.length} / 失败 ${extractResult.failed}），已取消本次生成。`,
            '请重新发送命令和图片再试。'
          ].join('\n')
        }
        return executeGenerateWithPresetCheck(ctx, session, channel, state, mediaLuna, config, commandOptions)
      }

      return enterCollectMode(ctx, session, channel, state, config, mediaLuna, logger, commandOptions)
    })

  logger.debug(`Registered command: ${channel.name} (needsMediaInput: ${needsMediaInput}, ${presets.length} presets)`)
  return () => channelCmd.dispose()
}
