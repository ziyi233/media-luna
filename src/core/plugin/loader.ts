// PluginLoader - 插件加载器
// 负责插件的动态加载、卸载和生命周期管理

import { Context } from 'koishi'
import type {
  PluginDefinition,
  PluginContext,
  PluginInfo,
  PluginLogger,
  MiddlewareDefinition,
  ConnectorDefinition,
  ServiceDefinition,
  ConfigField
} from '../types'
import { createPluginLogger } from '../utils/logger'
import { Errors } from '../utils/error'
import { ConfigService } from '../config'
import { MiddlewareRegistry } from '../pipeline'
import { ConnectorRegistry, ServiceRegistry } from '../registry'

/** 已加载的插件状态 */
interface LoadedPlugin {
  definition: PluginDefinition
  enabled: boolean
  context: PluginContext
  disposeCallbacks: Array<() => void>
  registeredMiddlewares: string[]
  registeredServices: string[]
  connectorIds: string[]
}

function getPluginMiddlewares(definition: PluginDefinition): MiddlewareDefinition[] {
  return [
    ...(definition.middlewares || []),
    ...(definition.contributes?.middlewares || [])
  ]
}

function getPluginConnectors(definition: PluginDefinition): ConnectorDefinition[] {
  return [
    ...(definition.connector ? [definition.connector] : []),
    ...(definition.contributes?.connectors || [])
  ]
}

function getPluginServices(definition: PluginDefinition): ServiceDefinition[] {
  return [
    ...(definition.services || []),
    ...(definition.contributes?.services || [])
  ]
}

/**
 * 插件加载器
 *
 * 管理插件的动态加载、卸载和生命周期
 */
export class PluginLoader {
  private _ctx: Context
  private _logger: PluginLogger
  private _plugins: Map<string, LoadedPlugin> = new Map()
  private _configService: ConfigService
  private _middlewareRegistry: MiddlewareRegistry
  private _connectorRegistry: ConnectorRegistry
  private _serviceRegistry: ServiceRegistry

  constructor(
    ctx: Context,
    configService: ConfigService,
    middlewareRegistry: MiddlewareRegistry,
    connectorRegistry: ConnectorRegistry,
    serviceRegistry: ServiceRegistry
  ) {
    this._ctx = ctx
    this._logger = createPluginLogger(ctx.logger('media-luna'), 'plugin-loader')
    this._configService = configService
    this._middlewareRegistry = middlewareRegistry
    this._connectorRegistry = connectorRegistry
    this._serviceRegistry = serviceRegistry
  }

  /**
   * 批量加载插件（自动拓扑排序）
   * 根据 dependencies 字段自动确定加载顺序
   */
  async loadAll(definitions: PluginDefinition[]): Promise<void> {
    // 构建依赖图
    const pending = new Map<string, PluginDefinition>()
    for (const def of definitions) {
      pending.set(def.id, def)
    }

    const loaded = new Set<string>()
    let lastSize = -1

    // 循环直到所有插件加载完成或无法继续
    while (pending.size > 0 && pending.size !== lastSize) {
      lastSize = pending.size

      for (const [id, def] of pending) {
        // 检查依赖是否都已加载
        const deps = def.dependencies || []
        const allDepsLoaded = deps.every(dep => loaded.has(dep) || this._plugins.has(dep))

        if (allDepsLoaded) {
          try {
            await this.load(def)
            loaded.add(id)
            pending.delete(id)
          } catch (e) {
            this._logger.error('Failed to load plugin %s: %s', id, e)
            pending.delete(id)  // 移除失败的插件，避免无限循环
          }
        }
      }
    }

    // 报告未能加载的插件（循环依赖或缺失依赖）
    if (pending.size > 0) {
      for (const [id, def] of pending) {
        const missingDeps = (def.dependencies || []).filter(
          dep => !loaded.has(dep) && !this._plugins.has(dep)
        )
        this._logger.error(
          'Plugin %s could not be loaded: missing dependencies: %s',
          id,
          missingDeps.join(', ')
        )
      }
    }
  }

