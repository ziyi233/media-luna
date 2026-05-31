import type { Session } from 'koishi'
import type { FileData, GenerationResult } from '../../../types'
import type { KoishiCommandsConfig } from '../config'
import { formatGenerationResult, resolveLinkMode } from '../formatters/delivery'
import { MessageExtractor, type CollectState } from './message-extractor'

export interface GenerateRequestOptions {
  channelName: string
  presetName?: string
  prompt: string
  files: FileData[]
  parameters?: Record<string, any>
  summaryMsg?: string
}

export function resolveDirectTriggerImageCount(channelTags: string[], fallback: number): number {
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

export async function deleteMessages(session: Session, msgIds: string[]): Promise<void> {
  if (!msgIds || msgIds.length === 0) return

  for (const msgId of msgIds) {
    try {
      await session.bot?.deleteMessage(session.channelId!, msgId)
    } catch {
      // 忽略删除失败（可能没有权限或消息已删除）
    }
  }
}

export async function executeGenerate(
  ctx: any,
  session: Session | undefined,
  mediaLuna: any,
  options: GenerateRequestOptions,
  config: KoishiCommandsConfig,
  channelTags: string[] = []
): Promise<string> {
  const logger = ctx.logger('media-luna/commands')
  const uid = (session as any)?.user?.id
  let generatingMsgIds: string[] | undefined

  try {
    const result: GenerationResult = await mediaLuna.generateByName({
      channelName: options.channelName,
      presetName: options.presetName,
      prompt: options.prompt,
      files: options.files,
      parameters: options.parameters,
      session,
      uid,
      onPrepareComplete: async (beforeHints: string[]) => {
        if (!session) return

        const parts: string[] = []
        if (beforeHints.length > 0) {
          parts.push(beforeHints.join('\n'))
        }
        if (options.summaryMsg) {
          parts.push(options.summaryMsg)
        }
        parts.push('正在生成中...')

        generatingMsgIds = await session.send(parts.join('\n'))
      }
    })

    if (session && generatingMsgIds) {
      await deleteMessages(session, generatingMsgIds)
    }

    const linkModeTag = resolveLinkMode(config, channelTags, session?.bot?.platform)

    let lastSuccessTime: Date | null = null
    if (config.showLastSuccessTime) {
      try {
        const channel = await mediaLuna.channels.getByName(options.channelName)
        if (channel) {
          const tasks = await mediaLuna.tasks.query({
            channelId: channel.id,
            status: 'success',
            limit: result.success ? 2 : 1
          })
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
    if (session && generatingMsgIds) {
      await deleteMessages(session, generatingMsgIds)
    }

    logger.error('Generate failed: %s', error)
    return `生成失败: ${error instanceof Error ? error.message : '未知错误'}`
  }
}

export async function executeGenerateWithPresetCheck(
  ctx: any,
  session: Session | undefined,
  channel: any,
  state: CollectState,
  mediaLuna: any,
  config: KoishiCommandsConfig,
  options?: any
): Promise<string> {
  const combinations = await mediaLuna.getChannelPresetCombinations()
  const channelCombo = combinations.find((c: any) => c.channel.id === channel.id)
  const presets: any[] = channelCombo?.presets || []

  const presetNamesLower = new Set(presets.map((p: any) => p.name.toLowerCase()))
  const presetNameMap = new Map(presets.map((p: any) => [p.name.toLowerCase(), p.name]))

  const fullPrompt = state.prompts.join(' ').trim()
  const words = fullPrompt.split(/\s+/)

  let presetName: string | undefined
  let actualPrompt = fullPrompt

  if (words.length > 0 && words[0]) {
    const firstWord = words[0].toLowerCase()
    if (presetNamesLower.has(firstWord)) {
      presetName = presetNameMap.get(firstWord)
      actualPrompt = words.slice(1).join(' ')
    }
  }

  const summaryParts: string[] = []
  summaryParts.push(presetName ? `预设: ${presetName}` : '无预设')
  summaryParts.push(`提示词: ${actualPrompt.length} 字`)
  summaryParts.push(`图片: ${state.files.length} 张`)

  const cleanOptions = { ...options }
  delete cleanOptions.image
  delete cleanOptions.video

  return executeGenerate(ctx, session, mediaLuna, {
    channelName: channel.name,
    presetName,
    prompt: actualPrompt,
    files: state.files,
    parameters: cleanOptions,
    summaryMsg: `开始生成 | ${summaryParts.join(' | ')}`
  }, config, channel.tags || [])
}

export async function enterCollectMode(
  ctx: any,
  session: Session | undefined,
  channel: any,
  state: CollectState,
  config: KoishiCommandsConfig,
  mediaLuna: any,
  logger: any,
  options?: any
): Promise<string> {
  if (!session) {
    return '会话不可用'
  }

  const imgCount = state.files.filter(f => f.mime.startsWith('image/')).length
  const videoCount = state.files.filter(f => f.mime.startsWith('video/')).length

  const hintMsgIds = await session.send(
    `已进入收集模式，请继续发送图片/视频/@用户/文字\n发送「开始」触发生成，发送「取消」退出\n当前已收集: ${imgCount} 张图片, ${videoCount} 个视频`
  )

  const timeoutMs = config.collectTimeout * 1000
  const extractor = new MessageExtractor(ctx, logger, state, config)

  return new Promise<string>((resolve) => {
    let disposed = false
    const processedMessageIds = new Set<string>()

    const timeoutHandle = setTimeout(async () => {
      if (disposed) return
      disposed = true
      disposeMiddleware()
      await deleteMessages(session, hintMsgIds)
      resolve('收集超时，已取消')
    }, timeoutMs)

    const disposeMiddleware = ctx.middleware(async (sess: Session, next: () => Promise<void>) => {
      if (disposed) return next()
      if (sess.userId !== session.userId) return next()
      if (sess.channelId !== session.channelId) return next()
      if (sess.selfId !== session.selfId) return next()

      logger.info('Collection middleware received: %s', JSON.stringify({
        content: sess.content,
        elements: sess.elements,
        messageId: sess.messageId
      }, null, 2))

      const messageId = sess.messageId
      if (messageId && processedMessageIds.has(messageId)) {
        logger.debug('Skipping already processed message: %s', messageId)
        return
      }
      if (messageId) {
        processedMessageIds.add(messageId)
      }

      const textContent = extractor.extractText(sess.elements || []).toLowerCase()

      if (textContent === '开始' || textContent === 'go' || textContent === 'start') {
        if (disposed) return
        disposed = true
        clearTimeout(timeoutHandle)
        disposeMiddleware()
        await deleteMessages(session, hintMsgIds)

        if (state.files.length === 0 && state.prompts.length === 0) {
          resolve('没有可生成的内容')
          return
        }

        const result = await executeGenerateWithPresetCheck(
          ctx, session, channel, state, mediaLuna, config, options
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

      const prevFileCount = state.files.length
      extractor.resetResult()
      const text = await extractor.extractAll(sess)
      extractor.addPrompt(text)

      const { files, prompts } = state
      const nextImgCount = files.filter(f => f.mime.startsWith('image/')).length
      const nextVideoCount = files.filter(f => f.mime.startsWith('video/')).length
      const promptCount = prompts.length

      const hasNewFiles = files.length > prevFileCount
      const hasNewText = !!text

      if (hasNewFiles || hasNewText) {
        logger.debug(`Collected update: ${nextImgCount} imgs, ${nextVideoCount} videos, ${promptCount} prompts`)
        await sess.send(`已收集: ${nextImgCount} 张图片, ${nextVideoCount} 个视频, ${promptCount} 条提示词`)
      }

      const result = extractor.getResult()
      if (result.failed > 0) {
        sess.send(`⚠️ ${result.failed}张图片收集失败，当前共${state.files.length}张`).catch(() => {})
      }
    }, true)
  })
}
