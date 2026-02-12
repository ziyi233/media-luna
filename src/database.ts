// Media Luna 数据库定义

import { Context } from 'koishi'

// 类型声明移至 types/augmentations.d.ts

/**
 * 扩展数据库
 */
export function extendDatabase(ctx: Context): void {
  // 渠道表
  ctx.database.extend('medialuna_channel', {
    id: 'unsigned',
    name: 'string',
    displayName: 'string',
    enabled: 'boolean',
    connectorId: 'string',
    connectorConfig: 'text',
    pluginOverrides: 'text',
    tags: 'text',
    createdAt: 'timestamp',
    updatedAt: 'timestamp'
  }, {
    autoInc: true,
    unique: ['name']
  })

  // 预设表
  ctx.database.extend('medialuna_preset', {
    id: 'unsigned',
    name: 'string',
    displayName: 'string',
    promptTemplate: 'text',
    tags: 'text',
    referenceImages: 'text',
    referenceImagesRemote: 'text',  // 原始远程图片URL（JSON数组）
    parameterOverrides: 'text',
    source: 'string',
    enabled: 'boolean',
    // 远程同步相关字段
    remoteId: 'unsigned',           // 远程模板 ID（用于同步更新）
    remoteUrl: 'string',            // 远程 API URL（区分数据源）
    thumbnail: 'string',            // 缓存后的缩略图 URL
    thumbnailRemote: 'string',      // 原始远程缩略图 URL
    createdAt: 'timestamp',
    updatedAt: 'timestamp'
  }, {
    autoInc: true,
    unique: ['name']
  })

  // 任务表
  // uid 直接使用 Koishi 的 user.id，通过 session.uid 或 WebUI 登录获取
  ctx.database.extend('medialuna_task', {
    id: 'unsigned',
    uid: 'unsigned',                // Koishi user.id（可为空，表示匿名/未登录）
    channelId: 'unsigned',
    requestSnapshot: 'text',
    responseSnapshot: 'text',
    status: 'string',
    middlewareLogs: 'text',
    startTime: 'timestamp',
    endTime: 'timestamp',
    duration: 'unsigned',
    createdAt: 'timestamp'
  }, {
    autoInc: true,
    indexes: [
      'uid',
      'channelId',
      'status',
      'createdAt',
      ['channelId', 'status'],  // 按渠道+状态的组合查询
      ['uid', 'status'],        // 按用户+状态的组合查询
    ]
  })

  // 注意：中间件配置和通用配置已迁移到 YAML 配置文件
  // 配置存储在 data/media-luna/config.yaml
  // - middlewares: 中间件启用状态和配置
  // - remote-presets: 远程预设同步配置
  // - plugins: 插件配置

  // 资源缓存表（用于缓存外部图片/文件到本地或对象存储）
  // 支持两级缓存查找：
  // 1. sourceHash: 快速查找同一源 URL（避免重复下载）
  // 2. contentHash: 内容去重（不同 URL 相同内容只存储一份文件）
  ctx.database.extend('medialuna_asset_cache', {
    id: 'unsigned',
    sourceUrl: 'text',              // 原始 URL（对于 base64 存储为 'base64://...'）
    sourceHash: 'string',           // 源标识的 hash（用于快速查找同一来源）
    contentHash: 'string',          // 文件内容的 SHA256 hash（用于去重相同内容）
    backend: 'string',              // 存储后端: 'local' | 's3' | 'webdav'
    cachedUrl: 'text',              // 缓存后的访问 URL
    cachedKey: 'string',            // 存储路径/key
    mimeType: 'string',             // MIME 类型
    fileSize: 'unsigned',           // 文件大小（字节）
    createdAt: 'timestamp',
    lastAccessedAt: 'timestamp'     // 最后访问时间（用于 LRU 清理）
  }, {
    autoInc: true,
    unique: ['sourceHash']          // 按源 URL 去重（同一 URL 只有一条记录）
  })
}
