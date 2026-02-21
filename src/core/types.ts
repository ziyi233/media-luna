// Core Types - 核心类型定义

import { Context, Logger, Schema } from 'koishi'

// ============ 基础类型 ============

/** 文件数据 */
export interface FileData {
  data: ArrayBuffer
  mime: string
  filename: string
}

/** 资产类型 */
export type AssetKind = 'image' | 'video' | 'audio' | 'file' | 'text'

/** 资产元数据 */
export interface AssetMeta {
  [key: string]: any
}

/** 输出资产 */
export interface OutputAsset {
  kind: AssetKind
  url?: string
  content?: string
  mime?: string
  meta?: AssetMeta
}

// ============ 生命周期阶段 ============

export const LIFECYCLE_PHASES = [
  'lifecycle-prepare',      // 准备：验证、权限检查、初始化上下文
  'lifecycle-pre-request',  // 前置：预设应用、翻译、prompt 修改
  'lifecycle-request',      // 请求：调用 Connector
  'lifecycle-post-request', // 后置：缓存、审核、输出处理
  'lifecycle-finalize'      // 完成：计费结算、任务记录
] as const

export type LifecyclePhase = typeof LIFECYCLE_PHASES[number]

// ============ 配置字段 ============

/** 配置字段类型 */
export type ConfigFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select' | 'select-remote' | 'combobox' | 'textarea' | 'table'

/** 配置字段选项 */
export interface ConfigFieldOption {
  label: string
  value: string | number | boolean
  /** 分组标签（用于 combobox 分组显示） */
  group?: string
}

/** 表格列定义（用于 table 类型字段） */
export interface TableColumnDefinition {
  /** 列 key */
  key: string
  /** 列标题 */
  label: string
  /** 列类型 */
  type: 'text' | 'number' | 'boolean' | 'select'
  /** 宽度（可选，如 '120px' 或 '20%'） */
  width?: string
  /** 是否必填 */
  required?: boolean
  /** 占位符 */
  placeholder?: string
  /** 选项（select 类型使用） */
  options?: ConfigFieldOption[]
}

/** 表格配置（用于 table 类型字段） */
export interface TableConfig {
  /** 是否启用导入功能 */
  enableImport?: boolean
  /** 是否启用导出功能 */
  enableExport?: boolean
  /** 是否启用批量删除 */
  enableBatchDelete?: boolean
  /** 是否启用行选择 */
  enableSelection?: boolean
  /** 预设数据源标识（用于加载内置预设） */
  presetsSource?: string
  /** 最大行数 */
  maxRows?: number
  /** 卡片模式标题列（列 key） */
  titleColumn?: string
  /** 卡片模式副标题列（列 key） */
  subtitleColumn?: string
}

/** 配置字段定义 */
export interface ConfigField {
  key: string
  label: string
  type: ConfigFieldType
  required?: boolean
  options?: ConfigFieldOption[]
  optionsSource?: string
  placeholder?: string
  default?: any
  description?: string
  showWhen?: { field: string, value: any }
  /** 依赖字段（select-remote 时使用）：当依赖字段变化时重新获取选项 */
  dependsOn?: string
  /** 表格列定义（type='table' 时使用） */
  columns?: TableColumnDefinition[]
  /** 表格配置（type='table' 时使用） */
  tableConfig?: TableConfig
}

// ============ 卡片字段 ============

/** 卡片展示字段 */
export interface CardField {
  source: 'channel' | 'connectorConfig' | 'pluginOverride' | 'pluginConfig'
  key: string
  label: string
  format?: 'text' | 'password-mask' | 'number' | 'size' | 'boolean' | 'currency'
  suffix?: string
  configGroup?: string
  pluginId?: string
}

// ============ 中间件 ============

/** 中间件类别 */
export type MiddlewareCategory =
  | 'billing'
  | 'transform'
  | 'validation'
  | 'preset'
  | 'cache'
  | 'recording'
  | 'request'
  | 'custom'

/** 中间件执行状态 */
export enum MiddlewareRunStatus {
  SKIPPED = 0,
  STOP = 1,
  CONTINUE = 2
}

