// Plugins Index - 导出所有插件

import type { PluginDefinition } from '../core/types'

// 功能插件
import cachePlugin from './cache'
import presetPlugin from './preset'
import billingPlugin from './billing'
import taskPlugin from './task'
import promptEncodingPlugin from './prompt-encoding'
import webuiAuthPlugin from './webui-auth'
import koishiCommandsPlugin from './koishi-commands'

// 连接器插件
import dalleConnectorPlugin from './connector-dalle'
import sdWebuiConnectorPlugin from './connector-sd-webui'
import fluxConnectorPlugin from './connector-flux'
import chatApiConnectorPlugin from './connector-chat-api'
import geminiConnectorPlugin from './connector-gemini'
import midjourneyConnectorPlugin from './connector-midjourney'
import stabilityConnectorPlugin from './connector-stability'
import sunoConnectorPlugin from './connector-suno'
import runwayConnectorPlugin from './connector-runway'
import comfyuiConnectorPlugin from './connector-comfyui'

/** 内置插件列表 - 只需在这里维护一次 */
export const builtinPlugins: PluginDefinition[] = [
  // 功能插件
  cachePlugin,
  presetPlugin,
  billingPlugin,
  taskPlugin,
  promptEncodingPlugin,
  webuiAuthPlugin,
  koishiCommandsPlugin,
  // 连接器插件
  dalleConnectorPlugin,
  sdWebuiConnectorPlugin,
  fluxConnectorPlugin,
  chatApiConnectorPlugin,
  geminiConnectorPlugin,
  midjourneyConnectorPlugin,
  stabilityConnectorPlugin,
  sunoConnectorPlugin,
  runwayConnectorPlugin,
  comfyuiConnectorPlugin
]

// 单独导出插件（用于外部引用）
export {
  cachePlugin,
  presetPlugin,
  billingPlugin,
  taskPlugin,
  promptEncodingPlugin,
  webuiAuthPlugin,
  koishiCommandsPlugin,
  dalleConnectorPlugin,
  sdWebuiConnectorPlugin,
  fluxConnectorPlugin,
  chatApiConnectorPlugin,
  geminiConnectorPlugin,
  midjourneyConnectorPlugin,
  stabilityConnectorPlugin,
  sunoConnectorPlugin,
  runwayConnectorPlugin,
  comfyuiConnectorPlugin
}

// 导出类型
export type { StorageConfig, LocalCacheConfig } from './cache'
export type { PresetPluginConfig, PresetMiddlewareConfig, RemoteSyncConfig } from './preset'
export type { BillingConfig } from './billing'
export type { TaskPluginConfig } from './task'
export type { PromptEncodingConfig } from './prompt-encoding'
export type { WebuiAuthConfig } from './webui-auth'
export type { KoishiCommandsConfig } from './koishi-commands'

// 导出服务
export { CacheService } from './cache'
export { PresetService, RemoteSyncService } from './preset'
export { TaskService } from './task'
export { WebuiAuthService } from './webui-auth'

// 导出中间件工厂
export { createPromptEncodingMiddleware } from './prompt-encoding'