  /**
   * 加载插件
   */
  async load(definition: PluginDefinition): Promise<void> {
    const { id } = definition

    if (this._plugins.has(id)) {
      throw Errors.pluginLoadFailed(id, '插件已加载')
    }

    // 检查依赖
    if (definition.dependencies) {
      for (const dep of definition.dependencies) {
        if (!this._plugins.has(dep)) {
          throw Errors.pluginLoadFailed(id, `缺少依赖插件: ${dep}`)
        }
      }
    }

    this._logger.info('Loading plugin: %s', id)

    const disposeCallbacks: Array<() => void> = []
    const registeredMiddlewares: string[] = []
    const registeredServices: string[] = []

    try {
      // 注册配置默认值
      if (definition.configFields && definition.configDefaults) {
        this._configService.registerDefaults(`plugin:${id}`, definition.configDefaults)
      } else if (definition.configFields) {
        this._configService.registerDefaultsFromFields(`plugin:${id}`, definition.configFields)
      }

      // 创建插件上下文
      const pluginContext = this._createPluginContext(id, disposeCallbacks)

      // 注册服务
      const services = getPluginServices(definition)
      if (services.length > 0) {
        for (const serviceDef of services) {
          const service = serviceDef.factory(pluginContext)
          const dispose = this._serviceRegistry.register(serviceDef.name, service)
          disposeCallbacks.push(dispose)
          registeredServices.push(serviceDef.name)
          this._logger.debug('Registered service: %s (plugin: %s)', serviceDef.name, id)
        }
      }

      // 注册中间件
      const middlewares = getPluginMiddlewares(definition)
      if (middlewares.length > 0) {
        for (const middleware of middlewares) {
          const dispose = this._middlewareRegistry.register(middleware)
          disposeCallbacks.push(dispose)
          registeredMiddlewares.push(middleware.name)
          this._logger.debug('Registered middleware: %s (plugin: %s)', middleware.name, id)
        }
      }

      // 注册连接器
      const connectorIds: string[] = []
      const connectors = getPluginConnectors(definition)
      if (connectors.length > 0) {
        for (const connector of connectors) {
          const dispose = this._connectorRegistry.register(connector)
          disposeCallbacks.push(dispose)
          connectorIds.push(connector.id)
          this._logger.debug('Registered connector: %s (plugin: %s)', connector.id, id)
        }
      }

      // 创建已加载插件状态
      const loadedPlugin: LoadedPlugin = {
        definition,
        enabled: this._loadPluginEnabledState(id),  // 从配置加载启用状态
        context: pluginContext,
        disposeCallbacks,
        registeredMiddlewares,
        registeredServices,
        connectorIds
      }

      this._plugins.set(id, loadedPlugin)

      // 调用 onLoad 生命周期
      if (definition.onLoad) {
        await definition.onLoad(pluginContext)
      }

      this._logger.info('Plugin loaded: %s', id)
      this._ctx.emit('mediaLuna/plugin-loaded', id)

    } catch (error) {
      // 回滚已注册的内容
      for (const dispose of disposeCallbacks) {
        try {
          dispose()
        } catch (e) {
          this._logger.warn('Failed to dispose during rollback: %s', e)
        }
      }
      throw error
    }
  }

  /**
   * 卸载插件
   */
  async unload(id: string): Promise<void> {
    const plugin = this._plugins.get(id)
    if (!plugin) {
      throw Errors.pluginNotFound(id)
    }

    // 检查是否有其他插件依赖此插件
    for (const [otherId, other] of this._plugins) {
      if (other.definition.dependencies?.includes(id)) {
        throw Errors.pluginLoadFailed(id, `被其他插件依赖: ${otherId}`)
      }
    }

    this._logger.info('Unloading plugin: %s', id)

    // 调用 onUnload 生命周期
    if (plugin.definition.onUnload) {
      try {
        await plugin.definition.onUnload()
      } catch (e) {
        this._logger.warn('Plugin onUnload error: %s', e)
      }
    }

    // 执行所有 dispose 回调
    for (const dispose of plugin.disposeCallbacks) {
      try {
        dispose()
      } catch (e) {
        this._logger.warn('Dispose callback error: %s', e)
      }
    }

    this._plugins.delete(id)
    this._logger.info('Plugin unloaded: %s', id)
    this._ctx.emit('mediaLuna/plugin-unloaded', id)
  }

  /**
   * 启用插件
   */
  async enable(id: string): Promise<void> {
    const plugin = this._plugins.get(id)
    if (!plugin) {
      throw Errors.pluginNotFound(id)
    }

    if (plugin.enabled) {
      return
    }

    plugin.enabled = true
    this._savePluginEnabledState(id, true)
    this._logger.info('Plugin enabled: %s', id)
    this._ctx.emit('mediaLuna/plugin-enabled', id)
  }