/** 渠道配置（简化版，用于中间件上下文） */
export interface ChannelConfig {
  id: number
  name: string
  enabled: boolean
  connectorId: string
  connectorConfig: Record<string, any>
  pluginOverrides: Record<string, any>
  tags: string[]
}

/** 中间件上下文 */
export interface MiddlewareContext {
  ctx: Context
  session: import('koishi').Session | null
  prompt: string
  files: FileData[]
  parameters: Record<string, any>
  channelId: number
  channel: ChannelConfig | null
  output: OutputAsset[] | null
  /** 执行过程中的错误（如果有） */
  error?: string
  /** 错误代码 */
  errorCode?: number
  /** 用户 ID（Koishi user.id） */
  uid: number | null
  store: Map<string, any>
  taskId?: number
  getMiddlewareConfig<T>(name: string): T | null | Promise<T | null>
  setMiddlewareLog(name: string, data: any): void
  getMiddlewareLogs(): Record<string, any>
  /** 获取插件服务（推荐使用此方法而非直接访问 ctx.mediaLuna） */
  getService<T>(name: string): T | undefined
  /**
   * 添加用户提示（会在生成结果中显示给用户）
   * @param hint 提示信息
   * @param phase 阶段：'before' 生成前显示，'after' 生成后显示
   */
  addUserHint(hint: string, phase?: 'before' | 'after'): void
  /** 获取所有用户提示 */
  getUserHints(): { before: string[]; after: string[] }
}

/** 中间件执行函数 */
export type MiddlewareExecuteFn = (
  context: MiddlewareContext,
  next: () => Promise<MiddlewareRunStatus>
) => Promise<MiddlewareRunStatus>

/** 中间件定义 */
export interface MiddlewareDefinition {
  name: string
  displayName: string
  description?: string
  /** 中间件分类（用于 UI 分组显示） */
  category: MiddlewareCategory
  phase: LifecyclePhase
  before?: string[]
  after?: string[]
  configSchema?: Schema
  configFields?: ConfigField[]
  /**
   * 配置组（用于关联插件配置）
   * 默认使用 category，如果需要关联到特定插件的配置，设置为插件 ID
   * 例如：storage 中间件设置 configGroup: 'cache' 以使用 plugin:cache 的配置
   */
  configGroup?: string
  cardFields?: CardField[]
  execute: MiddlewareExecuteFn
}

// ============ 连接器 ============

/** 连接器支持的类型 */
export type ConnectorSupportedType = 'image' | 'video' | 'audio'

/** 连接器配置字段 (与 ConfigField 相同，别名用于清晰) */
export type ConnectorField = ConfigField

/** 卡片展示字段（别名） */
export type CardDisplayField = CardField

/**
 * 连接器请求日志
 * 用于记录发送给 API 的实际请求内容
 */
export interface ConnectorRequestLog {
  /** API 端点（可脱敏） */
  endpoint?: string
  /** 模型名称 */
  model?: string
  /** 最终发送的 prompt */
  prompt: string
  /** 输入文件数量 */
  fileCount?: number
  /** 其他关键参数（不含敏感信息如 API Key） */
  parameters?: Record<string, any>
}

/**
 * 连接器响应日志
 * 用于记录 API 返回的关键信息
 */
export interface ConnectorResponseLog {
  /** 输出数量 */
  outputCount: number
  /** 输出类型 */
  outputTypes?: AssetKind[]
  /** API 返回的元数据（如 revised_prompt、seed 等） */
  meta?: Record<string, any>
}

/** 连接器定义 */
export interface ConnectorDefinition {
  id: string
  name: string
  supportedTypes: ConnectorSupportedType[]
  fields: ConnectorField[]
  cardFields?: CardDisplayField[]

  /**
   * 连接器描述
   * 显示在连接器选择器中，简要说明连接器的功能和特点
   */
  description?: string

  /**
   * 连接器图标名称
   * 对应 client/assets/connector-icons/ 目录下的图标文件名（不含扩展名）
   * 例如：'chatluna' 对应 chatluna.png
   * 如果未设置，将根据 supportedTypes 使用默认图标
   */
  icon?: string

