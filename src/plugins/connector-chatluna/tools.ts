// ChatLuna 工具注册
// 支持：动态参数、内置值、同步/异步返回模式

import { Context, Session } from 'koishi'
import { StructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import type { ToolConfig, PresetToolConfig } from './config'
import { formatGenerationResult } from '../koishi-commands/shared/delivery'

// 存储注册的工具 dispose 函数
const toolDisposers: (() => void)[] = []
const DEFAULT_QUERY_TOOL_NAME = 'medialuna_query_tasks'

interface QueryToolRuntimeConfig {
  name: string
  defaultWaitMs: number
  maxWaitMs: number
  pollIntervalMs: number
}

let queryToolRuntimeConfig: QueryToolRuntimeConfig = {
  name: DEFAULT_QUERY_TOOL_NAME,
  defaultWaitMs: 300000,
  maxWaitMs: 300000,
  pollIntervalMs: 400
}

function getQueryToolName() {
  return queryToolRuntimeConfig.name || DEFAULT_QUERY_TOOL_NAME
}

/**
 * 注册 Media Luna 工具到 ChatLuna
 */
export function registerChatLunaTools(
  ctx: Context,
  tools: ToolConfig[],
  presetToolConfig: PresetToolConfig,
  logger: any
) {
  const chatluna = (ctx as any).chatluna

  if (!chatluna) {
    logger.warn('ChatLuna service not available, skipping tool registration')
    return
  }

  // 清理之前注册的工具
  unregisterChatLunaTools()

  const pluginConfig = (ctx as any).mediaLuna?.configService?.get?.('plugin:connector-chatluna', {}) as any
  const queryConfig = pluginConfig?.taskQueryTool || {}
  queryToolRuntimeConfig = {
    name: queryConfig.name || DEFAULT_QUERY_TOOL_NAME,
    defaultWaitMs: typeof queryConfig.defaultWaitMs === 'number' ? queryConfig.defaultWaitMs : 300000,
    maxWaitMs: typeof queryConfig.maxWaitMs === 'number' ? queryConfig.maxWaitMs : 300000,
    pollIntervalMs: typeof queryConfig.pollIntervalMs === 'number' ? queryConfig.pollIntervalMs : 400
  }

  const enabledTools = tools.filter(t => t.enabled)

  for (const toolConfig of enabledTools) {
    const dispose = chatluna.platform.registerTool(toolConfig.name, {
      createTool() {
        return new MediaLunaGenerateTool(ctx, toolConfig, logger)
      },
      selector(_history: any) {
        return true
      }
    })
    toolDisposers.push(dispose)
    logger.info(`Registered ChatLuna tool: ${toolConfig.name}`)
  }

  const queryEnabled = queryConfig.enabled !== false
  if (queryEnabled) {
    const queryToolName = getQueryToolName()
    const queryDispose = chatluna.platform.registerTool(queryToolName, {
      createTool() {
        return new MediaLunaTaskQueryTool(ctx, logger)
      },
      selector(_history: any) {
        return true
      }
    })
    toolDisposers.push(queryDispose)
    logger.info(`Registered ChatLuna tool: ${queryToolName}`)
  }

  // 注册预设查看工具（如果启用）
  if (presetToolConfig.enabled) {
    const presetDispose = chatluna.platform.registerTool(presetToolConfig.name, {
      createTool() {
        return new MediaLunaPresetTool(ctx, presetToolConfig, logger)
      },
      selector(_history: any) {
        return true
      }
    })
    toolDisposers.push(presetDispose)
    logger.info(`Registered ChatLuna tool: ${presetToolConfig.name}`)
  }
}

/**
 * 注销所有已注册的工具
 */
export function unregisterChatLunaTools() {
  for (const dispose of toolDisposers) {
    try {
      dispose()
    } catch (e) {
      // ignore
    }
  }
  toolDisposers.length = 0
}

/**
 * 动态构建 schema（根据内置值决定暴露哪些参数）
 */
function buildSchema(toolConfig: ToolConfig) {
  const schemaFields: Record<string, z.ZodTypeAny> = {}

  // 渠道参数（如果没有内置值，则暴露给 AI）
  if (!toolConfig.builtinChannel) {
    schemaFields.channel = z.string().describe(
      'The Media Luna channel name to use for generation.'
    )
  }

  // 预设参数（如果没有内置值，则暴露给 AI）
  if (!toolConfig.builtinPreset) {
    schemaFields.preset = z.string().optional().describe(
      'Optional preset name to apply. Use list_presets tool to see available presets.'
    )
  }

  // 提示词（始终必须）
  schemaFields.prompt = z.string().describe(
    'The image generation prompt describing what to create'
  )

  // 参考图片 URLs（可选）
  schemaFields.urls = z.array(z.string()).optional().describe(
    'Optional array of image URLs to use as reference for generation'
  )

  return z.object(schemaFields)
}

/**
 * 生成工具描述（包含内置值信息和可用渠道/预设列表）
 */
function buildDescription(toolConfig: ToolConfig): string {
  let desc = toolConfig.description

  if (toolConfig.builtinChannel) {
    desc += ` [Uses channel: ${toolConfig.builtinChannel}]`
  } else {
    // 添加渠道变量占位符，稍后替换
    desc += ` Available channels: {channels}.`
  }

  if (toolConfig.builtinPreset) {
    desc += ` [Uses preset: ${toolConfig.builtinPreset}]`
  }

  const queryToolName = getQueryToolName()
  if (toolConfig.returnMode === 'sync') {
    desc += ` [Task mode: returns task IDs immediately. MUST call ${queryToolName} to wait and get final status/URLs. ${queryToolName} waits up to 5 minutes by default.]`
  } else {
    desc += ' [Async notify mode: result will be sent to user automatically after completion.]'
  }

  return desc
}

/**
 * 替换描述中的 {presets} 和 {channels} 变量
 */
async function replaceDescriptionVariables(ctx: Context, description: string): Promise<string> {
  let result = description

  // 替换 {channels}
  if (result.includes('{channels}')) {
    try {
      const mediaLuna = (ctx as any).mediaLuna
      if (mediaLuna?.channelService) {
        const channels = await mediaLuna.channelService.list()
        const enabledChannels = channels
          .filter((c: any) => c.enabled)
          .map((c: any) => c.name)
        result = result.replace('{channels}', enabledChannels.join(', ') || 'none')
      } else {
        result = result.replace('{channels}', 'none')
      }
    } catch {
      result = result.replace('{channels}', 'none')
    }
  }

  // 替换 {presets}
  if (result.includes('{presets}')) {
    try {
      const mediaLuna = (ctx as any).mediaLuna
      if (mediaLuna?.presets) {
        const presets = await mediaLuna.presets.list({ enabledOnly: true })
        const presetNames = presets.map((p: any) => p.name).join(', ')
        result = result.replace('{presets}', presetNames || 'none')
      } else {
        result = result.replace('{presets}', 'none')
      }
    } catch {
      result = result.replace('{presets}', 'none')
    }
  }

  return result
}

/**
 * Media Luna 图片生成工具
 */
class MediaLunaGenerateTool extends StructuredTool {
  name: string
  description: string
  schema: any
  private descriptionTemplate: string

  constructor(
    private ctx: Context,
    private toolConfig: ToolConfig,
    private logger: any
  ) {
    super()
    this.name = toolConfig.name
    this.descriptionTemplate = buildDescription(toolConfig)
    // 初始描述
    this.description = this.descriptionTemplate.replace('{presets}', '(loading...)')
    this.schema = buildSchema(toolConfig)

    // 异步更新描述
    this.updateDescription()
  }

  private async updateDescription() {
    this.description = await replaceDescriptionVariables(this.ctx, this.descriptionTemplate)
  }

  async _call(
    input: { channel?: string; preset?: string; prompt: string; urls?: string[] },
    _runManager?: CallbackManagerForToolRun,
    config?: any
  ): Promise<string> {
    const session: Session | undefined = config?.configurable?.session

    try {
      const mediaLuna = (this.ctx as any).mediaLuna
      if (!mediaLuna) {
        return 'Error: MediaLuna service not available'
      }

      // 确定渠道名
      const channelName = this.toolConfig.builtinChannel || input.channel
      if (!channelName) {
        return 'Error: No channel specified'
      }

      // 确定预设名
      const presetName = this.toolConfig.builtinPreset || input.preset

      this.logger.info(`[MediaLunaTool] Channel: ${channelName}, Preset: ${presetName || 'none'}`)
      this.logger.info(`[MediaLunaTool] Prompt: ${input.prompt}`)
      this.logger.info(`[MediaLunaTool] URLs: ${input.urls?.length || 0}`)

      // 下载参考图片
      const files: any[] = []
      if (input.urls && input.urls.length > 0) {
        for (const url of input.urls) {
          try {
            const response = await this.ctx.http.get(url, { responseType: 'arraybuffer' })
            const mime = 'image/png' // 简化处理
            files.push({
              data: response,
              mime,
              filename: `ref_${files.length}.png`
            })
          } catch (e) {
            this.logger.warn(`[MediaLunaTool] Failed to download image: ${url}`)
          }
        }
      }

      // 根据返回模式决定执行方式
      // async: 等待 prepare 阶段完成后返回，后台继续生成
      // sync: 等待生成完全完成后返回
      if (this.toolConfig.returnMode === 'async') {
        return await this.generateAsync(
          mediaLuna, channelName, presetName, input.prompt, files, session
        )
      }

      // sync: 等待生成完成
      return await this.generateSync(mediaLuna, channelName, presetName, input.prompt, files, session)

    } catch (e) {
      this.logger.error(`[MediaLunaTool] Error:`, e)
      return `Error generating image: ${e instanceof Error ? e.message : 'Unknown error'}`
    }
  }

  /**
   * 同步生成：等待完成后返回
   * 直接返回图片 URL，不通过 session.send 发送，由 AI 决定如何展示
   */
  private async generateSync(
    mediaLuna: any,
    channelName: string,
    presetName: string | undefined,
    prompt: string,
    files: any[],
    session: Session | undefined
  ): Promise<string> {
    const channel = await mediaLuna.channels?.getByName?.(channelName)
    const submitAt = new Date()

    let resolvePrepare: (info: { hints: string[] }) => void
    const preparePromise = new Promise<{ hints: string[] }>((resolve) => {
      resolvePrepare = resolve
    })

    let prepareCallbackCalled = false

    const generationPromise = mediaLuna.generateByName({
      channelName,
      prompt,
      files,
      presetName,
      session,
      uid: (session?.user as any)?.id,
      onPrepareComplete: async (beforeHints: string[]) => {
        prepareCallbackCalled = true
        resolvePrepare!({ hints: beforeHints })
      }
    })

    generationPromise.catch((e: any) => {
      this.logger.error('[MediaLunaTool] generateSync background error:', e)
    })

    const generationRacePromise = generationPromise.then((result: any) => {
      if (prepareCallbackCalled) return null
      if (!result.success) {
        return { type: 'failed' as const, error: result.error || '生成失败' }
      }
      return { type: 'success' as const, result }
    })

    const timeoutPromise = new Promise<{ type: 'timeout' }>((resolve) => {
      setTimeout(() => resolve({ type: 'timeout' }), 10000)
    })

    const prepareRacePromise = preparePromise.then((info) => ({
      type: 'prepared' as const,
      hints: info.hints
    }))

    const raceResult = await Promise.race([
      prepareRacePromise,
      generationRacePromise,
      timeoutPromise
    ])

    if (raceResult !== null && raceResult.type === 'failed') {
      return `[TASK FAILED] ${raceResult.error}`
    }
    if (raceResult !== null && raceResult.type === 'timeout') {
      return '[TASK FAILED] 准备阶段超时'
    }
    if (raceResult !== null && raceResult.type === 'success') {
      const result = raceResult.result
      if (!result?.taskId) {
        return '[TASK SUBMITTED] 任务已完成，但未返回 taskId'
      }
      return JSON.stringify({
        ok: true,
        mode: 'manual',
        tasks: [{ index: 1, taskId: result.taskId }],
        message: `Task finished quickly. Query with ${getQueryToolName()} if needed.`
      })
    }

    const taskId = await this.resolveTaskId(mediaLuna, {
      uid: (session?.user as any)?.id,
      channelId: channel?.id,
      prompt,
      submitAt
    })

    const hints = (raceResult as any)?.hints as string[] | undefined

    return JSON.stringify({
      ok: true,
      mode: 'manual',
      tasks: taskId ? [{ index: 1, taskId }] : [],
      info: hints || [],
      message: taskId
        ? `Task submitted. MUST call ${getQueryToolName()} with this taskId to wait for final result URLs (default wait: 5 minutes).`
        : `Task submitted but taskId not resolved yet. Retry ${getQueryToolName()} after a short delay.`
    })
  }

  private async resolveTaskId(
    mediaLuna: any,
    options: { uid?: number; channelId?: number; prompt: string; submitAt: Date }
  ): Promise<number | null> {
    const taskService = mediaLuna?.tasks
    if (!taskService) return null

    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const tasks = await taskService.query({ uid: options.uid, channelId: options.channelId, limit: 20 })
      const matched = tasks.find((task: any) => {
        const startTime = task.startTime ? new Date(task.startTime).getTime() : 0
        const reqPrompt = task.requestSnapshot?.prompt
        return startTime >= options.submitAt.getTime() - 2000 && reqPrompt === options.prompt
      })

      if (matched?.id) return matched.id

      await new Promise(resolve => setTimeout(resolve, 250))
    }

    return null
  }

  /**
   * 异步模式：等待 prepare 阶段完成后返回，后台继续生成
   * 生成完成后通过 session.send 发送结果
   */
  private async generateAsync(
    mediaLuna: any,
    channelName: string,
    presetName: string | undefined,
    prompt: string,
    files: any[],
    session: Session | undefined
  ): Promise<string> {
    const channel = await mediaLuna.channels?.getByName?.(channelName)
    const submitAt = new Date()

    // 用于在 prepare 完成时 resolve 的 Promise
    let resolvePrepare: (info: { hints: string[] }) => void
    const preparePromise = new Promise<{ hints: string[] }>((resolve) => {
      resolvePrepare = resolve
    })

    // 标记 prepare 回调是否已被调用
    let prepareCallbackCalled = false

    // 启动生成（后台执行）
    const generationPromise = mediaLuna.generateByName({
      channelName,
      prompt,
      files,
      presetName,
      session,
      uid: (session?.user as any)?.id,
      // prepare 阶段完成时调用（只有成功通过 prepare 阶段才会调用）
      onPrepareComplete: async (beforeHints: string[]) => {
        prepareCallbackCalled = true
        resolvePrepare!({ hints: beforeHints })
      }
    })

    const taskIdPromise = this.resolveTaskId(mediaLuna, {
      uid: (session?.user as any)?.id,
      channelId: channel?.id,
      prompt,
      submitAt
    })

    // 将 generationPromise 也转换为可以 race 的 Promise
    // 如果生成快速完成（成功或失败），也要处理
    const generationRacePromise = generationPromise.then((result: any) => {
      // 如果 prepare 回调已调用，说明已经进入生成阶段，不需要处理
      if (prepareCallbackCalled) {
        return null // 返回 null 表示不需要在 race 中处理
      }
      // prepare 回调未被调用但生成已完成，说明 prepare 阶段就失败了
      if (!result.success) {
        return { type: 'failed' as const, error: result.error || '生成失败' }
      }
      // 罕见情况：没有 prepare 回调但生成成功了
      return { type: 'success' as const, result }
    })

    // 超时 Promise
    const timeoutPromise = new Promise<{ type: 'timeout' }>((resolve) => {
      setTimeout(() => resolve({ type: 'timeout' }), 10000)
    })

    // 将 preparePromise 也包装一下
    const prepareRacePromise = preparePromise.then((info) => ({
      type: 'prepared' as const,
      hints: info.hints
    }))

    // 等待三者之一完成
    const raceResult = await Promise.race([
      prepareRacePromise,
      generationRacePromise,
      timeoutPromise
    ])

    // 处理结果
    if (raceResult === null) {
      // generationRacePromise 返回 null，说明 prepare 已完成，等待 preparePromise
      // 这种情况理论上不会发生，因为 prepareRacePromise 会先 resolve
      // 但为了安全，返回任务已启动
    } else if (raceResult.type === 'failed') {
      // prepare 阶段失败（如余额不足）
      return `[TASK FAILED] ${raceResult.error}`
    } else if (raceResult.type === 'timeout') {
      // 超时
      return `[TASK FAILED] 准备阶段超时`
    } else if (raceResult.type === 'success') {
      // 罕见：没有 prepare 回调但生成成功了
      // 这种情况下不需要后台处理，直接返回结果
      const result = raceResult.result
      const quickTaskId = result?.taskId || await taskIdPromise
      return JSON.stringify({
        ok: true,
        mode: 'notify',
        tasks: quickTaskId ? [{ index: 1, taskId: quickTaskId }] : [],
        channel: channelName,
        preset: presetName,
        message: quickTaskId
          ? 'Task finished quickly. Result may already be available in task query.'
          : `Task finished quickly but taskId not resolved. Query with ${getQueryToolName()}.`
      })
    }

    // type === 'prepared'，prepare 阶段成功完成
    const prepareInfo = raceResult as { type: 'prepared'; hints: string[] }

    const taskId = await taskIdPromise

    // 后台继续等待生成完成并发送结果
    this.handleAsyncResult(generationPromise, session, channelName)

    // 构建返回信息
    const infoParts: string[] = []

    // 添加 before hints（如预扣费信息）
    if (prepareInfo.hints.length > 0) {
      infoParts.push(prepareInfo.hints.join('; '))
    }

    return JSON.stringify({
      ok: true,
      mode: 'notify',
      tasks: taskId ? [{ index: 1, taskId }] : [],
      channel: channelName,
      preset: presetName,
      info: infoParts,
      message: taskId
        ? 'Task started. Result will be sent to user automatically. Do not resubmit same request.'
        : `Task started but taskId not resolved yet. Result will still be sent automatically. Optionally query with ${getQueryToolName()}.`
    })
  }

  /**
   * 处理异步生成结果
   * 在后台等待生成完成，然后发送结果给用户
   */
  private async handleAsyncResult(
    generationPromise: Promise<any>,
    session: Session | undefined,
    channelName?: string
  ): Promise<void> {
    try {
      const result = await generationPromise

      if (!result.success) {
        if (session) {
          await session.send(`生成失败: ${result.error || '未知错误'}`)
        }
        return
      }

      if (!result.output || result.output.length === 0) {
        if (session) {
          await session.send('生成完成但没有输出')
        }
        return
      }

      // 构建合并消息：图片/视频/音频 + 文字信息
      if (session) {
        const mediaLuna = (this.ctx as any).mediaLuna
        const channel = channelName && mediaLuna?.channels
          ? await mediaLuna.channels.getByName(channelName)
          : null
        const channelTags: string[] = Array.isArray(channel?.tags) ? channel.tags : []
        const koishiCommandsConfig = mediaLuna?.configService?.get?.('plugin:koishi-commands', {}) || {}

        const content = formatGenerationResult(result, {
          config: koishiCommandsConfig,
          platform: session.bot?.platform,
          channelTags,
          channelName
        })
        if (content) {
          await session.send(content)
        }
      }
    } catch (e) {
      this.logger.error(`[MediaLunaTool] Async generation error:`, e)
      if (session) {
        await session.send(`生成出错: ${e instanceof Error ? e.message : '未知错误'}`)
      }
    }
  }
}

