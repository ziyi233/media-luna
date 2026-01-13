// Koishi 模块扩展声明
import type { MediaLunaService } from './core/services/medialuna.service'
import type { ConnectorDefinition, MiddlewareDefinition } from './core/types'
import type Router from '@koa/router'

declare module 'koishi' {
  interface Context {
    mediaLuna: MediaLunaService
    router: Router
  }

  interface Events {
    'mediaLuna/connector-added': (connector: ConnectorDefinition) => void
    'mediaLuna/connector-removed': (connectorId: string) => void
    'mediaLuna/middleware-added': (middleware: MiddlewareDefinition) => void
    'mediaLuna/middleware-removed': (middlewareName: string) => void
    'mediaLuna/channel-updated': (channelId: number) => void
    'mediaLuna/middleware-config-updated': (middlewareName: string) => void
    'mediaLuna/plugin-loaded': (pluginId: string) => void
    'mediaLuna/plugin-unloaded': (pluginId: string) => void
    'mediaLuna/plugin-enabled': (pluginId: string) => void
    'mediaLuna/plugin-disabled': (pluginId: string) => void
  }

  interface Tables {
    medialuna_channel: MediaLunaChannel
    medialuna_preset: MediaLunaPreset
    medialuna_task: MediaLunaTask
    medialuna_asset_cache: MediaLunaAssetCache
  }
}

// 数据库表类型

export interface MediaLunaChannel {
  id: number
  name: string
  displayName: string
  enabled: boolean
  connectorId: string
  connectorConfig: string  // JSON
  pluginOverrides: string  // JSON
  tags: string  // JSON
  createdAt: Date
  updatedAt: Date
}

export interface MediaLunaPreset {
  id: number
  name: string
  displayName: string
  promptTemplate: string
  tags: string  // JSON
  referenceImages: string  // JSON - 缓存后的本地URL数组
  referenceImagesRemote: string  // JSON - 原始远程URL数组
  parameterOverrides: string  // JSON
  source: 'api' | 'user'
  enabled: boolean
  // 远程同步相关字段
  remoteId?: number
  remoteUrl?: string
  thumbnail?: string  // 缓存后的本地缩略图URL
  thumbnailRemote?: string  // 原始远程缩略图URL
  createdAt: Date
  updatedAt: Date
}

export interface MediaLunaTask {
  id: number
  uid: number | null  // Koishi user.id（可为空，表示匿名/未登录）
  channelId: number
  requestSnapshot: string  // JSON
  responseSnapshot: string | null  // JSON
  status: 'pending' | 'processing' | 'success' | 'failed'
  middlewareLogs: string  // JSON
  startTime: Date
  endTime: Date | null
  duration: number | null
  createdAt: Date
}

// 注意：MediaLunaMiddlewareConfig 和 MediaLunaConfig 已废弃
// 配置现在存储在 YAML 文件 (data/media-luna/config.yaml)

export interface MediaLunaAssetCache {
  id: number
  sourceUrl: string           // 原始 URL（对于 base64 存储为 'base64://...'）
  sourceHash: string          // 源标识的 hash
  contentHash: string         // 文件内容的 SHA256 hash（用于去重）
  backend: 'koishi' | 'local' | 's3' | 'webdav' | 'oss'
  cachedUrl: string           // 缓存后的访问 URL
  cachedKey: string           // 存储路径/key
  mimeType: string            // MIME 类型
  fileSize: number            // 文件大小（字节）
  createdAt: Date
  lastAccessedAt: Date        // 最后访问时间
}
