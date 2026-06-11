// ChatLuna 连接器插件
// 使用 ChatLuna 的模型进行图像生成
// 注意：需要 ChatLuna 服务可用，否则连接器不会注册

import { definePlugin } from '../../core'
import type { PluginContext } from '../../core/types'
import { HumanMessage } from '@langchain/core/messages'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import type { PromptContextMiddlewareContext } from 'koishi-plugin-chatluna/lib/llm-core/prompt/context_manager'
import { ChatLunaConnector } from './connector'
import { registerChatLunaApi } from './api'
import { registerChatLunaTools } from './tools'
import { registerChatLunaVariables, unregisterChatLunaVariables } from './variables'
import { createChatLunaPromptEnhanceMiddleware } from './middleware'
import { chatlunaConfigFields, defaultConfig, type ChatLunaPluginConfig } from './config'
import { clearAllChatLunaTaskBindings, getChatLunaBindingDebugSnapshot, getRenderableChatLunaBindingsForConversation } from './task-binding'

interface InjectedTaskBindingPayload {
  messageId: string
  taskId: number
  status: string
  fallbackReason?: 'anchor-not-found'
}

function extractChatLunaMessageId(message: any): string | undefined {
  const directKeys = [
    message?.additional_kwargs?.messageId,
    message?.additional_kwargs?.message_id,
    message?.messageId,
    message?.message_id
  ]

  for (const candidate of directKeys) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  const content = message?.content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      const messageId = parsed?.messageId || parsed?.message_id
      if (typeof messageId === 'string' && messageId.trim()) {
        return messageId.trim()
      }
    } catch {
      // ignore invalid JSON content
    }
  }

  return undefined
}

function formatInjectedBindingMessage(payload: InjectedTaskBindingPayload): string {
  const suffix = payload.fallbackReason === 'anchor-not-found'
    ? '注意：未在当前上下文中找到对应 messageId，已回退为追加注入，用于确认注入能力正常。'
    : '这条消息已经触发了一个生成任务。'

  return `<medialuna_task_binding message_id="${payload.messageId}" task_id="${payload.taskId}" status="${payload.status}">${suffix} 当前状态为 ${payload.status}。除非用户明确要求重新生成，否则不要重复提交。</medialuna_task_binding>`
}

function findMessageIndexByMessageId(messages: any[], messageId: string): number {
  return messages.findIndex((message) => extractChatLunaMessageId(message) === messageId)
}

function createTaskBindingInjectionMiddleware(logger: any) {
  return async (context: PromptContextMiddlewareContext, next: () => Promise<void>) => {
    const payload = context.injection.value as InjectedTaskBindingPayload
    if (!payload || typeof payload !== 'object') {
      return next()
    }

    const message = new HumanMessage(formatInjectedBindingMessage(payload))

    const anchorIndex = findMessageIndexByMessageId(context.runtime.result as any[], payload.messageId)
    if (anchorIndex >= 0) {
      context.runtime.result.splice(anchorIndex + 1, 0, message)
      logger.info('[ChatLunaBinding] injected task state after ChatLuna messageId=%s taskId=%s status=%s at index=%s', payload.messageId, payload.taskId, payload.status, anchorIndex + 1)
      context.markHandled()
      return
    }

    context.appendMessages(message)
    logger.info('[ChatLunaBinding] injected fallback task state messageId=%s taskId=%s status=%s reason=%s', payload.messageId, payload.taskId, payload.status, payload.fallbackReason || 'anchor-not-found')
    context.markHandled()
  }
}

