// GenerationPipeline - 生成管道执行器

import { Context, Logger } from 'koishi'
import {
  MiddlewareContext,
  MiddlewareDefinition,
  MiddlewareRunStatus,
  GenerationRequest,
  GenerationResult,
  ChannelConfig
} from '../types'
import { MiddlewareDependencyGraph } from './dependency-graph'

/** 中间件执行结果 */
interface MiddlewareResult {
  name: string
  status: 'success' | 'stop' | 'error'
  output: MiddlewareRunStatus
  error?: Error
}

/**
 * GenerationPipeline - 生成管道
 *
 * 负责执行中间件链，处理生成请求
 */
export class GenerationPipeline {
  private _ctx: Context
  private _logger: Logger
  private _graph: MiddlewareDependencyGraph
  private _getChannel: (id: number) => Promise<ChannelConfig | null>
  private _getMiddlewareConfig: (name: string) => Promise<Record<string, any> | null>
  private _isMiddlewareEnabled: (name: string, channel: ChannelConfig | null) => Promise<boolean>
  private _getService: <T>(name: string) => T | undefined
  private _getMiddleware: (name: string) => MiddlewareDefinition | undefined

  constructor(
    ctx: Context,
    logger: Logger,
    graph: MiddlewareDependencyGraph,
    options: {
      getChannel: (id: number) => Promise<ChannelConfig | null>
      getMiddlewareConfig: (name: string) => Promise<Record<string, any> | null>
      isMiddlewareEnabled: (name: string, channel: ChannelConfig | null) => Promise<boolean>
      getService: <T>(name: string) => T | undefined
      getMiddleware?: (name: string) => MiddlewareDefinition | undefined
    }
  ) {
    this._ctx = ctx
    this._logger = logger
    this._graph = graph
    this._getChannel = options.getChannel
    this._getMiddlewareConfig = options.getMiddlewareConfig
    this._isMiddlewareEnabled = options.isMiddlewareEnabled
    this._getService = options.getService
    this._getMiddleware = options.getMiddleware ?? ((name) => graph.get(name))
  }

