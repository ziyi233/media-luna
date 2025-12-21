// MediaLunaService - 主服务

import { Context, Logger, Service } from 'koishi'
import type {
  ConnectorDefinition,
  MiddlewareDefinition,
  PluginDefinition,
  ChannelConfig as CoreChannelConfig
} from './types'
import type {
  FrontendExtension,
  GenerationRequest,
  GenerationResult,
  ChannelConfig,
  SettingsPanelDefinition,
  SettingsPanelInfo
} from '../types'
import { PluginLoader } from './plugin-loader'
import { ConfigService } from './config'
import { ServiceRegistry, ConnectorRegistry } from './registry'
import { MiddlewareRegistry, GenerationPipeline } from './pipeline'
import { RequestService, createRequestMiddleware } from './request.service'
import { ChannelService } from './channel.service'

// 导入内置插件
import { builtinPlugins } from '../plugins'


// 导入插件提供的服务类型
import type { PresetService } from '../plugins/preset'
import type { RemoteSyncService } from '../plugins/preset'
import type { TaskService } from '../plugins/task'
import type { CacheService } from '../plugins/cache'
import type { PresetPluginConfig } from '../plugins/preset/config'
import { defaultPresetConfig } from '../plugins/preset/config'

/** 远程预设配置（从 PresetPluginConfig 中提取的配置项） */
export interface RemotePresetConfig {
  apiUrl: string
  autoSync: boolean
  syncInterval: number
  deleteRemoved: boolean
  thumbnailDelay?: number
}

/**
 * MediaLunaService - Media Luna 主服务
 *
 * 提供给其他 Koishi 插件的统一 API
 */
export class MediaLunaService extends Service {
  static inject = ['database']

  private _logger: Logger
  private _connectorRegistry: ConnectorRegistry
  private _middlewareRegistry: MiddlewareRegistry
  private _frontendExtensions: Map<string, FrontendExtension> = new Map()
  private _settingsPanels: Map<string, SettingsPanelDefinition> = new Map()
  private _pipeline: GenerationPipeline

  // 业务服务
  private _channelService: ChannelService
  private _configService: ConfigService

  // 插件系统
  private _pluginLoader: PluginLoader
  private _serviceRegistry: ServiceRegistry
  private _requestService: RequestService

  constructor(ctx: Context) {
    super(ctx, 'mediaLuna', true)

    this._logger = ctx.logger('media-luna')

    // 初始化核心配置和服务注册中心
    this._configService = new ConfigService(ctx, { configDir: 'media-luna' })
    this._serviceRegistry = new ServiceRegistry(ctx)
    this._connectorRegistry = new ConnectorRegistry(ctx)
    this._middlewareRegistry = new MiddlewareRegistry(ctx)

    // 初始化业务服务
    this._channelService = new ChannelService(ctx)

    // 注册默认配置
    this._registerDefaultConfigs()

    // 初始化插件加载器
    this._pluginLoader = new PluginLoader(
      ctx,
      this._configService,
      this._middlewareRegistry as any,
      this._connectorRegistry as any,
      this._serviceRegistry
    )

    // 初始化请求服务
    this._requestService = new RequestService(ctx, this._connectorRegistry as any, {
      isConnectorEnabled: (connectorId) => this._pluginLoader.isConnectorEnabled(connectorId)
    })

    // 初始化执行管道
    this._pipeline = new GenerationPipeline(
      ctx,
      this._logger,
      this._middlewareRegistry.getGraph(),
      {
        getChannel: (id) => this._channelService.getById(id),
        getMiddlewareConfig: (name) => this._getMiddlewareConfig(name),
        isMiddlewareEnabled: (name, channel) => this._isMiddlewareEnabled(name, channel),
        getService: <T>(name: string) => this._serviceRegistry.get<T>(name)
      }
    )

    // 注册核心 request 中间件（必须在插件之前）
    this._middlewareRegistry.register(createRequestMiddleware(this._requestService) as any)

    // 注册内置插件
    this._loadBuiltinPlugins()

    // 加载外部插件（从配置）
    this._pluginLoader.loadExternalPlugins().catch(e => {
      this._logger.error('Failed to load external plugins: %s', e)
    })

    // 注册内置设置面板
    this._registerBuiltinSettingsPanels()
  }

  // ============ 默认配置 ============

