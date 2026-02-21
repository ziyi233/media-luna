// RequestService - 连接器调用基础服务
// 提供连接器调用的统一接口

import { Context } from 'koishi'
import type {
  PluginLogger,
  ConnectorDefinition,
  FileData,
  OutputAsset,
  ChannelConfig,
  MiddlewareContext,
  MiddlewareRunStatus,
  ConnectorRequestLog,
  ConnectorResponseLog
} from '../types'
import { MiddlewareRunStatus as Status } from '../types'
import { createPluginLogger } from '../utils/logger'
import { Errors, MediaLunaError, toMediaLunaError } from '../utils/error'
import { ConnectorRegistry } from '../registry'

export interface RequestResult {
  success: boolean
  output?: OutputAsset[]
  error?: string
  errorCode?: number
  /** 请求日志（用于中间件记录） */
  requestLog?: ConnectorRequestLog
  /** 响应日志（用于中间件记录） */
  responseLog?: ConnectorResponseLog
}

/**
 * RequestService - 连接器调用服务
 *
 * 封装连接器调用逻辑，提供：
 * - 统一的错误处理
 * - 超时控制
 * - 重试支持
 * - 请求/响应日志
 */
export class RequestService {
  private _ctx: Context
  private _logger: PluginLogger
  private _connectorRegistry: ConnectorRegistry
  private _isConnectorEnabled: (connectorId: string) => boolean

  constructor(
    ctx: Context,
    connectorRegistry: ConnectorRegistry,
    options?: {
      isConnectorEnabled?: (connectorId: string) => boolean
    }
  ) {
    this._ctx = ctx
    this._logger = createPluginLogger(ctx.logger('media-luna'), 'request')
    this._connectorRegistry = connectorRegistry
    this._isConnectorEnabled = options?.isConnectorEnabled || (() => true)
  }

  /**
   * 执行连接器调用
   */
  async execute(
    connectorId: string,
    config: Record<string, any>,
    files: FileData[],
    prompt: string,
    parameters?: Record<string, any>,
    options?: {
      timeout?: number
      retries?: number
    }
  ): Promise<RequestResult> {
    const connector = this._connectorRegistry.get(connectorId)
    if (!connector) {
      return Errors.connectorNotFound(connectorId).toResponse() as RequestResult
    }

    // 检查连接器所属插件是否启用
    if (!this._isConnectorEnabled(connectorId)) {
      return {
        success: false,
        error: `连接器 ${connectorId} 所属插件已禁用`,
        errorCode: 5002
      }
    }

    const { timeout = 600000, retries = 0 } = options || {}

    // 获取请求日志
    const requestLog = this._getRequestLog(connector, config, files, prompt, parameters)

    // DEBUG: 输出完整请求信息
    this._logger.debug(
      '[%s] Request:\n%s',
      connectorId,
      JSON.stringify(requestLog, null, 2)
    )

    // INFO: 输出请求摘要
    this._logger.info(
      '[%s] Generating: model=%s, prompt=%d chars, files=%d',
      connectorId,
      requestLog.model || 'default',
      prompt.length,
      files.length
    )

    let lastError: MediaLunaError | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          this._logger.info(
            '[%s] Retry %d/%d',
            connectorId,
            attempt,
            retries
          )
        }

        const startTime = Date.now()

        const output = await this._executeWithTimeout(
          connector,
          config,
          files,
          prompt,
          parameters,
          timeout
        )

        const duration = Date.now() - startTime

        // 获取响应日志
        const responseLog = this._getResponseLog(connector, output)

        // DEBUG: 输出完整响应信息
        this._logger.debug(
          '[%s] Response (%dms):\n%s',
          connectorId,
          duration,
          JSON.stringify(responseLog, null, 2)
        )

        // INFO: 输出响应摘要
        this._logger.info(
          '[%s] Success: %d outputs in %dms',
          connectorId,
          output.length,
          duration
        )

