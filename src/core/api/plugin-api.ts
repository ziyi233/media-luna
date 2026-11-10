// 插件管理 API

import { Context } from 'koishi'

/**
 * 注册插件管理 API
 */
export function registerPluginApi(ctx: Context): void {
  const console = ctx.console as any

  // 获取所有已加载插件信息
  console.addListener('media-luna/plugins/list', async () => {
    try {
      // 使用 mediaLuna.getPluginInfos() 获取插件信息
      const plugins = ctx.mediaLuna.getPluginInfos()
      return { success: true, data: plugins }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取单个插件信息
  console.addListener('media-luna/plugins/get', async ({ id }: { id: string }) => {
    try {
      const plugins = ctx.mediaLuna.getPluginInfos()
      const plugin = plugins.find(p => p.id === id)
      if (!plugin) {
        return { success: false, error: 'Plugin not found' }
      }
      return { success: true, data: plugin }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 更新插件配置
  console.addListener('media-luna/plugins/update-config', async ({
    pluginId,
    config
  }: {
    pluginId: string
    config: Record<string, any>
  }) => {
    try {
      // 检查是否是真正通过 PluginLoader 加载的插件
      if (ctx.mediaLuna.pluginLoader.has(pluginId)) {
        ctx.mediaLuna.pluginLoader.updatePluginConfig(pluginId, config)
        return { success: true }
      }
      // 对于虚拟插件（连接器/中间件），暂不支持配置更新
      return { success: false, error: 'Configuration update not supported for this plugin type' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 启用插件
  console.addListener('media-luna/plugins/enable', async ({ id }: { id: string }) => {
    try {
      // 检查是否是真正通过 PluginLoader 加载的插件
      if (ctx.mediaLuna.pluginLoader.has(id)) {
        await ctx.mediaLuna.pluginLoader.enable(id)
        return { success: true }
      }
      // 对于虚拟插件，暂不支持启用/禁用
      return { success: false, error: 'Enable/disable not supported for this plugin type' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 禁用插件
  console.addListener('media-luna/plugins/disable', async ({ id }: { id: string }) => {
    try {
      // 检查是否是真正通过 PluginLoader 加载的插件
      if (ctx.mediaLuna.pluginLoader.has(id)) {
        await ctx.mediaLuna.pluginLoader.disable(id)
        return { success: true }
      }
      // 对于虚拟插件，暂不支持启用/禁用
      return { success: false, error: 'Enable/disable not supported for this plugin type' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // ============ 外部插件管理 ============

  // 获取已加载的外部插件列表
  console.addListener('media-luna/plugins/external/list', async () => {
    try {
      const plugins = ctx.mediaLuna.pluginLoader.getExternalPlugins()
      return { success: true, data: plugins }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 添加外部插件
  console.addListener('media-luna/plugins/external/add', async ({ moduleName }: { moduleName: string }) => {
    try {
      await ctx.mediaLuna.pluginLoader.addExternalPlugin(moduleName)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 移除外部插件
  console.addListener('media-luna/plugins/external/remove', async ({ moduleName }: { moduleName: string }) => {
    try {
      await ctx.mediaLuna.pluginLoader.removeExternalPlugin(moduleName)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })
}