  private static readonly DEFAULT_MIDDLEWARES_CONFIG: Record<string, any> = {
    'billing-prepare': { enabled: true, config: {} },
    'billing-finalize': { enabled: true, config: {} },
    'task-recorder-prepare': { enabled: true, config: {} },
    'task-recorder-finalize': { enabled: true, config: {} },
    'preset': { enabled: true, config: {} },
    'request': { enabled: true, config: {} },
    'storage': {
      enabled: true,
      config: {
        backend: 'local',
        localCacheDir: 'data/media-luna/assets',
        localPublicPath: '/media-luna/assets'
      }
    },
    'storage-input': {
      enabled: true,
      config: {
        backend: 'local',
        localCacheDir: 'data/media-luna/assets',
        localPublicPath: '/media-luna/assets'
      }
    }
  }

  /** 注册默认配置 */
  private _registerDefaultConfigs(): void {
    // 中间件默认配置
    if (!this._configService.get('middlewares')) {
      this._configService.set('middlewares', MediaLunaService.DEFAULT_MIDDLEWARES_CONFIG)
    }
  }

  // ============ 内置注册 ============

  /** 加载内置插件 */
  private async _loadBuiltinPlugins(): Promise<void> {
    await this._pluginLoader.loadAll(builtinPlugins)
    this._logger.info('Loaded %d builtin plugins', builtinPlugins.length)
}


  /** 注册内置设置面板 */
  private _registerBuiltinSettingsPanels(): void {
    // 请求流程配置（中间件开闭管理）
    this._settingsPanels.set('middlewares', {
      id: 'middlewares',
      name: '请求流程',
      icon: 'flow',
      description: '查看请求执行流程，管理中间件的启用状态',
      order: 10,
      type: 'builtin',
      component: 'middlewares'
    })

    // 插件管理（第三方扩展）- 包含所有插件的详细配置（含远程预设等）
    this._settingsPanels.set('plugins', {
      id: 'plugins',
      name: '扩展插件',
      icon: 'apps',
      description: '管理扩展插件及其详细配置',
      order: 20,
      type: 'builtin',
      component: 'plugins'
    })

    this._logger.debug('Registered builtin settings panels')
  }

  // ============ 注册 API ============

  /**
   * 注册连接器
   * @returns 注销函数
   */
  registerConnector(connector: ConnectorDefinition): () => void {
    this._logger.info(`Registering connector: ${connector.id}`)
    return this._connectorRegistry.register(connector as any)
  }

  /**
   * 注册中间件
   * @returns 注销函数
   */
  registerMiddleware(middleware: MiddlewareDefinition): () => void {
    this._logger.info(`Registering middleware: ${middleware.name}`)
    return this._middlewareRegistry.register(middleware as any)
  }

  /**
   * 注册前端扩展
   * @returns 注销函数
   */
  registerFrontendExtension(extension: FrontendExtension): () => void {
    if (this._frontendExtensions.has(extension.id)) {
      throw new Error(`Frontend extension "${extension.id}" is already registered`)
    }

    this._frontendExtensions.set(extension.id, extension)
    this._logger.info(`Registered frontend extension: ${extension.id}`)

    return () => {
      this._frontendExtensions.delete(extension.id)
    }
  }

  /**
   * 注册设置面板
   * @returns 注销函数
   */
  registerSettingsPanel(panel: SettingsPanelDefinition): () => void {
    if (this._settingsPanels.has(panel.id)) {
      throw new Error(`Settings panel "${panel.id}" is already registered`)
    }

    this._settingsPanels.set(panel.id, panel)
    this._logger.info(`Registered settings panel: ${panel.id}`)

    return () => {
      this._settingsPanels.delete(panel.id)
    }
  }

  // ============ 执行 API ============

