// 缓存插件配置字段定义 - 支持多存储方案

import type { ConfigField } from '../../core'

// ============ 存储方案配置 ============

/** 存储后端类型 */
export type StorageBackendType = 'local' | 's3' | 'webdav' | 'oss' | 'none'

/** 单个存储方案配置（用于额外方案） */
export interface StorageScheme {
  /** 方案名称（唯一标识） */
  name: string
  /** 存储类型 */
  type: Exclude<StorageBackendType, 'none'>

  // 本地存储配置
  /** 缓存目录路径（相对于 Koishi 根目录） */
  localDir?: string
  /** HTTP 路由路径 */
  localPublicPath?: string
  /** 外部访问 URL 前缀 */
  localPublicBaseUrl?: string

  // S3 配置
  s3Endpoint?: string
  s3Region?: string
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  s3Bucket?: string
  s3PublicBaseUrl?: string
  s3ForcePathStyle?: boolean
  s3Acl?: 'private' | 'public-read'

  // WebDAV 配置
  webdavEndpoint?: string
  webdavUsername?: string
  webdavPassword?: string
  webdavBasePath?: string
  webdavPublicBaseUrl?: string

  // 阿里云 OSS 配置
  ossEndpoint?: string
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  ossPublicBaseUrl?: string
  ossCname?: boolean
  ossAcl?: 'private' | 'public-read' | 'public-read-write'
}

// ============ 插件配置（兼容旧格式 + 多方案支持） ============

/** 本地存储相关配置 */
export interface LocalCacheConfig {
  /** 缓存目录 */
  cacheDir: string
  /** HTTP 路由路径 */
  publicPath: string
  /** 外部访问 URL 前缀 */
  publicBaseUrl?: string
}

/** 存储相关配置 */
export interface StorageConfig {
  /** 存储后端类型 */
  backend: StorageBackendType
  // S3 配置
  s3Endpoint?: string
  s3Region?: string
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  s3Bucket?: string
  s3PublicBaseUrl?: string
  s3ForcePathStyle?: boolean
  s3Acl?: 'private' | 'public-read'
  // WebDAV 配置
  webdavEndpoint?: string
  webdavUsername?: string
  webdavPassword?: string
  webdavBasePath?: string
  webdavPublicBaseUrl?: string
  // 阿里云 OSS 配置
  ossEndpoint?: string
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  ossPublicBaseUrl?: string
  ossCname?: boolean
  ossAcl?: 'private' | 'public-read' | 'public-read-write'
  // Immich 配置
  immichEndpoint?: string
  immichApiKey?: string
  immichDeviceId?: string
  immichAlbumId?: string
  immichPublicBaseUrl?: string
}

/** 完整缓存插件配置 */
export interface CachePluginConfig extends LocalCacheConfig, StorageConfig {
  /** 是否启用缓存 */
  enabled: boolean
  /** 最大缓存大小（MB）*/
  maxCacheSize: number
  /** 单个文件最大大小（MB） */
  maxFileSize: number
  /** 缓存过期时间（天），0 表示永不过期 */
  expireDays: number
  /** 默认使用的存储方案名称 */
  schemeName?: string
  /** 额外的本地存储方案 */
  localSchemes?: LocalSchemeRow[]
  /** 额外的 S3 存储方案 */
  s3Schemes?: S3SchemeRow[]
  /** 额外的 WebDAV 存储方案 */
  webdavSchemes?: WebdavSchemeRow[]
  /** 额外的阿里云 OSS 存储方案 */
  ossSchemes?: OSSSchemeRow[]
  /** @deprecated 旧的 schemes 字段，用于向后兼容 */
  schemes?: StorageScheme[]
}

/** 本地方案表格行 */
export interface LocalSchemeRow {
  name: string
  localDir?: string
  localPublicPath?: string
  localPublicBaseUrl?: string
}

/** S3 方案表格行 */
export interface S3SchemeRow {
  name: string
  s3Endpoint?: string
  s3Region?: string
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  s3Bucket?: string
  s3PublicBaseUrl?: string
  s3ForcePathStyle?: boolean
  s3Acl?: 'private' | 'public-read'
}

/** WebDAV 方案表格行 */
export interface WebdavSchemeRow {
  name: string
  webdavEndpoint?: string
  webdavUsername?: string
  webdavPassword?: string
  webdavBasePath?: string
  webdavPublicBaseUrl?: string
}