  /**
   * 禁用插件
   */
  async disable(id: string): Promise<void> {
    const plugin = this._plugins.get(id)
    if (!plugin) {
      throw Errors.pluginNotFound(id)
    }

    if (!plugin.enabled) {
      return
    }

    plugin.enabled = false
    this._savePluginEnabledState(id, false)
    this._logger.info('Plugin disabled: %s', id)
    this._ctx.emit('mediaLuna/plugin-disabled', id)
  }

  /**
   * 保存插件启用状态到配置
   */
  private _savePluginEnabledState(id: string, enabled: boolean): void {
    const pluginStates = this._configService.get<Record<string, { enabled: boolean }>>('pluginStates', {})
    pluginStates[id] = { enabled }
    this._configService.set('pluginStates', pluginStates)
  }

  /**
   * 从配置加载插件启用状态
   */
  private _loadPluginEnabledState(id: string): boolean {
    const pluginStates = this._configService.get<Record<string, { enabled: boolean }>>('pluginStates', {})
    return pluginStates[id]?.enabled ?? true  // 默认启用
  }

  /**
   * 检查插件是否已加载
   */
  has(id: string): boolean {
    return this._plugins.has(id)
  }

  /**
   * 检查插件是否启用
   */
  isEnabled(id: string): boolean {
    return this._plugins.get(id)?.enabled ?? false
  }

  /**
   * 检查连接器所属插件是否启用
   */
  isConnectorEnabled(connectorId: string): boolean {
    for (const [_, plugin] of this._plugins) {
      if (plugin.connectorIds.includes(connectorId)) {
        return plugin.enabled
      }
    }
    // 如果找不到对应的插件，默认认为启用（可能是独立注册的连接器）
    return true
  }

  /**
   * 获取插件定义
   */
  get(id: string): PluginDefinition | undefined {
    return this._plugins.get(id)?.definition
  }

  /**
   * 获取所有已加载插件的 ID
   */
  list(): string[] {
    return Array.from(this._plugins.keys())
  }

  /**
   * 获取插件信息列表（用于 API）
   */
  getPluginInfos(): PluginInfo[] {
    const result: PluginInfo[] = []

    for (const [id, plugin] of this._plugins) {
      const def = plugin.definition
      const config = this._configService.get<Record<string, any>>(`plugin:${id}`)

      // 获取中间件状态
      const middlewares = getPluginMiddlewares(def).map(mw => ({
        name: mw.name,
        displayName: mw.displayName,
        phase: mw.phase,
        enabled: this._middlewareRegistry.has(mw.name) && plugin.enabled
      }))
      const connectors = getPluginConnectors(def)
      const [connector] = connectors

      result.push({
        id,
        name: def.name,
        description: def.description,
        version: def.version,
        enabled: plugin.enabled,
        configFields: def.configFields || [],
        config,
        actions: def.settingsActions || [],
        middlewares,
        connector: connector ? {
          id: connector.id,
          name: connector.name,
          supportedTypes: connector.supportedTypes
        } : undefined,
        presets: def.presets
      })
    }

    return result
  }

  /**
   * 获取单个插件的配置
   */
  getPluginConfig<T extends Record<string, any>>(id: string): T {
    return this._configService.get<T>(`plugin:${id}`)
  }

  /**
   * 更新插件配置
   */
  async updatePluginConfig(id: string, config: Record<string, any>): Promise<void> {
    const plugin = this._plugins.get(id)
    if (!plugin) {
      throw Errors.pluginNotFound(id)
    }

    this._configService.update(`plugin:${id}`, config)
    this._logger.info('Plugin config updated: %s', id)

    // 自动重载插件（如果插件定义了 onLoad）
    if (plugin.definition.onLoad) {
      await this._reloadPlugin(id)
    }
  }