  /**
   * 默认标签
   * 创建渠道时自动填充的标签
   * 标签用于匹配预设：text2img, img2img, text2video, img2video, text2audio
   */
  defaultTags?: string[]

  /**
   * 执行生成
   */
  generate: (
    ctx: Context,
    config: Record<string, any>,
    files: FileData[],
    prompt: string,
    parameters?: Record<string, any>
  ) => Promise<OutputAsset[]>

  /**
   * 获取请求日志（可选）
   * 返回将要发送给 API 的关键信息，用于 debug 日志
   * 注意：不要包含敏感信息（API Key 等）
   */
  getRequestLog?: (
    config: Record<string, any>,
    files: FileData[],
    prompt: string,
    parameters?: Record<string, any>
  ) => ConnectorRequestLog

  /**
   * 获取响应日志（可选）
   * 从输出中提取日志信息
   */
  getResponseLog?: (
    output: OutputAsset[]
  ) => ConnectorResponseLog
}

// ============ 生成请求/结果 ============

/** 生成请求 */
export interface GenerationRequest {
  channel: number | string
  prompt: string
  files?: FileData[]
  parameters?: Record<string, any>
  session?: import('koishi').Session | null
  /** 用户 ID（可选，用于计费和记录） */
  uid?: number
  /**
   * prepare 阶段完成后的回调
   * 返回 before hints，调用者可以决定如何显示
   */
  onPrepareComplete?: (hints: string[]) => Promise<void>
}

/** 生成结果 */
export interface GenerationResult {
  success: boolean
  output?: OutputAsset[]
  error?: string
  errorCode?: number
  errorDetails?: Record<string, any>
  taskId?: number
  duration?: number
  /** 用户提示（由中间件添加） */
  hints?: {
    /** 生成前显示的提示 */
    before: string[]
    /** 生成后显示的提示 */
    after: string[]
  }
}

// ============ 插件系统 ============

/** 日志器接口 */
export interface PluginLogger {
  debug(message: string, ...args: any[]): void
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

/** 服务定义 */
export interface ServiceDefinition {
  name: string
  factory: (ctx: PluginContext) => any
}

/** 设置操作 */
export interface SettingsAction {
  name: string
  label: string
  type?: 'primary' | 'error' | 'default'
  icon?: string
  apiEvent: string
}

/** 插件上下文 */
export interface PluginContext {
  /** Koishi Context */
  ctx: Context
  /** 插件 ID */
  pluginId: string
  /** 日志器 */
  logger: PluginLogger
  /** 获取当前插件配置 */
  getConfig<T extends Record<string, any>>(): T
  /** 更新配置 */
  updateConfig(partial: Record<string, any>): void
  /** 获取服务 */
  getService<T>(name: string): T | undefined
  /** 注册 dispose 回调 */
  onDispose(callback: () => void): void
}

/** 插件定义 */
export interface PluginDefinition {
  /** 插件唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 描述 */
  description?: string
  /** 版本 */
  version?: string
  /** 依赖的其他插件 */
  dependencies?: string[]
  /** Koishi 服务注入声明 */
  inject?: string[]

  // 注册项
  middlewares?: MiddlewareDefinition[]
  connector?: ConnectorDefinition
  services?: ServiceDefinition[]

  // 配置
  configFields?: ConfigField[]
  configDefaults?: Record<string, any>

  // 前端扩展
  cardFields?: CardField[]
  settingsActions?: SettingsAction[]

  /**
   * 预设数据源
   * key 为预设源标识（对应 tableConfig.presetsSource）
   * value 为预设数据数组
   */
  presets?: Record<string, Record<string, any>[]>

