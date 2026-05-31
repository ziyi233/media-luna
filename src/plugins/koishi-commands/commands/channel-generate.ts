import { h, type Session } from 'koishi'
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
  if (channel.connectorId === 'comfyui') {
    if (!existingOptions.resolution) {
      channelCmd.option('resolution', '-r <resolution:string> 修改生成分辨率(如 1024x1280)')
    }
    if (!existingOptions.steps) {
      channelCmd.option('steps', '-s <steps:number> 修改生成步数')
    }
    if (!existingOptions.cfg) {
      channelCmd.option('cfg', '-c <cfg:number> 修改CFG比例')
    }
    if (!existingOptions.denoise) {
      channelCmd.option('denoise', '-d <denoise:number> 修改重绘幅度(图生图)')
    }
    if (!existingOptions.framerate) {
      channelCmd.option('framerate', '--fps <framerate:number> 修改视频帧率')
    }
    if (!existingOptions.time) {
      channelCmd.option('time', '-t <time:number> 修改视频时长(秒)')
    }
    if (!existingOptions.motion) {
      channelCmd.option('motion', '-m <motion:number> 修改运动幅度')
    }
  }

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
