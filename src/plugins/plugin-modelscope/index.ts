// ModelScope 插件
// 提供 ModelScope 连接器和 LoRA 解析中间件

import type { PluginDefinition } from '../../core/types'
import { ModelScopeConnector } from './connector'
import { ModelScopeMiddleware } from './middleware'
import { pluginConfigFields, defaultMiddlewareConfig } from './config'
import { builtinLoraPresets } from './presets'

/** ModelScope 插件定义 */
export const modelscopePlugin: PluginDefinition = {
  id: 'modelscope',
  name: 'ModelScope',
  description: 'ModelScope 图像生成连接器，支持 LoRA 别名解析与激发词注入',
  version: '1.0.0',

  contributes: {
    connectors: [ModelScopeConnector],
    middlewares: [ModelScopeMiddleware]
  },

  // 插件级配置（用于中间件）
  configFields: pluginConfigFields,
  configDefaults: defaultMiddlewareConfig,

  // 预设数据源
  presets: {
    'modelscope-lora': builtinLoraPresets
  },

  onLoad(pluginCtx) {
    pluginCtx.logger.info('ModelScope plugin loaded')
  }
}

// 导出类型和组件
export type { MiddlewareConfig, LoraAlias } from './config'
export { ModelScopeConnector } from './connector'
export { ModelScopeMiddleware } from './middleware'
export { builtinLoraPresets, getPresetCategories } from './presets'