  /**
   * 重载插件（保持启用状态，重新执行生命周期）
   */
  private async _reloadPlugin(id: string): Promise<void> {
    const plugin = this._plugins.get(id)
    if (!plugin) return

    this._logger.info('Reloading plugin: %s', id)

    // 1. 执行所有 dispose 回调（包括中间件、连接器、服务的注销）
    for (const dispose of plugin.disposeCallbacks) {
      try {
        dispose()
      } catch (e) {
        this._logger.warn('Dispose callback error during reload: %s', e)
      }
    }
    plugin.disposeCallbacks.length = 0

    // 2. 调用 onUnload（如果有）
    if (plugin.definition.onUnload) {
      try {
        await plugin.definition.onUnload()
      } catch (e) {
        this._logger.warn('Plugin onUnload error during reload: %s', e)
      }
    }

    // 3. 重新注册服务、中间件、连接器
    const newDisposeCallbacks: Array<() => void> = []
    const newRegisteredMiddlewares: string[] = []
    const newRegisteredServices: string[] = []

    try {
      // 重新注册服务
      const services = getPluginServices(plugin.definition)
      if (services.length > 0) {
        const tempContext = this._createPluginContext(id, newDisposeCallbacks)
        for (const serviceDef of services) {
          const service = serviceDef.factory(tempContext)
          const dispose = this._serviceRegistry.register(serviceDef.name, service)
          newDisposeCallbacks.push(dispose)
          newRegisteredServices.push(serviceDef.name)
          this._logger.debug('Re-registered service: %s (plugin: %s)', serviceDef.name, id)
        }
      }

      // 重新注册中间件
      const middlewares = getPluginMiddlewares(plugin.definition)
      if (middlewares.length > 0) {
        for (const middleware of middlewares) {
          const dispose = this._middlewareRegistry.register(middleware)
          newDisposeCallbacks.push(dispose)
          newRegisteredMiddlewares.push(middleware.name)
          this._logger.debug('Re-registered middleware: %s (plugin: %s)', middleware.name, id)
        }
      }

      // 重新注册连接器
      const connectorIds: string[] = []
      const connectors = getPluginConnectors(plugin.definition)
      if (connectors.length > 0) {
        for (const connector of connectors) {
          const dispose = this._connectorRegistry.register(connector)
          newDisposeCallbacks.push(dispose)
          connectorIds.push(connector.id)
          this._logger.debug('Re-registered connector: %s (plugin: %s)', connector.id, id)
        }
      }

      // 4. 重新创建上下文并调用 onLoad
      const newContext = this._createPluginContext(id, newDisposeCallbacks)

      if (plugin.definition.onLoad) {
        await plugin.definition.onLoad(newContext)
      }

      // 更新插件状态
      plugin.context = newContext
      plugin.disposeCallbacks = newDisposeCallbacks
      plugin.registeredMiddlewares = newRegisteredMiddlewares
      plugin.registeredServices = newRegisteredServices
      plugin.connectorIds = connectorIds

      this._logger.info('Plugin reloaded: %s', id)
    } catch (e) {
      this._logger.error('Failed to reload plugin %s: %s', id, e)
      // 回滚已注册的内容
      for (const dispose of newDisposeCallbacks) {
        try {
          dispose()
        } catch (disposeError) {
          this._logger.warn('Failed to dispose during rollback: %s', disposeError)
        }
      }
    }
  }

  /**
   * 创建插件上下文
   */
  private _createPluginContext(
    pluginId: string,
    disposeCallbacks: Array<() => void>
  ): PluginContext {
    const self = this

    // 创建响应式配置代理 - 每次访问属性时实时从 ConfigService 读取
    const configProxy = new Proxy({} as Record<string, any>, {
      get(_, key: string) {
        const config = self._configService.get<Record<string, any>>(`plugin:${pluginId}`)
        return config[key]
      },
      set(_, key: string, value) {
        self._configService.update(`plugin:${pluginId}`, { [key]: value })
        return true
      },
      has(_, key: string) {
        const config = self._configService.get<Record<string, any>>(`plugin:${pluginId}`)
        return key in config
      },
      ownKeys() {
        const config = self._configService.get<Record<string, any>>(`plugin:${pluginId}`)
        return Reflect.ownKeys(config)
      },
      getOwnPropertyDescriptor(_, key: string) {
        const config = self._configService.get<Record<string, any>>(`plugin:${pluginId}`)
        if (key in config) {
          return { configurable: true, enumerable: true, value: config[key] }
        }
        return undefined
      }
    })

    return {
      ctx: this._ctx,
      pluginId,
      logger: createPluginLogger(this._ctx.logger('media-luna'), pluginId),

      getConfig<T extends Record<string, any>>(): T {
        return configProxy as T  // 返回代理，自动响应配置变化
      },

      updateConfig(partial: Record<string, any>): void {
        self._configService.update(`plugin:${pluginId}`, partial)
      },

      getService<T>(name: string): T | undefined {
        return self._serviceRegistry.get<T>(name)
      },

      onDispose(callback: () => void): void {
        disposeCallbacks.push(callback)
      }
    }
  }