/**
 * 任务查询工具（内部自动注册）
 */
class MediaLunaTaskQueryTool extends StructuredTool {
  name = getQueryToolName()
  description = 'Query Media Luna task status and output URLs by task IDs. Use this after task-mode submit tools.'
  schema: any = z.object({
    taskIds: z.array(z.number()).min(1).max(20).describe('Task IDs returned by submit tools'),
    waitMs: z.number().min(0).max(300000).optional().describe('Optional wait timeout in milliseconds. Default: 300000 (5 minutes, wait until all tasks finish or timeout). Set 0 for single snapshot.')
  })

  constructor(private ctx: Context, private logger: any) {
    super()
  }

  async _call(
    input: { taskIds: number[]; waitMs?: number },
    _runManager?: CallbackManagerForToolRun
  ): Promise<string> {
    try {
      const mediaLuna = (this.ctx as any).mediaLuna
      const taskService = mediaLuna?.tasks
      if (!taskService) {
        return JSON.stringify({ ok: false, error: 'Task service not available' })
      }

      const taskIds = input.taskIds
      const waitMs = Math.max(0, Math.min(300000, input.waitMs ?? 300000))
      const deadline = Date.now() + waitMs

      let snapshots: any[] = []
      while (true) {
        snapshots = await Promise.all(taskIds.map((taskId) => taskService.getById(taskId)))

        const allDone = snapshots.every((task) => !task || task.status === 'success' || task.status === 'failed')
        if (allDone || Date.now() >= deadline) break
        await new Promise(resolve => setTimeout(resolve, 400))
      }

      const results = taskIds.map((taskId, i) => {
        const task = snapshots[i]
        if (!task) {
          return {
            index: i + 1,
            taskId,
            status: 'not_found'
          }
        }

        const outputs = Array.isArray(task.responseSnapshot) ? task.responseSnapshot : []
        const urls = outputs
          .filter((asset: any) => !!asset?.url)
          .map((asset: any) => asset.url)

        const errorMsg = task.status === 'failed'
          ? (task.middlewareLogs?._error?.message || '任务失败')
          : undefined

        return {
          index: i + 1,
          taskId,
          status: task.status,
          urls,
          error: errorMsg,
          duration: task.duration ?? undefined
        }
      })

      const done = results.filter((item) => item.status === 'success' || item.status === 'failed').length
      const timedOut = done < results.length && Date.now() >= deadline
      return JSON.stringify({
        ok: true,
        timedOut,
        done,
        total: results.length,
        results
      })
    } catch (e) {
      this.logger.error(`[MediaLunaTaskQueryTool] Error:`, e)
      return JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' })
    }
  }
}