export default definePlugin({
  id: 'connector-chatluna',
  name: 'ChatLuna',
  description: 'ChatLuna 集成：使用 ChatLuna 模型生成图像，支持工具注册和提示词润色',
  version: '1.0.0',

  // 声明式连接器注册
  connector: ChatLunaConnector,

  // 声明式中间件注册
  middlewares: [
    createChatLunaPromptEnhanceMiddleware()
  ],

  // 配置字段
  configFields: chatlunaConfigFields,
  configDefaults: defaultConfig,

  async onLoad(ctx: PluginContext) {
    const koishiCtx = ctx.ctx
    const logger = ctx.logger
    let plugin: ChatLunaPlugin<any, any> | null = null
    let lifecycleRegistered = false

    // 先注册 API（用于前端获取模型列表）
    // API 在调用时动态获取服务，不需要等待服务可用
    registerChatLunaApi(koishiCtx, logger)

    // 使用 inject 安全访问 chatluna 和 mediaLuna 服务
    // 这样 Koishi 不会警告访问未注册的属性
    koishiCtx.inject(['chatluna', 'mediaLuna'], (injectedCtx) => {
      if (plugin) {
        logger.debug('ChatLuna plugin instance already created, skipping duplicate inject callback')
        return
      }

      logger.info('ChatLuna service detected via inject')
      plugin = new ChatLunaPlugin(injectedCtx, ctx.getConfig<ChatLunaPluginConfig>() as any, 'connector-chatluna', false)

      const disposeMessageIdAlignment = injectedCtx.chatluna.messageTransformer.before(async (session, _elements, message) => {
        const config = ctx.getConfig<ChatLunaPluginConfig>()
        if (!config.enableMessageIdTaskBinding) return
        const targetMessage = message as any
        targetMessage.additional_kwargs ??= {}
        if (session.messageId) {
          targetMessage.additional_kwargs.messageId = session.messageId
          targetMessage.additional_kwargs.message_id = session.messageId
          logger.debug('[ChatLunaBinding] attached messageId to additional_kwargs => %s', session.messageId)
        } else {
          logger.debug('[ChatLunaBinding] no session.messageId available for additional_kwargs attachment')
        }
      }, 0)

      const disposeTaskBindingIntercept = injectedCtx.chatluna.contextManager.intercept(
        'medialuna_task_binding',
        createTaskBindingInjectionMiddleware(logger),
        0
      )

      const disposeTaskBindingInjection = injectedCtx.chatluna.contextManager.pipeline(
        'after_system_prompts',
        async (runtime: any, next: () => Promise<void>) => {
          const config = ctx.getConfig<ChatLunaPluginConfig>()
          if (!config.enableMessageIdTaskBinding) {
            await next()
            return
          }

          const conversationId = runtime.configurable?.conversationId
          if (!conversationId) {
            logger.debug('[ChatLunaBinding] skip inject: no conversationId in runtime')
            await next()
            return
          }

          const bindings = getRenderableChatLunaBindingsForConversation(conversationId)
          const snapshot = getChatLunaBindingDebugSnapshot(conversationId)
          logger.debug('[ChatLunaBinding] pipeline check conversation=%s bindings=%s renderable=%s', conversationId, JSON.stringify(snapshot), bindings.length)
          if (bindings.length === 0) {
            logger.debug('[ChatLunaBinding] no renderable bindings for conversation=%s', conversationId)
            await next()
            return
          }

          const runtimeMessageIds = (runtime.result as any[])
            .map((message) => extractChatLunaMessageId(message))
            .filter((messageId): messageId is string => Boolean(messageId))

          logger.debug('[ChatLunaBinding] runtime messageIds conversation=%s => %s', conversationId, JSON.stringify(runtimeMessageIds))

          for (const binding of bindings) {
            const payload: InjectedTaskBindingPayload = {
              messageId: binding.messageId,
              taskId: binding.taskId,
              status: binding.status
            }

            injectedCtx.chatluna.contextManager.inject({
              conversationId,
              name: 'medialuna_task_binding',
              value: payload,
              stage: 'after_scratchpad',
              once: true
            })

            if (!runtimeMessageIds.includes(binding.messageId)) {
              logger.debug('[ChatLunaBinding] binding task #%s messageId=%s not found in runtime.result messageIds=%s, scheduling fallback injection', binding.taskId, binding.messageId, JSON.stringify(runtimeMessageIds))
            } else {
              logger.debug('[ChatLunaBinding] scheduled anchored injection for messageId=%s taskId=%s', binding.messageId, binding.taskId)
            }
          }

          await next()
        },
        100
      )

      // 工具注册函数
      const registerTools = async () => {
        void (async () => {
          const config = ctx.getConfig<ChatLunaPluginConfig>()
          const currentPlugin = plugin

          if (config.enableTools && currentPlugin) {
            logger.info('Registering ChatLuna tools...')
            await registerChatLunaTools(injectedCtx, currentPlugin, { enableMessageIdTaskBinding: config.enableMessageIdTaskBinding }, config.tools, config.presetTool, logger)
          }
        })().catch((error) => {
          logger.error('Failed to register ChatLuna tools: %s', error)
        })
      }

      // 变量注册函数
      const registerVariables = () => {
        const config = ctx.getConfig<ChatLunaPluginConfig>()

        if (config.enableVariables) {
          logger.info('Registering ChatLuna variables...')
          registerChatLunaVariables(injectedCtx, config, logger)
        }
      }

      if (!lifecycleRegistered) {
        lifecycleRegistered = true
        injectedCtx.on('ready', async () => {
          await registerTools()
          registerVariables()
        })
      }

      // 注册 dispose 回调
      ctx.onDispose(() => {
        disposeMessageIdAlignment()
        disposeTaskBindingIntercept()
        disposeTaskBindingInjection()
        unregisterChatLunaVariables()
        clearAllChatLunaTaskBindings()
        plugin = null
        lifecycleRegistered = false
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
