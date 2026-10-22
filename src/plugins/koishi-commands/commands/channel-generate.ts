import { h, type Session } from 'koishi'
import type { KoishiCommandsConfig } from '../config'
import { MessageExtractor, type CollectState } from '../services/message-extractor'
import {
  enterCollectMode,
  executeGenerateWithPresetCheck,
  resolveDirectTriggerImageCount
} from '../services/generation-flow'
import { hasTaskRefs, resetTaskRefRegex, resolveTaskRefsInPrompt } from '../services/task-reference'

/** 内置选项声明；渠道可用「命令选项覆盖」改字母、改类型或整条禁用 */
const BUILTIN_OPTION_SPECS: Record<string, Record<string, string>> = {
  novelai: {
    resolution: '-z <resolution:string> 尺寸：比例/像素（2:3 竖屏 大横屏 1088x1920）',
    steps: '-t <steps:number> 步数 (1-64)',
    scale: '-c <scale:number> CFG (1-30)',
    referenceStrength: '-w <referenceStrength:number> 参考强度 (0-1)',
    seed: '-d <seed:number> 固定种子（仅本次）',
    sampler: '-s <sampler:string> 采样器 1/ea 2/euler 3/2m 4/2msde 5/2sa 6/sde 7/ddim',
    cfgRescale: '-r <cfgRescale:number> CFG Rescale (0-1)',
    character: '-k <character:string> 角色提示词（可重复，短语用引号，可带 @A1）',
    // text 类型会吃掉行尾，因此必须放在提示词最后
    negativePrompt: '-n <negativePrompt:text> 负面词（吃掉行尾，放最后）'
  },
  comfyui: {
    resolution: '-r <resolution:string> 修改生成分辨率(如 1024x1280)',
    steps: '-s <steps:number> 修改生成步数',
    cfg: '-c <cfg:number> 修改CFG比例',
    denoise: '-d <denoise:number> 修改重绘幅度(图生图)',
    framerate: '--fps <framerate:number> 修改视频帧率',
    time: '-t <time:number> 修改视频时长(秒)',
    motion: '-m <motion:number> 修改运动幅度'
  }
}

/** 取用户覆盖：返回 undefined＝用内置；'' 表示禁用；其余为该选项的完整声明 */
function resolveOptionSpec(config: KoishiCommandsConfig, connectorId: string, key: string): string | undefined {
  const list = Array.isArray(config.optionAliases) ? config.optionAliases : []
  const hit = list.find(row => row && row.connector === connectorId && row.option === key)
  if (!hit) return undefined
  const flags = String(hit.flags ?? '').trim()
  if (!flags) return undefined
  return flags === '-' || flags.toLowerCase() === 'none' ? '' : flags
}

function registerConnectorOptions(
  channelCmd: any,
  existingOptions: Record<string, unknown>,
  connectorId: string,
  config: KoishiCommandsConfig
): void {
  const specs = BUILTIN_OPTION_SPECS[connectorId]
  if (!specs) return
  for (const [key, fallback] of Object.entries(specs)) {
    if (existingOptions[key]) continue
    const override = resolveOptionSpec(config, connectorId, key)
    const spec = override === undefined ? fallback : override
    if (!spec) continue
    channelCmd.option(key, spec)
  }
}

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
  // NovelAI 渠道启用未知选项检查：写错的 Flag 直接报错，而不是被 Koishi 静默吃掉
  const channelCmd = ctx.command(
    `${commandName} [...rest:string]`,
    `${channel.name} 生成`,
    channel.connectorId === 'novelai' ? { checkUnknown: true } : undefined
  ).alias(channel.name)

  const existingOptions = (channelCmd as any)._options || {}
  if (!existingOptions.image) {
    channelCmd.option('image', '-i <url:string> 输入图片URL')
  }
  if (!existingOptions.video) {
    channelCmd.option('video', '-v <url:string> 输入视频URL')
  }
  // Flag 必须声明成命令 option，否则 Koishi 解析器会把 -t/-c 等从提示词里吃掉
  registerConnectorOptions(channelCmd, existingOptions, channel.connectorId, config)

  channelCmd
    .usage(`用法: ${commandName} ［预设名或#预设名］［提示词］［参数］\n可用预设: ${presets.map((p: any) => p.name).join(', ') || '无'}${channel.connectorId === 'novelai' ? '\nNovelAI 参数见 nai help' : ''}`)
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