        return {
          success: true,
          output,
          requestLog,
          responseLog
        }

      } catch (error) {
        lastError = toMediaLunaError(error)
        this._logger.warn(
          '[%s] Attempt %d failed: %s',
          connectorId,
          attempt + 1,
          lastError.message
        )

        // DEBUG: 输出完整错误信息（包含堆栈和原始错误）
        this._logger.debug(
          '[%s] Error details:\n%s',
          connectorId,
          JSON.stringify({
            code: lastError.code,
            message: lastError.message,
            stack: error instanceof Error ? error.stack : undefined,
            cause: error instanceof Error ? (error as any).cause : undefined,
            raw: !(error instanceof Error) ? error : undefined
          }, null, 2)
        )

        // 如果是不可重试的错误，立即返回
        if (!this._isRetryable(lastError)) {
          break
        }
      }
    }

    this._logger.error(
      '[%s] Failed after %d attempts: %s',
      connectorId,
      retries + 1,
      lastError?.message || 'Unknown error'
    )

    return {
      ...lastError?.toResponse() as RequestResult ?? {
        success: false,
        error: '未知错误'
      },
      requestLog
    }
  }

  /**
   * 获取请求日志
   */
  private _getRequestLog(
    connector: ConnectorDefinition,
    config: Record<string, any>,
    files: FileData[],
    prompt: string,
    parameters?: Record<string, any>
  ): ConnectorRequestLog {
    // 如果连接器提供了自定义日志方法，使用它
    if (connector.getRequestLog) {
      return connector.getRequestLog(config, files, prompt, parameters)
    }

    // 默认实现：提取常见字段
    const safeParams = this._extractSafeParams(config)
    return {
      endpoint: this._maskUrl(config.apiUrl),
      model: config.model,
      prompt,
      fileCount: files.length,
      parameters: { ...safeParams, ...parameters }
    }
  }

  /**
   * 获取响应日志
   */
  private _getResponseLog(
    connector: ConnectorDefinition,
    output: OutputAsset[]
  ): ConnectorResponseLog {
    // 如果连接器提供了自定义日志方法，使用它
    if (connector.getResponseLog) {
      return connector.getResponseLog(output)
    }

    // 默认实现
    return {
      outputCount: output.length,
      outputTypes: output.map(o => o.kind),
      meta: output.length > 0 ? output[0].meta : undefined
    }
  }

  /**
   * 脱敏 URL（隐藏 API Key 等查询参数）
   */
  private _maskUrl(url?: string): string | undefined {
    if (!url) return undefined
    try {
      const parsed = new URL(url)
      // 清除可能包含敏感信息的查询参数
      parsed.search = ''
      return parsed.toString()
    } catch {
      return url.split('?')[0]
    }
  }

  /**
   * 提取安全参数（排除敏感字段）
   */
  private _extractSafeParams(config: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['apiKey', 'api_key', 'token', 'secret', 'password', 'authorization']
    const result: Record<string, any> = {}

    for (const [key, value] of Object.entries(config)) {
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        continue
      }
      // 排除 URL（已单独处理）
      if (key === 'apiUrl' || key === 'api_url') {
        continue
      }
      result[key] = value
    }

    return result
  }

  /**
   * 带超时的连接器调用
   */
  private async _executeWithTimeout(
    connector: ConnectorDefinition,
    config: Record<string, any>,
    files: FileData[],
    prompt: string,
    parameters: Record<string, any> | undefined,
    timeout: number
  ): Promise<OutputAsset[]> {
    return new Promise<OutputAsset[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(Errors.timeout(`connector:${connector.id}`, timeout))
      }, timeout)

      connector.generate(this._ctx, config, files, prompt, parameters)
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /**
   * 判断错误是否可重试
   */
  private _isRetryable(error: MediaLunaError): boolean {
    // 网络错误和超时可重试
    const retryableCodes = [
      5002,  // NETWORK_ERROR
      5003,  // RATE_LIMITED
      5004,  // TIMEOUT
    ]
    return retryableCodes.includes(error.code)
  }

  /**
   * 获取连接器
   */
  getConnector(id: string): ConnectorDefinition | undefined {
    return this._connectorRegistry.get(id)
  }

  /**
   * 检查连接器是否存在
   */
  hasConnector(id: string): boolean {
    return this._connectorRegistry.has(id)
  }
}

/**
 * 创建 request 中间件
 *
 * 这是一个核心中间件，负责在 lifecycle-request 阶段调用连接器
 * 所有连接器插件都依赖此服务
 */
export function createRequestMiddleware(requestService: RequestService) {
  return {
    name: 'request',
    displayName: '请求执行',
    description: '调用连接器执行生成请求',
    category: 'request' as const,
    phase: 'lifecycle-request' as const,
    configFields: [],

    async execute(context: MiddlewareContext, next: () => Promise<MiddlewareRunStatus>): Promise<MiddlewareRunStatus> {
      const { channel, prompt, files } = context

      if (!channel) {
        const errorMsg = 'No channel configuration found'
        context.setMiddlewareLog('request', { error: errorMsg })
        context.error = errorMsg
        return Status.STOP
      }

      // 从连接器配置中读取超时时间（秒转毫秒）
      const timeoutMs = channel.connectorConfig?.timeout
        ? channel.connectorConfig.timeout * 1000
        : undefined

      const result = await requestService.execute(
        channel.connectorId,
        channel.connectorConfig,
        files,
        prompt,
        context.parameters,
        { timeout: timeoutMs }
      )

      if (!result.success) {
        context.setMiddlewareLog('request', {
          error: result.error,
          errorCode: result.errorCode,
          request: result.requestLog
        })
        // 将错误信息设置到上下文，确保用户能看到错误消息
        context.error = result.error || '请求失败'
        return Status.STOP
      }

      context.output = result.output || null

      // 记录完整的请求/响应日志
      context.setMiddlewareLog('request', {
        connector: channel.connectorId,
        request: result.requestLog,
        response: result.responseLog
      })

      return next()
    }
  }
}