/** 阿里云 OSS 方案表格行 */
export interface OSSSchemeRow {
  name: string
  ossEndpoint?: string
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  ossPublicBaseUrl?: string
  ossCname?: boolean
  ossAcl?: 'private' | 'public-read' | 'public-read-write'
}

// ============ 配置字段定义 ============

/** 配置字段 */
export const cacheConfigFields: ConfigField[] = [
  // 基础配置
  {
    key: 'enabled',
    label: '启用缓存',
    type: 'boolean',
    default: true,
    description: '是否启用文件缓存功能'
  },
  {
    key: 'backend',
    label: '存储后端',
    type: 'select',
    default: 'local',
    description: '默认存储后端类型',
    options: [
      { label: '本地存储', value: 'local' },
      { label: 'S3 对象存储', value: 's3' },
      { label: '阿里云 OSS', value: 'oss' },
      { label: 'WebDAV', value: 'webdav' },
      { label: '不使用（仅临时）', value: 'none' }
    ]
  },
  {
    key: 'schemeName',
    label: '默认存储方案',
    type: 'text',
    default: '',
    description: '填写方案名以使用特定存储方案（留空使用默认后端配置，或填入下方表格中配置的方案名）'
  },
  // 本地存储配置
  {
    key: 'cacheDir',
    label: '缓存目录',
    type: 'text',
    default: 'data/media-luna/cache',
    description: '本地缓存目录路径（相对于 Koishi 根目录）',
    showWhen: { field: 'backend', value: 'local' }
  },
  {
    key: 'publicPath',
    label: 'HTTP 路由',
    type: 'text',
    default: '/media-luna/cache',
    description: '本地缓存的 HTTP 路由路径',
    showWhen: { field: 'backend', value: 'local' }
  },
  {
    key: 'publicBaseUrl',
    label: '外部访问 URL',
    type: 'text',
    default: '',
    description: '外部访问 URL 前缀（留空使用 selfUrl）',
    showWhen: { field: 'backend', value: 'local' }
  },
  // S3 配置
  {
    key: 's3Endpoint',
    label: 'S3 端点',
    type: 'text',
    default: '',
    description: 'S3 兼容服务端点 URL',
    showWhen: { field: 'backend', value: 's3' }
  },
  {
    key: 's3Region',
    label: 'S3 区域',
    type: 'text',
    default: 'auto',
    description: 'S3 区域（如 us-east-1）',
    showWhen: { field: 'backend', value: 's3' }
  },
  {
    key: 's3AccessKeyId',
    label: 'Access Key ID',
    type: 'text',
    default: '',
    description: 'S3 访问密钥 ID',
    showWhen: { field: 'backend', value: 's3' }
  },
  {
    key: 's3SecretAccessKey',
    label: 'Secret Access Key',
    type: 'text',
    default: '',
    description: 'S3 访问密钥',
    showWhen: { field: 'backend', value: 's3' }
  },
  {
    key: 's3Bucket',
    label: 'Bucket 名称',
    type: 'text',
    default: '',
    description: 'S3 存储桶名称',
    showWhen: { field: 'backend', value: 's3' }
  },
  {
    key: 's3PublicBaseUrl',
    label: '公开访问 URL',
    type: 'text',
    default: '',
    description: 'S3 公开访问 URL 前缀（用于生成可访问链接）',
    showWhen: { field: 'backend', value: 's3' }
  },
  {
    key: 's3ForcePathStyle',
    label: '强制路径风格',
    type: 'boolean',
    default: false,
    description: '使用路径风格而非虚拟主机风格（某些 S3 兼容服务需要）',
    showWhen: { field: 'backend', value: 's3' }
  },
  {
    key: 's3Acl',
    label: '访问控制',
    type: 'select',
    default: 'public-read',
    description: '上传文件的访问控制策略',
    options: [
      { label: '公开可读', value: 'public-read' },
      { label: '私有', value: 'private' }
    ],
    showWhen: { field: 'backend', value: 's3' }
  },
  // WebDAV 配置
  {
    key: 'webdavEndpoint',
    label: 'WebDAV 端点',
    type: 'text',
    default: '',
    description: 'WebDAV 服务端点 URL',
    showWhen: { field: 'backend', value: 'webdav' }
  },
  {
    key: 'webdavUsername',
    label: '用户名',
    type: 'text',
    default: '',
    description: 'WebDAV 认证用户名',
    showWhen: { field: 'backend', value: 'webdav' }
  },
  {
    key: 'webdavPassword',
    label: '密码',
    type: 'text',
    default: '',
    description: 'WebDAV 认证密码',
    showWhen: { field: 'backend', value: 'webdav' }
  },
  {
    key: 'webdavBasePath',
    label: '基础路径',
    type: 'text',
    default: '/media-luna',
    description: 'WebDAV 上的存储路径前缀',
    showWhen: { field: 'backend', value: 'webdav' }
  },
  {
    key: 'webdavPublicBaseUrl',
    label: '公开访问 URL',
    type: 'text',
    default: '',
    description: 'WebDAV 文件公开访问 URL 前缀',
    showWhen: { field: 'backend', value: 'webdav' }
  },
  // 阿里云 OSS 配置
  {
    key: 'ossEndpoint',
    label: 'OSS 端点',
    type: 'text',
    default: '',
    description: 'OSS 服务端点（如 oss-cn-hangzhou.aliyuncs.com）',
    showWhen: { field: 'backend', value: 'oss' }
  },
  {
    key: 'ossAccessKeyId',
    label: 'AccessKey ID',
    type: 'text',
    default: '',
    description: '阿里云 AccessKey ID',
    showWhen: { field: 'backend', value: 'oss' }
  },
  {
    key: 'ossAccessKeySecret',
    label: 'AccessKey Secret',
    type: 'text',
    default: '',
    description: '阿里云 AccessKey Secret',
    showWhen: { field: 'backend', value: 'oss' }
  },
  {
    key: 'ossBucket',
    label: 'Bucket 名称',
    type: 'text',
    default: '',
    description: 'OSS 存储桶名称',
    showWhen: { field: 'backend', value: 'oss' }
  },
  {
    key: 'ossPublicBaseUrl',
    label: '公开访问 URL',
    type: 'text',
    default: '',
    description: 'OSS 公开访问 URL 前缀（用于生成可访问链接，如 CDN 域名）',
    showWhen: { field: 'backend', value: 'oss' }
  },
  {
    key: 'ossCname',
    label: '使用自定义域名',
    type: 'boolean',
    default: false,
    description: '是否使用自定义域名（CNAME）模式',
    showWhen: { field: 'backend', value: 'oss' }
  },
  {
    key: 'ossAcl',
    label: '访问控制',
    type: 'select',
    default: 'public-read',
    description: '上传文件的访问控制策略',
    options: [
      { label: '公开可读', value: 'public-read' },
      { label: '公开读写', value: 'public-read-write' },
      { label: '私有', value: 'private' }
    ],
    showWhen: { field: 'backend', value: 'oss' }
  },
  // 通用配置
  {
    key: 'maxCacheSize',
    label: '最大缓存大小',
    type: 'number',
    default: 500,
    description: '本地缓存最大占用空间（MB）'
  },
  {
    key: 'maxFileSize',
    label: '单文件大小限制',
    type: 'number',
    default: 50,
    description: '单个文件最大大小（MB）'
  },
  {
    key: 'expireDays',
    label: '缓存过期时间',
    type: 'number',
    default: 30,
    description: '缓存过期时间（天），0 表示永不过期'
  },
  // 额外的本地存储方案
  {
    key: 'localSchemes',
    label: '本地存储方案',
    type: 'table',
    default: [],
    description: '配置额外的本地存储方案，可在中间件中通过方案名选择使用',
    columns: [
      { key: 'name', label: '方案名', type: 'text', required: true, width: '100px', placeholder: '如: backup' },
      { key: 'localDir', label: '缓存目录', type: 'text', placeholder: 'data/media-luna/cache2' },
      { key: 'localPublicPath', label: 'HTTP路由', type: 'text', placeholder: '/media-luna/cache2' },
      { key: 'localPublicBaseUrl', label: '外部URL', type: 'text', placeholder: 'https://cdn.example.com' }
    ]
  },
  // 额外的 S3 存储方案
  {
    key: 's3Schemes',
    label: 'S3 存储方案',
    type: 'table',
    default: [],
    description: '配置额外的 S3 存储方案，可在中间件中通过方案名选择使用',
    columns: [
      { key: 'name', label: '方案名', type: 'text', required: true, width: '80px', placeholder: '如: nsfw' },
      { key: 's3Endpoint', label: '端点', type: 'text', required: true, placeholder: 'https://s3.example.com' },
      { key: 's3Bucket', label: 'Bucket', type: 'text', required: true, placeholder: 'my-bucket' },
      { key: 's3AccessKeyId', label: 'AccessKey', type: 'text', required: true },
      { key: 's3SecretAccessKey', label: 'SecretKey', type: 'text', required: true },
      { key: 's3PublicBaseUrl', label: '公开URL', type: 'text', placeholder: 'https://cdn.example.com' },
      { key: 's3Region', label: '区域', type: 'text', placeholder: 'auto' }
    ]
  },
  // 额外的 WebDAV 存储方案
  {
    key: 'webdavSchemes',
    label: 'WebDAV 存储方案',
    type: 'table',
    default: [],
    description: '配置额外的 WebDAV 存储方案，可在中间件中通过方案名选择使用',
    columns: [
      { key: 'name', label: '方案名', type: 'text', required: true, width: '80px', placeholder: '如: backup' },
      { key: 'webdavEndpoint', label: '端点', type: 'text', required: true, placeholder: 'https://dav.example.com' },
      { key: 'webdavUsername', label: '用户名', type: 'text', required: true },
      { key: 'webdavPassword', label: '密码', type: 'text', required: true },
      { key: 'webdavBasePath', label: '基础路径', type: 'text', placeholder: '/media-luna' },
      { key: 'webdavPublicBaseUrl', label: '公开URL', type: 'text', placeholder: 'https://cdn.example.com' }
    ]
  },
  // 额外的阿里云 OSS 存储方案
  {
    key: 'ossSchemes',
    label: '阿里云 OSS 存储方案',
    type: 'table',
    default: [],
    description: '配置额外的阿里云 OSS 存储方案，可在中间件中通过方案名选择使用',
    columns: [
      { key: 'name', label: '方案名', type: 'text', required: true, width: '80px', placeholder: '如: images' },
      { key: 'ossEndpoint', label: '端点', type: 'text', required: true, placeholder: 'oss-cn-hangzhou.aliyuncs.com' },
      { key: 'ossBucket', label: 'Bucket', type: 'text', required: true, placeholder: 'my-bucket' },
      { key: 'ossAccessKeyId', label: 'AccessKey ID', type: 'text', required: true },
      { key: 'ossAccessKeySecret', label: 'AccessKey Secret', type: 'text', required: true },
      { key: 'ossPublicBaseUrl', label: '公开URL', type: 'text', placeholder: 'https://cdn.example.com' }
    ]
  }
]

