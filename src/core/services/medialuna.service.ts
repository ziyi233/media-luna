// MediaLunaService - 主服务

import { Context, Logger, Service } from 'koishi'
import type {
  ConnectorDefinition,
  MiddlewareDefinition,
  PluginDefinition,
  ChannelConfig as CoreChannelConfig
} from '../types'
import type {
  FrontendExtension,
  GenerationRequest,
  GenerationResult,
  ChannelConfig,
  SettingsPanelDefinition,
  SettingsPanelInfo
} from '../../types'
import { PluginLoader } from '../plugin/loader'
import { ConfigService } from '../config'
import { ServiceRegistry, ConnectorRegistry } from '../registry'
import { MiddlewareRegistry, GenerationPipeline } from '../pipeline'
import { RequestService, createRequestMiddleware } from './request.service'
import { ChannelService } from './channel.service'

// 导入内置插件
import { builtinPlugins } from '../../plugins'


// 导入插件提供的服务类型
import type { PresetService } from '../../plugins/preset'
import type { RemoteSyncService } from '../../plugins/preset'
import type { TaskService } from '../../plugins/task'
import type { CacheService } from '../../plugins/cache'
import type { PresetPluginConfig } from '../../plugins/preset/config'
import { defaultPresetConfig } from '../../plugins/preset/config'

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
 *
 * 采用 ChatLuna 的初始化模式：
 * - 构造函数中只进行同步初始化
 * - 异步操作（插件加载）在 ctx.on('ready') 中执行
 * - 使用 _ready 标记追踪完全初始化状态
 */
export class MediaLunaService extends Service {
  static inject = ['database']

  /** 插件版本号 */
  readonly version: string

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

  // 就绪状态
  private _ready = false
  private _readyPromise: Promise<void>
  private _readyResolve!: () => void

  constructor(ctx: Context) {
    // 关键：不传第三个参数（默认为 false），让 Koishi 正常管理服务生命周期
    super(ctx, 'mediaLuna')

    // 读取插件版本
    try {
      const pkg = require('../../../package.json')
      this.version = pkg.version || 'unknown'
    } catch {
      this.version = 'unknown'
    }

    this._logger = ctx.logger('media-luna')

    // 创建 ready promise（用于等待初始化完成）
    this._readyPromise = new Promise<void>(resolve => {
      this._readyResolve = resolve
    })

    // ============ 同步初始化 ============
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

    // 注册内置设置面板（同步）
    this._registerBuiltinSettingsPanels()

    // ============ 异步初始化（在 ready 事件中执行） ============
    ctx.on('ready', async () => {
      await this._initialize()
    })
  }

  /**
   * 异步初始化 - 加载所有插件
   */
  private async _initialize(): Promise<void> {
    try {
      // 加载内置插件
      await this._loadBuiltinPlugins()

      // 加载外部插件（从配置）
      await this._pluginLoader.loadExternalPlugins()

      // 标记就绪
      this._ready = true
      this._readyResolve()

      // 发出就绪事件
      this.ctx.emit('media-luna/ready' as any)

      this._logger.info('MediaLuna service fully initialized')
    } catch (e) {
      this._logger.error('Failed to initialize MediaLuna: %s', e)
      // 即使失败也标记就绪，避免死锁
      this._ready = true
      this._readyResolve()
    }
  }

  /**
   * 是否完全就绪（所有插件已加载）
   */
  get ready(): boolean {
    return this._ready
  }

  /**
   * 等待服务完全就绪
   */
  async waitForReady(): Promise<void> {
    if (this._ready) return
    return this._readyPromise
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
    configFields: import('../../types').ConfigField[]
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
    files?: import('../../types').FileData[]
    parameters?: Record<string, any>
    session?: import('koishi').Session | null
    uid?: number
    onPrepareComplete?: (hints: string[]) => Promise<void>
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
      parameters: {
        ...(options.parameters || {}),
        ...(options.presetName ? { preset: options.presetName } : {})
      },
      session: options.session,
      uid: options.uid,
      onPrepareComplete: options.onPrepareComplete
    }

    return this.generate(request)
  }

  // ============ 内部方法 ============

  /** 获取中间件配置（从插件配置获取） */
  private async _getMiddlewareConfig(name: string): Promise<Record<string, any> | null> {
    // 从对应的插件配置获取 (plugin:xxx)
    // 中间件名通常与插件 ID 相同，或者可以通过 configGroup 指定
    const pluginConfig = this._configService.get<Record<string, any>>(`plugin:${name}`)
    if (pluginConfig && Object.keys(pluginConfig).length > 0) {
      return pluginConfig
    }

    // 如果中间件有 configGroup，尝试从该插件获取配置
    // 注意：不使用 category，category 仅用于 UI 分组
    const middleware = this._middlewareRegistry.get(name)
    const configGroup = (middleware as any)?.configGroup
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
    // 获取中间件定义以获取 configGroup
    // 注意：不使用 category 作为 fallback，category 仅用于 UI 分组
    // 前端和 middleware API 都使用 configGroup || name，这里保持一致
    const middleware = this._middlewareRegistry.get(name)
    const configGroup = (middleware as any)?.configGroup || name

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

  /**
   * 检查插件在指定渠道是否启用
   * 遵循：全局配置 + 渠道级覆盖 的逻辑
   *
   * @param pluginId 插件 ID
   * @param channel 渠道配置（可选，如果为 null 则只看全局配置）
   * @returns 是否启用
   */
  isPluginEnabledForChannel(pluginId: string, channel: ChannelConfig | null): boolean {
    // 1. 检查渠道级覆盖（优先级最高）
    const channelOverride = channel?.pluginOverrides?.[pluginId]?.enabled
    if (channelOverride !== undefined) {
      return channelOverride
    }

    // 2. 检查全局插件配置
    const pluginConfig = this._configService.get<{ enabled?: boolean }>(`plugin:${pluginId}`, {})
    return pluginConfig.enabled ?? true  // 默认启用
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
