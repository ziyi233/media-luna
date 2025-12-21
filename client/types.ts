// 从后端导入所有类型（前后端共享同一份类型定义）
// 使用相对路径直接引用源文件，确保开发时类型同步
export type {
  // 基础类型
  AssetKind,
  OutputAsset,
  FileData,
  ClientFileData,

  // 配置类型
  ConfigField,
  ConfigFieldType,
  ConfigFieldOption,
  TableColumnDefinition,
  TableConfig,
  CardField,
  CardDisplayField,
  MiddlewareCardField,

  // 渠道和连接器
  ChannelConfig,
  ConnectorDefinition,
  ConnectorSupportedType,

  // 中间件
  MiddlewareCategory,
  MiddlewareInfo,

  // 预设和任务
  PresetData,
  TaskData,
  TaskStats,

  // 生成
  GenerationRequest,
  GenerationResult,

  // 设置面板
  SettingsPanelType,
  SettingsPanelDefinition,
  SettingsPanelInfo,

  // API 响应
  ApiResponse,
  PaginatedResponse,
  CardFieldsResponse
} from '../src/types'

// 从核心模块导入插件相关类型
export type {
  PluginInfo
} from '../src/core/types'

// 类型别名（保持向后兼容）
import type { ConfigField, CardFieldsResponse as _CardFieldsResponse } from '../src/types'
export type FieldDefinition = ConfigField
export type MiddlewareCardFieldsResponse = _CardFieldsResponse

// Koishi Client 事件类型扩展
import type {
  ChannelConfig,
  PresetData,
  TaskData,
  TaskStats,
  ConnectorDefinition,
  GenerationResult,
  ClientFileData,
  MiddlewareInfo,
  SettingsPanelInfo,
  ApiResponse,
  PaginatedResponse,
  CardFieldsResponse
} from '../src/types'

// 远程预设配置类型
export interface RemotePresetConfig {
  apiUrl: string
  autoSync: boolean
  syncInterval: number
  deleteRemoved: boolean
}

// ============ 画廊类型 ============

/** 画廊项目 */
export interface GalleryItem {
  id: number
  prompt: string
  images: string[]
  createdAt: Date
  channelId: number
}

/** 画廊响应 */
export interface GalleryResponse {
  items: GalleryItem[]
  total: number
  hasMore: boolean
}

/** 最近图片 */
export interface RecentImage {
  taskId: number
  url: string
  prompt: string
  createdAt: Date
}

// ============ 缓存类型 ============

/** 缓存文件信息 */
export interface CacheFileInfo {
  id: string
  url?: string
  filename: string
  mime: string
  size: number
  createdAt?: Date
  accessedAt?: Date
}

/** 缓存统计 */
export interface CacheStats {
  totalFiles: number
  totalSizeMB: number
  maxSizeMB: number
  oldestAccess: Date | null
  newestAccess: Date | null
}

// ============ 外部插件类型 ============

/** 外部插件信息 */
export interface ExternalPluginInfo {
  id: string
  moduleName: string
  name: string
}

// ============ 认证类型 ============

/** 当前用户信息 */
export interface CurrentUser {
  loggedIn: boolean
  source?: string
  uid?: number
  name?: string
  authority?: number
}

declare module '@koishijs/client' {
  interface Events {
    // 渠道
    'media-luna/channels/list': () => ApiResponse<ChannelConfig[]>
    'media-luna/channels/get': (params: { id: number }) => ApiResponse<ChannelConfig>
    'media-luna/channels/create': (params: Omit<ChannelConfig, 'id'>) => ApiResponse<ChannelConfig>
    'media-luna/channels/update': (params: { id: number, data: Partial<ChannelConfig> }) => ApiResponse<ChannelConfig>
    'media-luna/channels/delete': (params: { id: number }) => ApiResponse<void>
    'media-luna/channels/toggle': (params: { id: number, enabled: boolean }) => ApiResponse<void>
    'media-luna/channels/tags': () => ApiResponse<string[]>
    'media-luna/channels/by-tags': (params: { tags: string[], matchAll?: boolean }) => ApiResponse<ChannelConfig[]>