/** 默认配置 */
export const defaultCacheConfig: CachePluginConfig = {
  enabled: true,
  backend: 'local',
  cacheDir: 'data/media-luna/cache',
  publicPath: '/media-luna/cache',
  maxCacheSize: 500,
  maxFileSize: 50,
  expireDays: 30
}

// ============ 辅助函数 ============

/**
 * 从配置中获取所有存储方案
 * 合并三个表格（localSchemes, s3Schemes, webdavSchemes）以及旧的 schemes 字段
 */
export function getAllSchemes(config: CachePluginConfig): StorageScheme[] {
  const schemes: StorageScheme[] = []

  // 从 localSchemes 表格转换
  if (config.localSchemes && Array.isArray(config.localSchemes)) {
    for (const row of config.localSchemes) {
      if (row.name) {
        schemes.push({
          name: row.name,
          type: 'local',
          localDir: row.localDir,
          localPublicPath: row.localPublicPath,
          localPublicBaseUrl: row.localPublicBaseUrl
        })
      }
    }
  }

  // 从 s3Schemes 表格转换
  if (config.s3Schemes && Array.isArray(config.s3Schemes)) {
    for (const row of config.s3Schemes) {
      if (row.name) {
        schemes.push({
          name: row.name,
          type: 's3',
          s3Endpoint: row.s3Endpoint,
          s3Region: row.s3Region,
          s3AccessKeyId: row.s3AccessKeyId,
          s3SecretAccessKey: row.s3SecretAccessKey,
          s3Bucket: row.s3Bucket,
          s3PublicBaseUrl: row.s3PublicBaseUrl,
          s3ForcePathStyle: row.s3ForcePathStyle,
          s3Acl: row.s3Acl
        })
      }
    }
  }

  // 从 webdavSchemes 表格转换
  if (config.webdavSchemes && Array.isArray(config.webdavSchemes)) {
    for (const row of config.webdavSchemes) {
      if (row.name) {
        schemes.push({
          name: row.name,
          type: 'webdav',
          webdavEndpoint: row.webdavEndpoint,
          webdavUsername: row.webdavUsername,
          webdavPassword: row.webdavPassword,
          webdavBasePath: row.webdavBasePath,
          webdavPublicBaseUrl: row.webdavPublicBaseUrl
        })
      }
    }
  }

  // 从 ossSchemes 表格转换
  if (config.ossSchemes && Array.isArray(config.ossSchemes)) {
    for (const row of config.ossSchemes) {
      if (row.name) {
        schemes.push({
          name: row.name,
          type: 'oss',
          ossEndpoint: row.ossEndpoint,
          ossRegion: row.ossRegion,
          ossAccessKeyId: row.ossAccessKeyId,
          ossAccessKeySecret: row.ossAccessKeySecret,
          ossBucket: row.ossBucket,
          ossPublicBaseUrl: row.ossPublicBaseUrl,
          ossCname: row.ossCname,
          ossAcl: row.ossAcl
        })
      }
    }
  }

  // 兼容旧的 schemes 字段
  const legacySchemes = parseSchemes(config.schemes)
  for (const scheme of legacySchemes) {
    // 避免重复名称
    if (scheme.name && !schemes.some(s => s.name === scheme.name)) {
      schemes.push(scheme)
    }
  }

  return schemes
}