  /**
   * 执行生成请求
   */
  async execute(request: GenerationRequest): Promise<GenerationResult> {
    const startTime = Date.now()

    // 解析渠道 ID
    let channelId: number
    if (typeof request.channel === 'string') {
      // TODO: 通过名称查询渠道 ID
      this._logger.error('Channel name lookup not implemented yet')
      return {
        success: false,
        error: 'Channel name lookup not implemented yet'
      }
    } else {
      channelId = request.channel
    }

    this._logger.info(`Starting generation for channel ${channelId}`)

    // 创建中间件上下文
    const context = await this._createContext(request, channelId)

    let pipelineError: Error | null = null
    let earlyStopByMiddleware = false

    try {
      // 构建执行层级
      const levels = this._graph.build()

      if (levels.length === 0) {
        this._logger.warn('No middlewares to execute')
        return {
          success: true,
          output: [],
          taskId: context.taskId
        }
      }

      this._logger.info(`Executing ${levels.length} middleware levels`)

      // 逐层执行中间件
      let preparePhaseCompleted = false
      for (const level of levels) {
        // 跳过 lifecycle-finalize 阶段，稍后单独执行
        const isFinalize = level.every(m => m.phase === 'lifecycle-finalize')
        if (isFinalize) continue

        // 检测当前层是否为 lifecycle-prepare 阶段
        const isPreparePhase = level.some(m => m.phase === 'lifecycle-prepare')

        // 过滤禁用的中间件
        const enabledMiddlewares: MiddlewareDefinition[] = []
        for (const middleware of level) {
          if (await this._isMiddlewareEnabled(middleware.name, context.channel)) {
            enabledMiddlewares.push(middleware)
          } else {
            this._logger.debug(`Skipping disabled middleware: ${middleware.name}`)
          }
        }

        if (enabledMiddlewares.length === 0) {
          // 即使没有中间件执行，也要在 prepare 阶段后调用回调
          if (isPreparePhase && !preparePhaseCompleted) {
            preparePhaseCompleted = true
            await this._callPrepareCompleteCallback(request, context)
          }
          continue
        }

        const results = await this._executeLevel(enabledMiddlewares, context)

        // 如果是 lifecycle-prepare 阶段完成后，调用回调通知调用者
        if (isPreparePhase && !preparePhaseCompleted) {
          preparePhaseCompleted = true
          await this._callPrepareCompleteCallback(request, context)
        }

        // 检查是否有停止或错误
        for (const result of results) {
          if (result.status === 'stop') {
            this._logger.info(`Pipeline stopped by middleware: ${result.name}`)
            earlyStopByMiddleware = true
            break
          }

          if (result.status === 'error') {
            this._logger.error(`Middleware error in ${result.name}:`, result.error)
            // 将错误信息保存到上下文，供 finalize 阶段使用
            context.error = result.error?.message ?? 'Unknown middleware error'
            pipelineError = result.error ?? new Error('Unknown middleware error')
            break
          }
        }

        // 如果有停止或错误，跳出循环
        if (earlyStopByMiddleware || pipelineError) break
      }
    } catch (error) {
      this._logger.error('Pipeline execution error:', error)
      pipelineError = error instanceof Error ? error : new Error(String(error))
      context.error = pipelineError.message
    }

    // 始终执行 lifecycle-finalize 阶段（类似 try-finally）
    try {
      await this._executeFinalizePhase(context)
    } catch (finalizeError) {
      this._logger.error('Finalize phase error:', finalizeError)
      // finalize 阶段的错误不影响最终结果
    }

    const duration = Date.now() - startTime

    // 获取用户提示
    const hints = context.getUserHints()
    const hasHints = hints.before.length > 0 || hints.after.length > 0

    // 如果有错误，返回错误结果
    if (pipelineError) {
      return {
        success: false,
        error: pipelineError.message,
        taskId: context.taskId,
        duration,
        hints: hasHints ? hints : undefined
      }
    }

    // 如果中间件设置了 context.error（例如请求失败），也返回错误结果
    if (context.error) {
      return {
        success: false,
        error: context.error,
        taskId: context.taskId,
        duration,
        hints: hasHints ? hints : undefined
      }
    }

    this._logger.info(`Pipeline completed in ${duration}ms, output: ${context.output?.length ?? 0} assets`)

    return {
      success: true,
      output: context.output ?? [],
      taskId: context.taskId,
      duration,
      hints: hasHints ? hints : undefined
    }
  }

  /**
   * 执行 lifecycle-finalize 阶段的中间件
   */
  private async _executeFinalizePhase(context: MiddlewareContext): Promise<void> {
    const levels = this._graph.build()

    for (const level of levels) {
      // 只执行 lifecycle-finalize 阶段
      const finalizeMiddlewares = level.filter(m => m.phase === 'lifecycle-finalize')
      if (finalizeMiddlewares.length === 0) continue

      // 过滤禁用的中间件
      const enabledMiddlewares: MiddlewareDefinition[] = []
      for (const middleware of finalizeMiddlewares) {
        if (await this._isMiddlewareEnabled(middleware.name, context.channel)) {
          enabledMiddlewares.push(middleware)
        }
      }

      if (enabledMiddlewares.length > 0) {
        await this._executeLevel(enabledMiddlewares, context)
      }
    }
  }