  // 生命周期
  onLoad?: (ctx: PluginContext) => void | Promise<void>
  onUnload?: () => void | Promise<void>
}

/** 插件信息（API 返回） */
export interface PluginInfo {
  id: string
  name: string
  description?: string
  version?: string
  enabled: boolean
  configFields: ConfigField[]
  config: Record<string, any>
  actions: SettingsAction[]
  middlewares: Array<{
    name: string
    displayName: string
    phase: string
    enabled: boolean
  }>
  connector?: {
    id: string
    name: string
    supportedTypes: ConnectorSupportedType[]
  }
  /** 预设数据源（用于 table 类型字段的内置预设） */
  presets?: Record<string, Record<string, any>[]>
}

// ============ 前端扩展 ============

/** 扩展点位置 */
export type ExtensionSlot =
  | 'settings-tab'           // 设置页额外 Tab
  | 'channel-config-section' // 渠道配置额外字段组
  | 'generate-panel-section' // 生成面板额外区块

/** 前端扩展定义 */
export interface FrontendExtension {
  id: string
  slot: ExtensionSlot
  schema: Schema
  dataKey?: string
}

// ============ API 响应类型 ============

/** 通用 API 响应 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

/** 任务统计 */
export interface TaskStats {
  total: number
  byStatus: {
    pending: number
    processing: number
    success: number
    failed: number
  }
  successRate: string
}

/** 任务数据（API 返回） */
export interface TaskData {
  id: number
  uid: number | null  // Koishi user.id（可为空，表示匿名/未登录）
  channelId: number
  requestSnapshot: {
    channel: number
    prompt: string
    inputFiles?: OutputAsset[]
    parameters?: Record<string, any>
    uid?: number
  }
  responseSnapshot: OutputAsset[] | null
  status: 'pending' | 'processing' | 'success' | 'failed'
  middlewareLogs: Record<string, any>
  startTime: string
  endTime: string | null
  duration: number | null
}

/** 预设数据 */
export interface PresetData {
  id: number
  name: string
  promptTemplate: string
  tags: string[]
  referenceImages: string[]
  parameterOverrides: Record<string, any>
  source: 'user' | 'api'
  enabled: boolean
  // 远程同步相关字段
  remoteId?: number
  remoteUrl?: string
  thumbnail?: string
}

/** 中间件信息（API 返回） */
export interface MiddlewareInfo {
  name: string
  displayName: string
  description: string
  category: string
  phase: string
  configFields: ConfigField[]
  configGroup: string | null
  enabled: boolean
  config: Record<string, any>
}

/** 中间件卡片字段 API 响应 */
export interface CardFieldsResponse {
  fields: CardField[]
  globalConfigs: Record<string, Record<string, any>>
}

// ============ 设置面板 ============

/** 设置面板类型 */
export type SettingsPanelType = 'builtin' | 'custom'

/** 设置面板定义 */
export interface SettingsPanelDefinition {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 图标名称 (k-icon name) */
  icon: string
  /** 描述 */
  description?: string
  /** 排序优先级（数值越小越靠前） */
  order?: number
  /** 面板类型：builtin 为内置组件，custom 为自定义 */
  type: SettingsPanelType
  /**
   * 内置组件类型（type='builtin' 时使用）
   * - 'middlewares': 功能模块（中间件配置，包含存储/缓存等）
   * - 'plugins': 扩展插件管理（包含所有插件的详细配置）
   */
  component?: 'middlewares' | 'plugins'
  /** 自定义配置字段（type='custom' 时使用） */
  configFields?: ConfigField[]
  /** 配置数据 key（存储到数据库的 key） */
  configKey?: string
}

/** 设置面板信息（API 返回） */
export interface SettingsPanelInfo {
  id: string
  name: string
  icon: string
  description?: string
  order: number
  type: SettingsPanelType
  component?: string
  configFields?: ConfigField[]
  configKey?: string
  /** 当前配置值（type='custom' 时） */
  config?: Record<string, any>
}

/** 前端文件数据（用于上传） */
export interface ClientFileData {
  type: 'image' | 'audio' | 'video' | 'file'
  url?: string
  base64?: string
  mimeType?: string
  filename?: string
}

// ============ 向后兼容别名 ============

export type ConnectorFieldType = ConfigFieldType
export type ConnectorFieldOption = ConfigFieldOption
export type MiddlewareCardField = CardField
