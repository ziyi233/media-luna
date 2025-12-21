// Media Luna 类型定义

import { Context, Session, Schema } from 'koishi'

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

/**
 * 输出资产
 *
 * 支持两种内容形式：
 * - url: 媒体文件 URL（image/video/audio/file）
 * - content: 文本内容（text 类型）
 *
 * 两者互斥，但至少需要一个
 */
export interface OutputAsset {
  kind: AssetKind
  /** 资产 URL（媒体类型必填） */
  url?: string
  /** 文本内容（text 类型使用） */
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

// ============ 中间件相关类型 ============

/** 中间件执行状态 */
export enum MiddlewareRunStatus {
  /** 跳过，继续执行后续中间件 */
  SKIPPED = 0,
  /** 停止整个链的执行 */
  STOP = 1,
  /** 继续执行 */
  CONTINUE = 2
}

/** 中间件类别 */
export type MiddlewareCategory =
  | 'billing'     // 计费
  | 'transform'   // 转换（翻译、提示词处理）
  | 'validation'  // 验证
  | 'preset'      // 预设
  | 'cache'       // 缓存
  | 'recording'   // 记录
  | 'request'     // 请求处理
  | 'custom'      // 自定义

/** 中间件上下文 */
export interface MiddlewareContext {
  /** Koishi Context */
  ctx: Context
  /** 会话（可能为空，如 WebUI 调用） */
  session: Session | null

  // 输入（可被中间件修改）
  /** 提示词 */
  prompt: string
  /** 输入文件 */
  files: FileData[]
  /** 其他参数 */
  parameters: Record<string, any>

  // 渠道信息
  /** 渠道 ID */
  channelId: number
  /** 渠道配置（延迟加载） */
  channel: ChannelConfig | null

  // 输出
  /** 输出资产（由 request 阶段填充） */
  output: OutputAsset[] | null

  // 错误信息
  /** 执行过程中的错误（如果有） */
  error?: string
  /** 错误代码 */
  errorCode?: number

  // 用户信息
  /** 用户 ID（Koishi user.id） */
  uid: number | null

  // 中间件共享存储
  /** 中间件间共享数据 */
  store: Map<string, any>

  // 任务记录
  /** 任务 ID（由 task-recorder 填充） */
  taskId?: number

  // 工具方法
  /** 获取合并后的中间件配置（全局 + 渠道级覆盖） */
  getMiddlewareConfig<T>(name: string): T | null | Promise<T | null>
  /** 设置中间件日志（用于 task 记录） */
  setMiddlewareLog(name: string, data: any): void
  /** 获取中间件日志 */
  getMiddlewareLogs(): Record<string, any>
  /** 获取插件服务（推荐使用此方法而非直接访问 ctx.mediaLuna） */
  getService<T>(name: string): T | undefined
}

/** 中间件执行函数 */
export type MiddlewareExecuteFn = (
  context: MiddlewareContext,
  next: () => Promise<MiddlewareRunStatus>
) => Promise<MiddlewareRunStatus>

/** 中间件定义 */
export interface MiddlewareDefinition {
  /** 唯一标识 */
  name: string
  /** 显示名称 */
  displayName: string
  /** 描述 */
  description?: string
  /** 类别 */
  category: MiddlewareCategory

  /** 生命周期阶段 */
  phase: LifecyclePhase

  /** 必须在这些中间件之前执行 */
  before?: string[]
  /** 必须在这些中间件之后执行 */
  after?: string[]

  /** 配置 Schema（用于全局配置） */
  configSchema?: Schema

  /**
   * 配置字段定义
   * 在中间件设置页面显示为全局配置，也会在渠道编辑页面显示（可覆盖）
   */
  configFields?: ConfigField[]

  /** 配置组标识（共享同一配置的中间件使用相同的组名） */
  configGroup?: string

  /**
   * 渠道卡片展示字段
   * 在渠道卡片上显示的信息
   */
  cardFields?: MiddlewareCardField[]