    // 预设
    'media-luna/presets/list': (params: { enabledOnly?: boolean }) => ApiResponse<PresetData[]>
    'media-luna/presets/get': (params: { id: number }) => ApiResponse<PresetData>
    'media-luna/presets/create': (params: Omit<PresetData, 'id'>) => ApiResponse<PresetData>
    'media-luna/presets/update': (params: { id: number, data: Partial<PresetData> }) => ApiResponse<PresetData>
    'media-luna/presets/delete': (params: { id: number }) => ApiResponse<void>
    'media-luna/presets/toggle': (params: { id: number, enabled: boolean }) => ApiResponse<void>
    'media-luna/presets/tags': () => ApiResponse<string[]>
    'media-luna/presets/by-tags': (params: { tags: string[], matchAll?: boolean }) => ApiResponse<PresetData[]>
    'media-luna/presets/matching': (params: { channelId: number }) => ApiResponse<PresetData[]>
    'media-luna/presets/copy': (params: { id: number }) => ApiResponse<PresetData>

    // 任务
    'media-luna/tasks/list': (params: { userId?: number, channelId?: number, status?: string, limit?: number, offset?: number }) => ApiResponse<PaginatedResponse<TaskData>>
    'media-luna/tasks/get': (params: { id: number }) => ApiResponse<TaskData>
    'media-luna/tasks/delete': (params: { id: number }) => ApiResponse<void>
    'media-luna/tasks/stats': (params: { channelId?: number }) => ApiResponse<TaskStats>
    'media-luna/tasks/cleanup': (params: { days?: number }) => ApiResponse<{ deleted: number, beforeDate: string }>
    'media-luna/tasks/recent': (params: { userId: number, limit?: number }) => ApiResponse<TaskData[]>

    // 连接器
    'media-luna/connectors/list': () => ApiResponse<{ id: string, name: string, supportedTypes: string[] }[]>
    'media-luna/connectors/get': (params: { id: string }) => ApiResponse<ConnectorDefinition>
    'media-luna/connectors/fields': (params: { id: string }) => ApiResponse<ConfigField[]>
    'media-luna/connectors/schema': () => ApiResponse<any[]>

    // 生成
    'media-luna/generate': (params: { channelId: number, prompt: string, files?: ClientFileData[], parameters?: any, userId?: number }) => ApiResponse<GenerationResult>
    'media-luna/generate/preview': (params: { channelId: number, prompt: string, parameters?: any }) => ApiResponse<{ channelName: string, connectorId: string, finalPrompt: string, parameters: any }>

    // 中间件
    'media-luna/middlewares/list': () => ApiResponse<MiddlewareInfo[]>
    'media-luna/middlewares/get': (params: { name: string }) => ApiResponse<MiddlewareInfo>
    'media-luna/middlewares/update': (params: { name: string, data: { enabled?: boolean, config?: any } }) => ApiResponse<void>
    'media-luna/middlewares/reset': (params: { name: string }) => ApiResponse<void>
    'media-luna/middlewares/execution-order': () => ApiResponse<any[]>
    'media-luna/middlewares/card-fields': () => ApiResponse<CardFieldsResponse>

    // 设置面板
    'media-luna/settings/panels': () => ApiResponse<SettingsPanelInfo[]>
    'media-luna/settings/get': (params: { id: string }) => ApiResponse<SettingsPanelInfo>
    'media-luna/settings/update': (params: { id: string, config: Record<string, any> }) => ApiResponse<void>
    'media-luna/settings/remote-presets/config': () => ApiResponse<RemotePresetConfig>
    'media-luna/settings/remote-presets/update': (params: { config: Partial<RemotePresetConfig> }) => ApiResponse<void>
    'media-luna/settings/remote-presets/sync': () => ApiResponse<{ added: number, updated: number, removed: number }>

    // 画廊
    'media-luna/gallery/my': (params?: { limit?: number, offset?: number, channelId?: number }) => ApiResponse<{
      items: Array<{ id: number, prompt: string, images: string[], createdAt: Date, channelId: number }>
      total: number
      hasMore: boolean
    }>
    'media-luna/gallery/recent-images': (params?: { limit?: number }) => ApiResponse<Array<{
      taskId: number
      url: string
      prompt: string
      createdAt: Date
    }>>
    'media-luna/gallery/user': (params: { uid: number, limit?: number, offset?: number, channelId?: number }) => ApiResponse<{
      items: Array<{ id: number, prompt: string, images: string[], createdAt: Date, channelId: number }>
      total: number
      hasMore: boolean
    }>

    // 用户任务
    'media-luna/tasks/my': (params?: { channelId?: number, status?: string, limit?: number, offset?: number }) => ApiResponse<PaginatedResponse<TaskData>>

    // 认证
    'media-luna/auth/me': () => ApiResponse<{ loggedIn: boolean, source?: string, uid?: number, name?: string, authority?: number }>
  }
}
