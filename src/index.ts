// Media Luna - 中间件驱动的多媒体生成插件

import { Context, Logger } from 'koishi'
import type {} from '@koishijs/plugin-console'

import { Config } from './config'
import { extendDatabase } from './database'
import { MediaLunaService } from './core'
import { registerAllApis } from './core'

// 导出类型
export * from './types'
export { Config } from './config'
export { MediaLunaService, definePlugin } from './core'

// 导出外部插件开发所需的核心类型
export type {
  PluginDefinition,
  PluginContext,
  PluginLogger,
  PluginInfo,
  ServiceDefinition,
  SettingsAction,
  ConnectorRequestLog,
  ConnectorResponseLog
} from './core'

export const name = 'media-luna'
export const reusable = false

export const inject = {
  required: ['database', 'http'],
  optional: ['console']
}

export function apply(ctx: Context, config: Config) {
  const logger = new Logger(name)

  // 设置日志级别（影响 media-luna 命名空间及其子命名空间）
  const levelMap: Record<string, number> = {
    debug: Logger.DEBUG,
    info: Logger.INFO,
    warn: Logger.WARN,
    error: Logger.ERROR
  }
  const level = levelMap[config.logLevel] ?? Logger.INFO
  Logger.levels[name] = level

  logger.debug('Log level set to: %s (%d)', config.logLevel, level)

  // 1. 扩展数据库
  extendDatabase(ctx)
  logger.info('Database extended')

  // 2. 注册主服务
  ctx.plugin(MediaLunaService)
  logger.info('MediaLunaService registered')

  // 3. 注册控制台 API 和页面（如果可用）
  if (ctx.console) {
    const { resolve } = require('path')

    // 注册控制台页面
    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist')
    })

    logger.info('Console entry registered')

    // 注册 WebSocket API（使用 inject 确保 mediaLuna 服务可用）
    ctx.inject(['mediaLuna'], (ctx) => {
      registerAllApis(ctx)
      logger.info('Console APIs registered')
    })
  }

  logger.info('Media Luna started')
}
