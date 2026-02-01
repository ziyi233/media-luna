// Plugins Index - 导出所有插件

import type { PluginDefinition } from '../core/types'

// 功能插件
import cachePlugin from './cache'
import presetPlugin from './preset'
import billingPlugin from './billing'
import taskPlugin from './task'
import censorBypassPlugin from './prompt-censor-bypass'
import webuiAuthPlugin from './webui-auth'
import koishiCommandsPlugin from './koishi-commands'
import vitsPlugin from './vits'

// 连接器插件
import dalleConnectorPlugin from './connector-dalle'
import sdWebuiConnectorPlugin from './connector-sd-webui'
import fluxConnectorPlugin from './connector-flux'
import chatApiConnectorPlugin from './connector-chat-api'
import geminiConnectorPlugin from './connector-gemini'
import vertexAIConnectorPlugin from './connector-vertex-ai'
import midjourneyConnectorPlugin from './connector-midjourney'
import stabilityConnectorPlugin from './connector-stability'
import sunoConnectorPlugin from './connector-suno'
import runwayConnectorPlugin from './connector-runway'
import comfyuiConnectorPlugin from './connector-comfyui'
import chatlunaConnectorPlugin from './connector-chatluna'
import testConnectorPlugin from './connector-test'
import doubaoConnectorPlugin from './connector-doubao'
import minimaxConnectorPlugin from './connector-minimax'
import edgeTTSConnectorPlugin from './connector-edge-tts'
import openaiTTSConnectorPlugin from './connector-openai-tts'
import azureTTSConnectorPlugin from './connector-azure-tts'
import volcengineTTSConnectorPlugin from './connector-volcengine-tts'
import peintureConnectorPlugin from './connector-peinture'
import { modelscopePlugin } from './plugin-modelscope'

/** 内置插件列表 - 只需在这里维护一次 */
export const builtinPlugins: PluginDefinition[] = [
  // 功能插件
  cachePlugin,
  presetPlugin,
  billingPlugin,
  taskPlugin,
  censorBypassPlugin,
  webuiAuthPlugin,
  koishiCommandsPlugin,
  vitsPlugin,
  // 连接器插件
  dalleConnectorPlugin,
  sdWebuiConnectorPlugin,
  fluxConnectorPlugin,
  chatApiConnectorPlugin,
  geminiConnectorPlugin,
  vertexAIConnectorPlugin,
  midjourneyConnectorPlugin,
  stabilityConnectorPlugin,
  sunoConnectorPlugin,
  runwayConnectorPlugin,
  comfyuiConnectorPlugin,
  chatlunaConnectorPlugin,
  testConnectorPlugin,
  doubaoConnectorPlugin,
  minimaxConnectorPlugin,
  edgeTTSConnectorPlugin,
  openaiTTSConnectorPlugin,
  azureTTSConnectorPlugin,
  volcengineTTSConnectorPlugin,
  peintureConnectorPlugin,
  modelscopePlugin
]

// 单独导出插件（用于外部引用）
export {
  cachePlugin,
  presetPlugin,
  billingPlugin,
  taskPlugin,
  censorBypassPlugin,
  webuiAuthPlugin,
  koishiCommandsPlugin,
  vitsPlugin,
  dalleConnectorPlugin,
  sdWebuiConnectorPlugin,
  fluxConnectorPlugin,
  chatApiConnectorPlugin,
  geminiConnectorPlugin,
  vertexAIConnectorPlugin,
  midjourneyConnectorPlugin,
  stabilityConnectorPlugin,
  sunoConnectorPlugin,
  runwayConnectorPlugin,
  comfyuiConnectorPlugin,
  chatlunaConnectorPlugin,
  testConnectorPlugin,
  doubaoConnectorPlugin,
  minimaxConnectorPlugin,
  edgeTTSConnectorPlugin,
  openaiTTSConnectorPlugin,
  azureTTSConnectorPlugin,
  volcengineTTSConnectorPlugin,
  peintureConnectorPlugin,
  modelscopePlugin
}

// 导出类型
export type { StorageConfig, LocalCacheConfig } from './cache'
export type { PresetPluginConfig, PresetMiddlewareConfig, RemoteSyncConfig } from './preset'
export type { BillingConfig } from './billing'
export type { TaskPluginConfig } from './task'
export type { CensorBypassConfig } from './prompt-censor-bypass'
export type { WebuiAuthConfig } from './webui-auth'
export type { KoishiCommandsConfig } from './koishi-commands'
export type { VitsPluginConfig, VitsSpeaker, VitsSayOptions } from './vits'
export type { ChatLunaPluginConfig, ToolConfig, PresetToolConfig } from './connector-chatluna/config'
export type { ChatLunaPromptEnhanceConfig } from './connector-chatluna/middleware'
export type { MiddlewareConfig as ModelScopeMiddlewareConfig, LoraAlias as ModelScopeLoraAlias } from './plugin-modelscope/config'

// 导出服务
export { CacheService } from './cache'
export { PresetService, RemoteSyncService } from './preset'
export { TaskService } from './task'
export { WebuiAuthService } from './webui-auth'
export { MediaLunaVits, getChannelSpeakerIdBase, getSpeakerIdFromChannelId, getChannelIdFromSpeakerId } from './vits'

// 导出中间件工厂
export { createCensorBypassMiddleware } from './prompt-censor-bypass'
export { createChatLunaPromptEnhanceMiddleware } from './connector-chatluna/middleware'