  /** 执行函数 */
  execute: MiddlewareExecuteFn
}

// ============ 连接器相关类型 ============

/** 配置字段类型 */
export type ConfigFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select' | 'select-remote' | 'textarea' | 'table'

/** 配置字段选项 */
export interface ConfigFieldOption {
  label: string
  value: string | number | boolean
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
  /** 条件显示：当指定字段的值满足条件时才显示 */
  showWhen?: { field: string, value: any }
  /** 表格列定义（type='table' 时使用） */
  columns?: TableColumnDefinition[]
  /** 表格配置（type='table' 时使用） */
  tableConfig?: TableConfig
}

// 向后兼容的别名
export type ConnectorFieldType = ConfigFieldType
export type ConnectorFieldOption = ConfigFieldOption
export type ConnectorField = ConfigField

/** 连接器支持的类型 */
export type ConnectorSupportedType = 'image' | 'video' | 'audio'

/**
 * 统一的卡片展示字段定义
 *
 * 用于连接器和中间件在渠道卡片上展示信息
 */
export interface CardField {
  /**
   * 字段值来源
   * - channel: 渠道顶层字段（如 cost, currency）
   * - connectorConfig: 连接器配置（channel.connectorConfig[key]）
   * - pluginOverride: 插件覆盖配置（channel.pluginOverrides[configGroup][key]）
   * - pluginConfig: 插件配置
   */
  source: 'channel' | 'connectorConfig' | 'pluginOverride' | 'pluginConfig'
  /** 字段 key */
  key: string
  /** 展示标签 */
  label: string
  /** 格式化方式 */
  format?: 'text' | 'password-mask' | 'number' | 'size' | 'boolean' | 'currency'
  /** 后缀（如 "/次"） */
  suffix?: string
  /** 配置组 ID（source 为 pluginOverride 时必填） */
  configGroup?: string
  /** 插件 ID（source 为 pluginConfig 时使用） */
  pluginId?: string
}

// 向后兼容的别名
export type CardDisplayField = CardField
export type MiddlewareCardField = CardField

/** 连接器请求日志 */
export interface ConnectorRequestLog {
  /** API 端点 */
  endpoint?: string
  /** 模型名称 */
  model?: string
  /** 最终发送的 prompt */
  prompt: string
  /** 文件数量 */
  fileCount?: number
  /** 其他参数 */
  parameters?: Record<string, any>
}

/** 连接器响应日志 */
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
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 支持的生成类型 */
  supportedTypes: ConnectorSupportedType[]
  /** 配置字段 */
  fields: ConnectorField[]
  /** 卡片展示字段（可选，指定在渠道卡片上展示哪些配置字段） */
  cardFields?: CardDisplayField[]
  /** 生成函数 */
  generate: (
    ctx: Context,
    config: Record<string, any>,
    files: FileData[],
    prompt: string
  ) => Promise<OutputAsset[]>
  /**
   * 获取请求日志（可选）
   * 返回将要发送给 API 的关键信息，用于 debug 日志
   * 注意：不要包含敏感信息（API Key 等）
   */
  getRequestLog?: (
    config: Record<string, any>,
    files: FileData[],
    prompt: string
  ) => ConnectorRequestLog
  /**
   * 获取响应日志（可选）
   * 从输出中提取日志信息
   */
  getResponseLog?: (
    output: OutputAsset[]
  ) => ConnectorResponseLog
}

// ============ 渠道配置 ============

/** 渠道配置 */
export interface ChannelConfig {
  id: number
  /** 渠道名称（唯一标识，用户可见） */
  name: string
  enabled: boolean
  connectorId: string
  connectorConfig: Record<string, any>
  pluginOverrides: Record<string, any>
  tags: string[]
}

// ============ 生成请求/结果 ============

/** 生成请求 */
export interface GenerationRequest {
  /** 渠道 ID 或名称 */
  channel: number | string
  /** 提示词 */
  prompt: string
  /** 输入文件 */
  files?: FileData[]
  /** 其他参数 */
  parameters?: Record<string, any>
  /** 会话（可选） */
  session?: Session | null
  /** 用户 ID（可选，用于计费和记录） */
  uid?: number
}

/** 生成结果 */
export interface GenerationResult {
  /** 是否成功 */
  success: boolean
  /** 输出资产 */
  output?: OutputAsset[]
  /** 错误信息 */
  error?: string
  /** 任务 ID */
  taskId?: number
  /** 耗时 (毫秒) */
  duration?: number
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
