// 中间件配置 API

import { Context } from 'koishi'

/**
 * 注册中间件配置 API
 */
export function registerMiddlewareApi(ctx: Context): void {
  const console = ctx.console as any

  // 获取中间件列表及配置
  console.addListener('media-luna/middlewares/list', async () => {
    try {
      const registered = ctx.mediaLuna.middlewares.list()
      const allConfigs = ctx.mediaLuna.getAllMiddlewareConfigs()
      const pluginInfos = ctx.mediaLuna.getPluginInfos()

      // 构建 configGroup -> 插件 configFields 的映射
      const pluginConfigFieldsMap = new Map<string, typeof pluginInfos[0]['configFields']>()
      for (const plugin of pluginInfos) {
        if (plugin.configFields && plugin.configFields.length > 0) {
          // 使用插件 ID 作为 key
          pluginConfigFieldsMap.set(plugin.id, plugin.configFields)
        }
      }

      const result = registered.map(middleware => {
        // 如果有配置组，优先使用配置组的配置
        const groupConfig = middleware.configGroup ? allConfigs[middleware.configGroup] : null
        const mwConfig = allConfigs[middleware.name]
        const effectiveConfig = groupConfig || mwConfig

        // 获取配置字段：优先使用中间件自己的，否则使用 configGroup 对应插件的
        let configFields = middleware.configFields || []
        if (configFields.length === 0 && middleware.configGroup) {
          const pluginFields = pluginConfigFieldsMap.get(middleware.configGroup)
          if (pluginFields) {
            configFields = pluginFields
          }
        }

        return {
          name: middleware.name,
          displayName: middleware.displayName || middleware.name,
          description: middleware.description || '',
          category: middleware.category,
          phase: middleware.phase,
          configFields,
          configGroup: middleware.configGroup || null,
          enabled: mwConfig?.enabled ?? true,
          config: effectiveConfig?.config || {}
        }
      })

      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取单个中间件配置
  console.addListener('media-luna/middlewares/get', async ({ name }: { name: string }) => {
    try {
      const middleware = ctx.mediaLuna.middlewares.get(name)
      if (!middleware) {
        return { success: false, error: 'Middleware not found' }
      }

      const mwConfig = ctx.mediaLuna.getMiddlewareConfig(name)

      return {
        success: true,
        data: {
          name: middleware.name,
          displayName: middleware.displayName || middleware.name,
          description: middleware.description || '',
          category: middleware.category,
          phase: middleware.phase,
          before: middleware.before || [],
          after: middleware.after || [],
          configFields: middleware.configFields || [],
          enabled: mwConfig.enabled,
          config: mwConfig.config
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 更新中间件配置
  console.addListener('media-luna/middlewares/update', async ({ name, data }: {
    name: string
    data: { enabled?: boolean, config?: Record<string, any> }
  }) => {
    try {
      const middleware = ctx.mediaLuna.middlewares.get(name)
      if (!middleware) {
        return { success: false, error: 'Middleware not found' }
      }

      // 如果有配置组，配置保存到配置组名下
      const configName = middleware.configGroup || name

      // 获取当前配置
      const currentConfig = ctx.mediaLuna.getMiddlewareConfig(name)
      const currentGroupConfig = middleware.configGroup
        ? ctx.mediaLuna.getMiddlewareConfig(middleware.configGroup)
        : currentConfig

      // 更新启用状态（始终保存到中间件名下）
      if (data.enabled !== undefined) {
        ctx.mediaLuna.setMiddlewareConfig(name, currentConfig.config, data.enabled)
      }

      // 更新配置（保存到配置组或中间件名下）
      if (data.config !== undefined) {
        const targetEnabled = ctx.mediaLuna.getMiddlewareConfig(configName).enabled
        ctx.mediaLuna.setMiddlewareConfig(configName, data.config, targetEnabled)
      }

      ctx.emit('mediaLuna/middleware-config-updated', name)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 重置中间件配置
  console.addListener('media-luna/middlewares/reset', async ({ name }: { name: string }) => {
    try {
      const middleware = ctx.mediaLuna.middlewares.get(name)
      if (!middleware) {
        return { success: false, error: 'Middleware not found' }
      }

      // 删除配置（设置为空对象，启用状态重置为 true）
      ctx.mediaLuna.setMiddlewareConfig(name, {}, true)

      ctx.emit('mediaLuna/middleware-config-updated', name)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取中间件执行顺序
  console.addListener('media-luna/middlewares/execution-order', async () => {
    try {
      const graph = ctx.mediaLuna.middlewares.getGraph()
      const levels = graph.build()

      const executionOrder = levels.map((level, index) => ({
        level: index,
        parallel: level.length > 1,
        middlewares: level.map(m => ({
          name: m.name,
          displayName: m.displayName || m.name,
          phase: m.phase,
          category: m.category
        }))
      }))

      return { success: true, data: executionOrder }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取中间件注册的卡片展示字段及其配置组的全局配置
  console.addListener('media-luna/middlewares/card-fields', async () => {
    try {
      const cardFields = ctx.mediaLuna.middlewares.getCardFields()
      const registered = ctx.mediaLuna.middlewares.list()
      const allConfigs = ctx.mediaLuna.getAllMiddlewareConfigs()

      // 收集涉及的配置组
      const configGroups = new Set<string>()
      for (const field of cardFields) {
        if (field.configGroup) {
          configGroups.add(field.configGroup)
        }
      }

      // 获取配置组的全局配置（合并默认值和 YAML 配置）
      const globalConfigs: Record<string, Record<string, any>> = {}

      if (configGroups.size > 0) {
        // 先从中间件定义中获取默认值
        for (const middleware of registered) {
          const groupId = middleware.configGroup || middleware.name
          if (!configGroups.has(groupId)) continue
          if (globalConfigs[groupId]) continue

          // 从 configFields 提取默认值
          const defaults: Record<string, any> = {}
          if (middleware.configFields) {
            for (const field of middleware.configFields) {
              if (field.default !== undefined) {
                defaults[field.key] = field.default
              }
            }
          }
          globalConfigs[groupId] = defaults
        }

        // 再用 YAML 中的配置覆盖
        for (const groupId of configGroups) {
          const mwConfig = allConfigs[groupId]
          if (mwConfig?.config) {
            globalConfigs[groupId] = { ...globalConfigs[groupId], ...mwConfig.config }
          }
        }
      }

      return { success: true, data: { fields: cardFields, globalConfigs } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })
}