/**
 * 解析 schemes 配置（向后兼容）
 * 支持 JSON 字符串格式或直接的数组
 */
export function parseSchemes(schemes: string | StorageScheme[] | undefined): StorageScheme[] {
  if (!schemes) return []
  if (Array.isArray(schemes)) return schemes

  try {
    const parsed = JSON.parse(schemes)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * 从 scheme 生成存储配置
 */
export function schemeToStorageConfig(scheme: StorageScheme): Partial<StorageConfig & LocalCacheConfig> {
  switch (scheme.type) {
    case 'local':
      return {
        backend: 'local',
        cacheDir: scheme.localDir || 'data/media-luna/cache',
        publicPath: scheme.localPublicPath || '/media-luna/cache',
        publicBaseUrl: scheme.localPublicBaseUrl
      }
    case 's3':
      return {
        backend: 's3',
        s3Endpoint: scheme.s3Endpoint,
        s3Region: scheme.s3Region,
        s3AccessKeyId: scheme.s3AccessKeyId,
        s3SecretAccessKey: scheme.s3SecretAccessKey,
        s3Bucket: scheme.s3Bucket,
        s3PublicBaseUrl: scheme.s3PublicBaseUrl,
        s3ForcePathStyle: scheme.s3ForcePathStyle,
        s3Acl: scheme.s3Acl
      }
    case 'webdav':
      return {
        backend: 'webdav',
        webdavEndpoint: scheme.webdavEndpoint,
        webdavUsername: scheme.webdavUsername,
        webdavPassword: scheme.webdavPassword,
        webdavBasePath: scheme.webdavBasePath,
        webdavPublicBaseUrl: scheme.webdavPublicBaseUrl
      }
    case 'oss':
      return {
        backend: 'oss',
        ossEndpoint: scheme.ossEndpoint,
        ossRegion: scheme.ossRegion,
        ossAccessKeyId: scheme.ossAccessKeyId,
        ossAccessKeySecret: scheme.ossAccessKeySecret,
        ossBucket: scheme.ossBucket,
        ossPublicBaseUrl: scheme.ossPublicBaseUrl,
        ossCname: scheme.ossCname,
        ossAcl: scheme.ossAcl
      }
  }
}

/** 获取所有可用的存储方案名称（包括默认） */
export function getAvailableSchemeNames(config: CachePluginConfig): string[] {
  const names = ['default']
  const schemes = parseSchemes(config.schemes)
  for (const scheme of schemes) {
    if (scheme.name && !names.includes(scheme.name)) {
      names.push(scheme.name)
    }
  }
  return names
}