  /**
   * 执行生成请求
   */
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    this._logger.debug(`Generating with channel: ${request.channel}`)
    return this._pipeline.execute(request)
  }

  // ============ 查询 API ============

  /** 连接器注册中心 */
  get connectors(): ConnectorRegistry {
    return this._connectorRegistry
  }

  /** 中间件注册中心 */
  get middlewares(): MiddlewareRegistry {
    return this._middlewareRegistry
  }

  /** 渠道服务 */
  get channels(): ChannelService {
    return this._channelService
  }

  /** 预设服务（通过插件提供） */
  get presets(): PresetService | undefined {
    return this._serviceRegistry.get<PresetService>('preset')
  }

  /** 任务服务（通过插件提供） */
  get tasks(): TaskService | undefined {
    return this._serviceRegistry.get<TaskService>('task')
  }

  /** 缓存服务（通过插件提供） */
  get cache(): CacheService | undefined {
    return this._serviceRegistry.get<CacheService>('cache')
  }

  /** 远程预设同步服务（通过插件提供） */
  get remotePresets(): RemoteSyncService | undefined {
    return this._serviceRegistry.get<RemoteSyncService>('remote-sync')
  }

  /** 插件加载器 */
  get pluginLoader(): PluginLoader {
    return this._pluginLoader
  }

  /** 获取服务（供中间件使用） */
  getService<T>(name: string): T | undefined {
    return this._serviceRegistry.get<T>(name)
  }

  /**
   * 获取插件信息列表
   */
  getPluginInfos(): Array<{
    id: string
    name: string
    description?: string
    version?: string
    enabled: boolean
    configFields: import('../types').ConfigField[]
    config: Record<string, any>
    actions: Array<{ name: string; label: string; type?: string; icon?: string; apiEvent: string }>
    middlewares: Array<{ name: string; displayName: string; phase: string; enabled: boolean }>
    connector?: { id: string; name: string; supportedTypes: string[] }
  }> {
    return this._pluginLoader.getPluginInfos()
  }

  /** 前端扩展列表 */
  get frontendExtensions(): FrontendExtension[] {
    return Array.from(this._frontendExtensions.values())
  }

  /** 设置面板列表（按 order 排序） */
  get settingsPanels(): SettingsPanelDefinition[] {
    return Array.from(this._settingsPanels.values())
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }

  /** 获取设置面板完整信息（包含配置数据） */
  async getSettingsPanelInfos(): Promise<SettingsPanelInfo[]> {
    const panels = this.settingsPanels
    const result: SettingsPanelInfo[] = []

    for (const panel of panels) {
      const info: SettingsPanelInfo = {
        id: panel.id,
        name: panel.name,
        icon: panel.icon,
        description: panel.description,
        order: panel.order ?? 100,
        type: panel.type,
        component: panel.component,
        configFields: panel.configFields,
        configKey: panel.configKey
      }

      // 如果是自定义面板，从 ConfigService 加载配置数据
      if (panel.type === 'custom' && panel.configKey) {
        info.config = this._configService.get(panel.configKey, {})
      }

      result.push(info)
    }

    return result
  }

  // ============ 指令注册辅助 API ============

  /**
   * 获取渠道-预设组合列表（用于 Koishi 层指令注册）
   */
  async getChannelPresetCombinations(): Promise<Array<{
    channel: ChannelConfig
    presets: Array<{ name: string }>
  }>> {
    const channels = await this._channelService.listEnabled()
    const presetService = this.presets
    const result: Array<{
      channel: ChannelConfig
      presets: Array<{ name: string }>
    }> = []

    for (const channel of channels) {
      const matchingPresets = presetService
        ? await presetService.getMatchingPresets(channel.tags)
        : []
      result.push({
        channel,
        presets: matchingPresets.map(p => ({
          name: p.name
        }))
      })
    }

    return result
  }

  /**
   * 根据渠道名和可选预设名执行生成
   */
  async generateByName(options: {
    channelName: string
    presetName?: string
    prompt: string
    files?: import('../types').FileData[]
    session?: import('koishi').Session | null
    uid?: number
  }): Promise<GenerationResult> {
    const channel = await this._channelService.getByName(options.channelName)
    if (!channel) {
      return {
        success: false,
        error: `Channel not found: ${options.channelName}`
      }
    }

    if (!channel.enabled) {
      return {
        success: false,
        error: `Channel is disabled: ${options.channelName}`
      }
    }

    const request: GenerationRequest = {
      channel: channel.id,
      prompt: options.prompt,
      files: options.files,
      parameters: options.presetName ? { preset: options.presetName } : {},
      session: options.session,
      uid: options.uid
    }

    return this.generate(request)
  }

  // ============ 内部方法 ============

  /** 获取中间件配置（从插件配置获取） */
  private async _getMiddlewareConfig(name: string): Promise<Record<string, any> | null> {
    // 从对应的插件配置获取 (plugin:xxx)
    // 中间件名通常与插件 ID 相同，或者可以通过 configGroup/category 指定
    const pluginConfig = this._configService.get<Record<string, any>>(`plugin:${name}`)
    if (pluginConfig && Object.keys(pluginConfig).length > 0) {
      return pluginConfig
    }

    // 如果中间件有 configGroup 或 category，尝试从该插件获取配置
    const middleware = this._middlewareRegistry.get(name)
    const configGroup = (middleware as any)?.configGroup || (middleware as any)?.category
    if (configGroup && configGroup !== name) {
      const groupConfig = this._configService.get<Record<string, any>>(`plugin:${configGroup}`)
      if (groupConfig && Object.keys(groupConfig).length > 0) {
        return groupConfig
      }
    }

    return null
  }

  /** 检查中间件是否启用 */
  private async _isMiddlewareEnabled(name: string, channel: ChannelConfig | null): Promise<boolean> {
    // 获取中间件定义以获取 configGroup 或 category
    const middleware = this._middlewareRegistry.get(name)
    const configGroup = (middleware as any)?.configGroup || (middleware as any)?.category || name

    // 1. 首先检查所属插件是否启用（最高优先级）
    // 如果插件被禁用，其下所有中间件都应该禁用
    if (this._pluginLoader.has(configGroup) && !this._pluginLoader.isEnabled(configGroup)) {
      return false
    }

    // 2. 检查渠道级覆盖
    // 新结构：pluginOverrides[pluginId].middlewares[mwName]
    const channelMwEnabled = channel?.pluginOverrides?.[configGroup]?.middlewares?.[name]
    if (channelMwEnabled !== undefined) {
      return channelMwEnabled
    }
    // 兼容旧结构：pluginOverrides[configGroup].enabled
    const channelEnabled = channel?.pluginOverrides?.[configGroup]?.enabled
    if (channelEnabled !== undefined) {
      // 渠道有明确配置时，使用渠道配置
      return channelEnabled
    }

    // 3. 检查全局配置（从 YAML）
    const middlewareConfigs = this._configService.get<Record<string, { enabled?: boolean }>>('middlewares', {})
    const mwConfig = middlewareConfigs[name]

    // 如果没有配置记录，默认启用
    if (!mwConfig) return true
    return mwConfig.enabled ?? true
  }

  /** 设置中间件配置（保存到 YAML 配置文件） */
  setMiddlewareConfig(name: string, config: Record<string, any>, enabled: boolean = true): void {
    const middlewareConfigs = this._configService.get<Record<string, { enabled?: boolean; config?: Record<string, any> }>>('middlewares', {})

    middlewareConfigs[name] = {
      ...middlewareConfigs[name],
      enabled,
      config
    }

    this._configService.set('middlewares', middlewareConfigs)
  }

  /** 获取中间件完整配置（包含 enabled 和 config） */
  getMiddlewareConfig(name: string): { enabled: boolean; config: Record<string, any> } {
    const middlewareConfigs = this._configService.get<Record<string, { enabled?: boolean; config?: Record<string, any> }>>('middlewares', {})
    const mwConfig = middlewareConfigs[name]

    return {
      enabled: mwConfig?.enabled ?? true,
      config: mwConfig?.config || {}
    }
  }

  /** 获取所有中间件配置 */
  getAllMiddlewareConfigs(): Record<string, { enabled?: boolean; config?: Record<string, any> }> {
    return this._configService.get<Record<string, { enabled?: boolean; config?: Record<string, any> }>>('middlewares', {})
  }

  // ============ 远程预设配置 ============

  /** 获取远程预设配置（从 preset 插件配置中读取） */
  async getRemotePresetConfig(): Promise<RemotePresetConfig> {
    const pluginConfig = this._configService.get<PresetPluginConfig>(
      'plugin:preset',
      defaultPresetConfig
    )
    return {
      apiUrl: pluginConfig.apiUrl,
      autoSync: pluginConfig.autoSync,
      syncInterval: pluginConfig.syncInterval,
      deleteRemoved: pluginConfig.deleteRemoved,
      thumbnailDelay: pluginConfig.thumbnailDelay
    }
  }

  /** 设置远程预设配置（更新 preset 插件配置） */
  async setRemotePresetConfig(config: Partial<RemotePresetConfig>): Promise<void> {
    const updated = this._configService.update<PresetPluginConfig>('plugin:preset', config)

    // 通过 RemoteSyncService 控制自动同步
    const remoteSyncService = this._serviceRegistry.get<any>('remote-sync')
    if (remoteSyncService) {
      if (updated.autoSync) {
        remoteSyncService.startAutoSync(updated)
      } else {
        remoteSyncService.stopAutoSync()
      }
    }
  }

  // ============ 配置服务 ============

  /** 配置服务 */
  get configService(): ConfigService {
    return this._configService
  }
}
