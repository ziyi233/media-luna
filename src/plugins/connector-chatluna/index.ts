// ChatLuna 连接器插件
// 使用 ChatLuna 的模型进行图像生成
// 注意：需要 ChatLuna 服务可用，否则连接器不会注册

import { definePlugin } from '../../core'
import type { PluginContext } from '../../core/types'
import { ChatLunaConnector } from './connector'
import { registerChatLunaApi } from './api'
import { registerChatLunaTools, unregisterChatLunaTools } from './tools'
import { registerChatLunaVariables, unregisterChatLunaVariables } from './variables'
import { createChatLunaPromptEnhanceMiddleware } from './middleware'
import { chatlunaConfigFields, defaultConfig, type ChatLunaPluginConfig } from './config'

export default definePlugin({
  id: 'connector-chatluna',
  name: 'ChatLuna',
  description: 'ChatLuna 集成：使用 ChatLuna 模型生成图像，支持工具注册和提示词润色',
  version: '1.0.0',

  contributes: {
    connectors: [ChatLunaConnector],
    middlewares: [
      createChatLunaPromptEnhanceMiddleware()
    ]
  },

  // 配置字段
  configFields: chatlunaConfigFields,
  configDefaults: defaultConfig,

  async onLoad(ctx: PluginContext) {
    const koishiCtx = ctx.ctx
    const logger = ctx.logger

    // 先注册 API（用于前端获取模型列表）
    // API 在调用时动态获取服务，不需要等待服务可用
    registerChatLunaApi(koishiCtx, logger)

    // 使用 inject 安全访问 chatluna 和 mediaLuna 服务
    // 这样 Koishi 不会警告访问未注册的属性
    koishiCtx.inject(['chatluna', 'mediaLuna'], (injectedCtx) => {
      logger.info('ChatLuna service detected via inject')

      // 工具注册函数
      const registerTools = () => {
        const config = ctx.getConfig<ChatLunaPluginConfig>()

        if (config.enableTools) {
          logger.info('Registering ChatLuna tools...')
          registerChatLunaTools(injectedCtx, config.tools, config.presetTool, logger)
        }
      }

      // 变量注册函数
      const registerVariables = () => {
        const config = ctx.getConfig<ChatLunaPluginConfig>()

        if (config.enableVariables) {
          logger.info('Registering ChatLuna variables...')
          registerChatLunaVariables(injectedCtx, config, logger)
        }
      }

      // 延迟注册工具和变量（等待 ChatLuna 完全初始化）
      injectedCtx.setTimeout(() => {
        registerTools()
        registerVariables()
      }, 2000)

      // 注册 dispose 回调
      ctx.onDispose(() => {
        unregisterChatLunaTools()
        unregisterChatLunaVariables()
      })
    })

    logger.info('ChatLuna connector plugin loaded')
  }
})

// 导出类型和组件
export type { ChatLunaPluginConfig } from './config'
export type { ChatLunaPromptEnhanceConfig } from './middleware'
export { ChatLunaConnector } from './connector'
export { createChatLunaPromptEnhanceMiddleware } from './middleware'