/**
 * 预设查看工具
 */
class MediaLunaPresetTool extends StructuredTool {
  name: string
  description: string
  private descriptionTemplate: string

  schema: any = z.object({
    names: z.array(z.string()).optional().describe('Optional array of preset names to view details. If not provided, lists all presets.'),
    filter: z.string().optional().describe('Optional filter keyword to search preset names (ignored if names is provided)')
  })

  constructor(
    private ctx: Context,
    private toolConfig: PresetToolConfig,
    private logger: any
  ) {
    super()
    this.name = toolConfig.name
    this.descriptionTemplate = toolConfig.description
    // 初始描述，会在首次调用时更新
    this.description = toolConfig.description.replace('{presets}', '(loading...)')

    // 异步加载预设列表并更新描述
    this.updateDescription()
  }

  /**
   * 更新描述，替换 {presets} 变量
   */
  private async updateDescription() {
    this.description = await replaceDescriptionVariables(this.ctx, this.descriptionTemplate)
  }

  async _call(
    input: { names?: string[]; filter?: string },
    _runManager?: CallbackManagerForToolRun
  ): Promise<string> {
    try {
      const mediaLuna = (this.ctx as any).mediaLuna
      if (!mediaLuna) {
        return 'Error: MediaLuna service not available'
      }

      const presetService = mediaLuna.presets
      if (!presetService) {
        return 'No presets available'
      }

      const presets = await presetService.list({ enabledOnly: true })

      // 更新描述（确保最新）
      await this.updateDescription()

      let filtered = presets

      // 如果指定了预设名称数组，按名称筛选
      if (input.names && input.names.length > 0) {
        const requestedNames = input.names.map(n => n.toLowerCase())
        filtered = presets.filter((p: any) =>
          requestedNames.includes(p.name.toLowerCase())
        )

        if (filtered.length === 0) {
          return `No presets found with names: ${input.names.join(', ')}`
        }
      } else if (input.filter) {
        // 否则使用关键字筛选
        const keyword = input.filter.toLowerCase()
        filtered = presets.filter((p: any) =>
          p.name.toLowerCase().includes(keyword) ||
          (p.description && p.description.toLowerCase().includes(keyword))
        )

        if (filtered.length === 0) {
          return `No presets found matching "${input.filter}"`
        }
      }

      if (filtered.length === 0) {
        return 'No presets available'
      }

      // 格式化输出 - 包含完整的预设信息
      const presetDetails = filtered.map((p: any) => {
        const parts: string[] = []
        parts.push(`### ${p.name}`)

        if (p.tags && p.tags.length > 0) {
          parts.push(`Tags: ${p.tags.join(', ')}`)
        }

        if (p.promptTemplate) {
          parts.push(`Prompt Template: ${p.promptTemplate}`)
        }

        if (p.referenceImages && p.referenceImages.length > 0) {
          parts.push(`Reference Images: ${p.referenceImages.length} images`)
        }

        return parts.join('\n')
      })

      return `Available presets (${filtered.length}):\n\n${presetDetails.join('\n\n')}`
    } catch (e) {
      this.logger.error(`[MediaLunaPresetTool] Error:`, e)
      return `Error listing presets: ${e instanceof Error ? e.message : 'Unknown error'}`
    }
  }
}