  /**
   * 创建中间件上下文
   */
  private async _createContext(
    request: GenerationRequest,
    channelId: number
  ): Promise<MiddlewareContext> {
    const middlewareLogs: Record<string, any> = {}
    const userHints: { before: string[]; after: string[] } = { before: [], after: [] }

    // 获取渠道配置
    const channel = await this._getChannel(channelId)

    const context: MiddlewareContext = {
      ctx: this._ctx,
      session: request.session ?? null,

      prompt: request.prompt,
      files: request.files ?? [],
      parameters: request.parameters ?? {},

      channelId,
      channel,

      output: null,

      uid: request.uid ?? null,

      store: new Map(),

      getMiddlewareConfig: async <T>(name: string): Promise<T | null> => {
        // 获取中间件定义以获取 configGroup
        const middleware = this._getMiddleware(name)
        // 优先使用 configGroup，其次使用中间件名称（与插件 ID 对应）
        // 注意：不使用 category，因为 category 是分类而非配置组
        const configGroup = (middleware as any)?.configGroup || name

        // 获取全局配置（_getMiddlewareConfig 内部已经会处理 configGroup）
        const globalConfig = await this._getMiddlewareConfig(name)

        // 获取渠道级覆盖（使用 configGroup 作为键）
        const channelOverride = channel?.pluginOverrides?.[configGroup]

        if (!globalConfig && !channelOverride) {
          return null
        }

        // 合并配置（渠道级覆盖优先）
        // 注意：排除 middlewares 键，它是用于中间件启用状态的
        const { middlewares: _mw, ...overrideConfig } = channelOverride ?? {}
        return {
          ...(globalConfig ?? {}),
          ...overrideConfig
        } as T
      },

      setMiddlewareLog: (name: string, data: any) => {
        middlewareLogs[name] = data
      },

      getMiddlewareLogs: () => middlewareLogs,

      getService: <T>(name: string): T | undefined => {
        return this._getService<T>(name)
      },

      addUserHint: (hint: string, phase: 'before' | 'after' = 'after') => {
        userHints[phase].push(hint)
      },

      getUserHints: () => userHints
    }

    return context
  }

  /**
   * 执行一层中间件（并行）
   */
  private async _executeLevel(
    middlewares: MiddlewareDefinition[],
    context: MiddlewareContext
  ): Promise<MiddlewareResult[]> {
    const abortController = new AbortController()
    const results: MiddlewareResult[] = []
    let hasStop = false
    let hasError = false

    const promises = middlewares.map(async (middleware, index) => {
      try {
        // 检查是否已中止
        if (abortController.signal.aborted) {
          return {
            name: middleware.name,
            status: 'success' as const,
            output: MiddlewareRunStatus.SKIPPED
          }
        }

        const result = await this._executeMiddleware(middleware, context)

        // 如果返回 STOP，中止其他中间件
        if (result.output === MiddlewareRunStatus.STOP && !hasStop) {
          hasStop = true
          abortController.abort()
          results[index] = { ...result, status: 'stop' }
          return results[index]
        }

        results[index] = result
        return result
      } catch (error) {
        if (!hasError) {
          hasError = true
          abortController.abort()
        }

        const result: MiddlewareResult = {
          name: middleware.name,
          status: 'error',
          output: MiddlewareRunStatus.STOP,
          error: error instanceof Error ? error : new Error(String(error))
        }
        results[index] = result
        return result
      }
    })

    await Promise.all(promises)

    return results.filter(r => r !== undefined)
  }

  /**
   * 执行单个中间件
   */
  private async _executeMiddleware(
    middleware: MiddlewareDefinition,
    context: MiddlewareContext
  ): Promise<MiddlewareResult> {
    this._logger.info(`Executing middleware: ${middleware.name}`)

    const next = async (): Promise<MiddlewareRunStatus> => {
      return MiddlewareRunStatus.CONTINUE
    }

    const output = await middleware.execute(context, next)

    return {
      name: middleware.name,
      status: 'success',
      output
    }
  }

  /**
   * 调用 prepare 阶段完成回调
   * 将 before hints 传递给调用者，让其决定如何显示
   */
  private async _callPrepareCompleteCallback(
    request: GenerationRequest,
    context: MiddlewareContext
  ): Promise<void> {
    if (!request.onPrepareComplete) return

    const hints = context.getUserHints()

    try {
      await request.onPrepareComplete(hints.before)
      // 清空 before hints，避免在最终结果中重复
      hints.before.length = 0
      this._logger.debug('Called onPrepareComplete callback')
    } catch (e) {
      this._logger.warn('onPrepareComplete callback failed:', e)
    }
  }
}