  /**
   * 卸载所有插件
   */
  async unloadAll(): Promise<void> {
    // 按依赖的逆序卸载
    const ids = Array.from(this._plugins.keys())
    for (const id of ids.reverse()) {
      try {
        await this.unload(id)
      } catch (e) {
        this._logger.error('Failed to unload plugin %s: %s', id, e)
      }
    }
  }

  /**
   * 从模块名加载外部插件
   * @param moduleName 模块名（如 'koishi-plugin-media-luna-xxx' 或相对路径）
   */
  async loadExternal(moduleName: string): Promise<void> {
    try {
      this._logger.info('Loading external plugin: %s', moduleName)

      // 动态导入模块
      let pluginModule: any
      try {
        // 尝试 require（CommonJS）
        pluginModule = require(moduleName)
      } catch (e) {
        // 尝试动态 import（ESM）
        pluginModule = await import(moduleName)
      }

      // 获取插件定义
      const definition: PluginDefinition = pluginModule.default || pluginModule

      if (!definition || !definition.id || !definition.name) {
        throw new Error(`Invalid plugin module: missing id or name`)
      }

      // 标记为外部插件
      ;(definition as any)._external = true
      ;(definition as any)._moduleName = moduleName

      await this.load(definition)
      this._logger.info('External plugin loaded: %s (%s)', definition.id, moduleName)
    } catch (error) {
      this._logger.error('Failed to load external plugin %s: %s', moduleName, error)
      throw error
    }
  }

  /**
   * 从配置加载所有外部插件
   */
  async loadExternalPlugins(): Promise<void> {
    // 获取外部插件列表，兼容旧格式（直接数组）和新格式（{ list: [] }）
    const externalPlugins = this.getExternalPluginsList()

    if (externalPlugins.length === 0) {
      return
    }

    this._logger.info('Loading %d external plugins...', externalPlugins.length)

    for (const moduleName of externalPlugins) {
      try {
        await this.loadExternal(moduleName)
      } catch (e) {
        // 错误已在 loadExternal 中记录，继续加载其他插件
      }
    }
  }

  /**
   * 获取外部插件列表（兼容新旧格式）
   */
  private getExternalPluginsList(): string[] {
    const rawConfig = this._configService.get<any>('externalPlugins', { list: [] })

    // 新格式：{ list: string[] }
    if (rawConfig && Array.isArray(rawConfig.list)) {
      return rawConfig.list
    }

    // 旧格式：直接是数组（虽然 ConfigService.get 不支持，但配置文件可能手动编辑过）
    if (Array.isArray(rawConfig)) {
      // 迁移到新格式
      this._configService.set('externalPlugins', { list: rawConfig })
      return rawConfig
    }

    return []
  }

  /**
   * 设置外部插件列表
   */
  private setExternalPluginsList(plugins: string[]): void {
    this._configService.set('externalPlugins', { list: plugins })
  }

  /**
   * 添加外部插件到配置并加载
   */
  async addExternalPlugin(moduleName: string): Promise<void> {
    // 先尝试加载，确保模块有效
    await this.loadExternal(moduleName)

    // 加载成功后添加到配置
    const externalPlugins = this.getExternalPluginsList()
    if (!externalPlugins.includes(moduleName)) {
      externalPlugins.push(moduleName)
      this.setExternalPluginsList(externalPlugins)
    }
  }

  /**
   * 从配置移除外部插件并卸载
   */
  async removeExternalPlugin(moduleName: string): Promise<void> {
    // 找到对应的插件 ID
    for (const [id, plugin] of this._plugins) {
      if ((plugin.definition as any)._moduleName === moduleName) {
        await this.unload(id)
        break
      }
    }

    // 从配置移除
    const externalPlugins = this.getExternalPluginsList()
    const index = externalPlugins.indexOf(moduleName)
    if (index !== -1) {
      externalPlugins.splice(index, 1)
      this.setExternalPluginsList(externalPlugins)
    }
  }

  /**
   * 获取已加载的外部插件列表
   */
  getExternalPlugins(): Array<{ id: string; moduleName: string; name: string }> {
    const result: Array<{ id: string; moduleName: string; name: string }> = []
    for (const [id, plugin] of this._plugins) {
      const def = plugin.definition as any
      if (def._external) {
        result.push({
          id,
          moduleName: def._moduleName,
          name: def.name
        })
      }
    }
    return result
  }
}

/**
 * 定义插件的辅助函数
 */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  return definition
}
