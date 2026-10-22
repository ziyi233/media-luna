// NovelAI 连接器插件
//
// 三件事：连接器本体、两个聊天中间件、命令执行前的纯控制消息拦截（查询/重置/查点数/只记住不出图）。

import { definePlugin } from '../../core'
import type { PluginContext } from '../../core/types'
import { NovelAIConnector } from './connector'
import {
  createNovelAIDirectivesMiddleware,
  createNovelAIPresetMiddleware,
  createNovelAIResultInfoMiddleware
} from './middleware'
import { NovelAIChatState } from './chat-state'
import { registerNovelAIChatControl, type ControlServices } from './control'
import { createNovelAIConfirmGuard } from './confirm'

/** 插件级单例：服务工厂创建，onUnload 时 flush 落盘 */
let chatState: NovelAIChatState | null = null
let disposeControl: (() => void) | null = null
let disposeGuard: (() => void) | null = null

export default definePlugin({
  id: 'connector-novelai',
  name: 'NovelAI 连接器',
  description: 'NovelAI 官方 API（V5 / V4.5 / V4）图像生成连接器',
  version: '0.1.0',

  connector: NovelAIConnector,
  middlewares: [
    createNovelAIPresetMiddleware(),
    createNovelAIDirectivesMiddleware(),
    createNovelAIResultInfoMiddleware()
  ],
  services: [
    {
      name: 'novelai-chat',
      factory: pluginCtx => {
        const state = new NovelAIChatState(pluginCtx.ctx, pluginCtx.logger)
        state.load()
        chatState = state
        return state
      }
    }
  ],

  async onLoad(pluginCtx: PluginContext) {
    const state = pluginCtx.getService<NovelAIChatState>('novelai-chat')
    // 主服务走 loader 的服务注册表：直接读 ctx.mediaLuna 会触发 cordis 的
    // "property mediaLuna is not registered, declare it as inject" 警告
    const mediaLuna = pluginCtx.getService<ControlServices>('mediaLuna')
    if (state && mediaLuna) {
      // 监听器挂在根上下文，重载时会先 dispose 再 onLoad，所以必须回收
      disposeControl = registerNovelAIChatControl(pluginCtx.ctx, mediaLuna, state, pluginCtx.logger)
      // 生成前确认：作为生成前置守卫，位置落在「已进入收集模式…」之后、「正在生成中…」之前
      disposeGuard = mediaLuna.registerGenerateGuard?.(createNovelAIConfirmGuard(pluginCtx.ctx, mediaLuna, state, pluginCtx.logger)) ?? null
      if (disposeGuard) pluginCtx.logger.info('NovelAI 生成前确认已注册（收集模式之后、生成之前询问）')
    }
    pluginCtx.logger.info('NovelAI connector loaded')
  },

  onUnload() {
    disposeControl?.()
    disposeControl = null
    disposeGuard?.()
    disposeGuard = null
    chatState?.dispose()
    chatState = null
  }
})

export { NovelAIConnector } from './connector'
export { parseChatDirectives, stickySubset } from './chat-params'
export { NovelAIChatState, chatStateKey } from './chat-state'
export { handleControl, registerNovelAIChatControl } from './control'
export { applyChatOverrides, describeEffective, describeOverrides } from './chat-view'
export { estimateAnlas, resolveParams } from './params'
export type { NovelAIModelProfile, ReferenceMode } from './config'
export type { AnlasBreakdown, NovelAIParams, NovelAICharacterRow } from './params'
export type { ChatDirectiveParse, NovelAIChatOverrides } from './chat-params'
export type { ControlChannel, ControlServices } from './control'
