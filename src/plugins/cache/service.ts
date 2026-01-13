// 统一存储服务 - 支持本地/S3/WebDAV/OSS 多后端
// 根据配置的 backend 自动选择存储方式

import { Context } from 'koishi'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { PluginLogger } from '../../core'
import { createPluginLogger } from '../../core'
import type { CachePluginConfig, StorageScheme } from './config'
import { getAllSchemes, schemeToStorageConfig } from './config'
import type { MediaLunaAssetCache } from '../../augmentations'
import { uploadToS3, deleteFromS3, type S3Config } from './utils/s3'
import { uploadToWebDav, type WebDavConfig } from './utils/webdav'
import { uploadToOSS, deleteFromOSS, type OSSConfig } from './utils/oss'
import { getExtensionFromMime } from './utils/mime'

/** 缓存文件元数据 */
export interface CachedFile {
  id: string
  filename: string
  mime: string
  size: number
  createdAt: Date
  accessedAt: Date
  localPath: string
  /** 可访问的 URL */
  url?: string
  /** 存储后端 */
  backend?: string
}

/** 缓存统计 */
export interface CacheStats {
  totalFiles: number
  totalSizeMB: number
  maxSizeMB: number
  oldestAccess: Date | null
  newestAccess: Date | null
  backend: string
}

/**
 * 统一存储服务
 * 根据配置的 backend 自动选择存储方式（local/s3/webdav）
 */
export class CacheService {
  private logger: PluginLogger
  private ctx: Context
  private cacheRoot: string
  private publicPath: string
  private publicBaseUrl: string | null
  private config: CachePluginConfig
  /** 基础URL（从 selfUrl 获取），用于生成本地访问链接 */
  private baseUrl: string = ''
  /** 内存缓存（加速查询） */
  private memoryCache: Map<string, CachedFile> = new Map()
  /** 是否已初始化 */
  private initialized: boolean = false

  constructor(ctx: Context, config: CachePluginConfig) {
    this.ctx = ctx
    this.logger = createPluginLogger(ctx.logger('media-luna'), 'cache')
    this.config = config

    // 本地缓存目录（即使使用 S3/WebDAV，也可能需要临时存储）
    this.cacheRoot = path.join(ctx.baseDir, config.cacheDir || 'data/media-luna/cache')
    this.publicPath = config.publicPath || '/media-luna/cache'
    this.publicBaseUrl = config.publicBaseUrl?.replace(/\/$/, '') || null

    this.ensureDir(this.cacheRoot)

    // 异步初始化
    this.initialize().catch(e => {
      this.logger.error('Failed to initialize cache service: %s', e)
    })

    this.logger.info('Cache service initialized, backend: %s', config.backend || 'local')
  }

  /** 异步初始化 */
  private async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // 从数据库加载到内存缓存
      await this.loadFromDatabase()
      // 清理过期缓存（仅本地模式）
      if (this.config.backend === 'local' || !this.config.backend) {
        await this.cleanupExpired()
      }
      this.initialized = true
    } catch (e) {
      this.logger.error('Cache initialization failed: %s', e)
    }
  }

  /** 从数据库加载缓存元数据到内存 */
  private async loadFromDatabase(): Promise<void> {
    try {
      const records = await this.ctx.database.get('medialuna_asset_cache', {})
      for (const record of records) {
        const localPath = path.join(this.cacheRoot, record.cachedKey)
        this.memoryCache.set(record.contentHash, {
          id: record.contentHash,
          filename: path.basename(record.cachedKey),
          mime: record.mimeType,
          size: record.fileSize,
          createdAt: record.createdAt,
          accessedAt: record.lastAccessedAt,
          localPath,
          url: record.cachedUrl,
          backend: record.backend
        })
      }
      this.logger.debug('Loaded %d cache entries from database', records.length)
    } catch (e) {
      this.logger.warn('Failed to load cache from database: %s', e)
    }
  }

  /** 更新配置 */
  updateConfig(config: Partial<CachePluginConfig>): void {
    this.config = { ...this.config, ...config }
    this.logger.info('Cache config updated, backend: %s', this.config.backend || 'local')
  }

  /** 设置基础URL */
  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '')
    this.logger.debug('Base URL set to: %s', this.baseUrl)
  }

  /** 获取基础URL */
  getBaseUrl(): string {
    return this.baseUrl
  }

  /** 检查缓存是否启用 */
  isEnabled(): boolean {
    return this.config.enabled && this.config.backend !== 'none'
  }

  /** 获取当前后端类型 */
  getBackend(): string {
    return this.config.backend || 'local'
  }

  /** 获取完整配置 */
  getConfig(): CachePluginConfig {
    return this.config
  }

  /**
   * 获取指定方案的配置
   * @param schemeName 方案名称，'default' 或 undefined 返回默认配置
   */
  getSchemeConfig(schemeName?: string): CachePluginConfig {
    if (!schemeName || schemeName === 'default') {
      return this.config
    }

    const schemes = getAllSchemes(this.config)
    const scheme = schemes.find(s => s.name === schemeName)
    if (!scheme) {
      this.logger.warn('Storage scheme not found: %s, using default', schemeName)
      return this.config
    }

    // 合并方案配置到当前配置
    const schemeConfig = schemeToStorageConfig(scheme)
    return { ...this.config, ...schemeConfig }
  }

  /**
   * 获取指定方案对应的后端类型
   */
  getSchemeBackend(schemeName?: string): string {
    const config = this.getSchemeConfig(schemeName)
    return config.backend || 'local'
  }

  /**
   * 获取所有可用的方案名称
   */
  getAvailableSchemes(): string[] {
    const names = ['default']
    const schemes = getAllSchemes(this.config)
    for (const scheme of schemes) {
      if (scheme.name && !names.includes(scheme.name)) {
        names.push(scheme.name)
      }
    }
    return names
  }

  /** 转换为 S3 配置 */
  private toS3Config(config?: CachePluginConfig): S3Config {
    const cfg = config || this.config
    return {
      endpoint: cfg.s3Endpoint,
      region: cfg.s3Region,
      accessKeyId: cfg.s3AccessKeyId,
      secretAccessKey: cfg.s3SecretAccessKey,
      bucket: cfg.s3Bucket,
      publicBaseUrl: cfg.s3PublicBaseUrl,
      forcePathStyle: cfg.s3ForcePathStyle,
      acl: cfg.s3Acl
    }
  }

  /** 转换为 WebDAV 配置 */
  private toWebDavConfig(config?: CachePluginConfig): WebDavConfig {
    const cfg = config || this.config
    return {
      endpoint: cfg.webdavEndpoint,
      username: cfg.webdavUsername,
      password: cfg.webdavPassword,
      basePath: cfg.webdavBasePath,
      publicBaseUrl: cfg.webdavPublicBaseUrl
    }
  }

  /** 转换为阿里云 OSS 配置 */
  private toOSSConfig(config?: CachePluginConfig): OSSConfig {
    const cfg = config || this.config
    return {
      endpoint: cfg.ossEndpoint,
      region: cfg.ossRegion,
      accessKeyId: cfg.ossAccessKeyId,
      accessKeySecret: cfg.ossAccessKeySecret,
      bucket: cfg.ossBucket,
      publicBaseUrl: cfg.ossPublicBaseUrl,
      cname: cfg.ossCname,
      acl: cfg.ossAcl
    }
  }

  /**
   * 缓存文件
   * 根据配置的后端自动选择存储方式
   * @param schemeName 可选的存储方案名称，用于选择特定的存储后端
   */
  async cache(data: Buffer | ArrayBuffer, mime: string, filename?: string, sourceUrl?: string, schemeName?: string): Promise<CachedFile> {
    // 获取指定方案的配置
    const effectiveConfig = this.getSchemeConfig(schemeName)

    if (!effectiveConfig.enabled) {
      throw new Error('Cache is disabled')
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
    const backend = effectiveConfig.backend || 'local'

    // 检查文件大小（仅本地模式限制）
    if (backend === 'local') {
      const sizeMB = buffer.length / (1024 * 1024)
      if (sizeMB > effectiveConfig.maxFileSize) {
        throw new Error(`File too large: ${sizeMB.toFixed(2)}MB > ${effectiveConfig.maxFileSize}MB`)
      }
    }

    // 计算内容哈希
    const contentHash = this.generateContentHash(buffer)

    // 检查是否已有相同内容的缓存
    const existingByContent = await this.findByContentHash(contentHash)
    if (existingByContent) {
      // 检查后端是否一致，不一致则需要重新存储
      if (existingByContent.backend === backend) {
        await this.updateAccessTime(existingByContent.contentHash)
        this.logger.debug('Cache hit by content hash: %s', contentHash)
        return this.dbRecordToCachedFile(existingByContent)
      } else {
        // 后端不一致，删除旧记录后重新缓存
        this.logger.debug('Backend changed (%s -> %s), re-caching: %s', existingByContent.backend, backend, contentHash)
        await this.delete(existingByContent.contentHash)
      }
    }

    // 根据后端存储文件
    const ext = this.getExtension(mime, filename)
    const storageKey = `${contentHash}${ext}`
    let cachedUrl: string

    switch (backend) {
      case 'local':
        cachedUrl = await this.storeLocal(buffer, storageKey, contentHash, ext, effectiveConfig)
        break
      case 's3':
        cachedUrl = await this.storeS3(buffer, storageKey, mime, effectiveConfig)
        break
      case 'webdav':
        cachedUrl = await this.storeWebDav(buffer, storageKey, mime, effectiveConfig)
        break
      case 'oss':
        cachedUrl = await this.storeOSS(buffer, storageKey, mime, effectiveConfig)
        break
      case 'none':
        throw new Error('Storage backend is set to none')
      default:
        throw new Error(`Unknown storage backend: ${backend}`)
    }

    // 计算源哈希（如果有源 URL）
    const sourceHash = sourceUrl ? this.generateSourceHash(sourceUrl) : contentHash

    // 保存到数据库
    const now = new Date()
    await this.ctx.database.create('medialuna_asset_cache', {
      sourceUrl: sourceUrl || '',
      sourceHash,
      contentHash,
      backend,
      cachedUrl,
      cachedKey: storageKey,
      mimeType: mime,
      fileSize: buffer.length,
      createdAt: now,
      lastAccessedAt: now
    })

    const cached: CachedFile = {
      id: contentHash,
      filename: filename || `file${ext}`,
      mime,
      size: buffer.length,
      createdAt: now,
      accessedAt: now,
      localPath: path.join(this.cacheRoot, storageKey),
      url: cachedUrl,
      backend
    }

    // 更新内存缓存
    this.memoryCache.set(contentHash, cached)

    this.logger.debug('Cached file to %s: %s', backend, contentHash)
    return cached
  }

  /** 存储到本地 */
  private async storeLocal(buffer: Buffer, storageKey: string, contentHash: string, ext: string, config?: CachePluginConfig): Promise<string> {
    // 确保有足够空间
    await this.ensureCacheSpace(buffer.length)

    // 使用指定配置的目录（如果提供）
    const cacheDir = config?.cacheDir || this.config.cacheDir
    const cacheRoot = path.join(this.ctx.baseDir, cacheDir || 'data/media-luna/cache')
    this.ensureDir(cacheRoot)

    const localPath = path.join(cacheRoot, storageKey)
    fs.writeFileSync(localPath, buffer)

    return this.buildLocalUrl(contentHash, ext, config)
  }

  /** 存储到 S3 */
  private async storeS3(buffer: Buffer, storageKey: string, mime: string, config?: CachePluginConfig): Promise<string> {
    const s3Config = this.toS3Config(config)

    if (!s3Config.bucket) throw new Error('S3 缺少 bucket 配置')
    if (!s3Config.accessKeyId || !s3Config.secretAccessKey) throw new Error('S3 需提供访问凭证')

    const result = await uploadToS3(buffer, storageKey, mime, s3Config)
    return result.url
  }

  /** 存储到 WebDAV */
  private async storeWebDav(buffer: Buffer, storageKey: string, mime: string, config?: CachePluginConfig): Promise<string> {
    const webdavConfig = this.toWebDavConfig(config)

    if (!webdavConfig.endpoint) throw new Error('WebDAV 缺少端点配置')
    if (!webdavConfig.username || !webdavConfig.password) throw new Error('WebDAV 需提供用户名和密码')

    const result = await uploadToWebDav(buffer, storageKey, mime, webdavConfig)
    return result.url
  }

  /** 存储到阿里云 OSS */
  private async storeOSS(buffer: Buffer, storageKey: string, mime: string, config?: CachePluginConfig): Promise<string> {
    const ossConfig = this.toOSSConfig(config)

    if (!ossConfig.bucket) throw new Error('OSS 缺少 bucket 配置')
    if (!ossConfig.accessKeyId || !ossConfig.accessKeySecret) throw new Error('OSS 需提供 AccessKey ID 和 Secret')
    if (!ossConfig.endpoint) throw new Error('OSS 缺少端点配置')

    const result = await uploadToOSS(buffer, storageKey, mime, ossConfig)
    return result.url
  }

  /**
   * 从 URL 下载并缓存
   */
  async cacheFromUrl(url: string): Promise<CachedFile> {
    const currentBackend = this.config.backend || 'local'

    // 先检查是否已有相同源 URL 的缓存
    const sourceHash = this.generateSourceHash(url)
    const existingBySource = await this.findBySourceHash(sourceHash)
    if (existingBySource) {
      // 检查后端是否一致，不一致则需要重新存储
      if (existingBySource.backend === currentBackend) {
        await this.updateAccessTime(existingBySource.contentHash)
        this.logger.debug('Cache hit by source hash: %s -> %s', url, sourceHash)
        return this.dbRecordToCachedFile(existingBySource)
      } else {
        // 后端不一致，删除旧记录后重新缓存
        this.logger.debug('Backend changed (%s -> %s), re-caching: %s', existingBySource.backend, currentBackend, url)
        await this.delete(existingBySource.contentHash)
      }
    }

    // 下载文件
    const response = await this.ctx.http.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer'
    })

    const mime = this.guessMimeFromUrl(url)
    const filename = url.split('/').pop()?.split('?')[0] || 'downloaded'

    return this.cache(response, mime, filename, url)
  }

  /** 获取缓存文件信息 */
  async get(id: string): Promise<CachedFile | null> {
    let cached = this.memoryCache.get(id)

    if (!cached) {
      const record = await this.findByContentHash(id)
      if (!record) return null
      cached = this.dbRecordToCachedFile(record)
      this.memoryCache.set(id, cached)
    }

    // 如果是本地存储，检查文件是否存在
    if (cached.backend === 'local' || !cached.backend) {
      if (!fs.existsSync(cached.localPath)) {
        await this.deleteFromDatabase(id)
        this.memoryCache.delete(id)
        return null
      }
    }

    await this.updateAccessTime(id)
    cached.accessedAt = new Date()

    return cached
  }

  /** 读取缓存文件内容（仅本地存储可用） */
  async read(id: string): Promise<Buffer | null> {
    const cached = await this.get(id)
    if (!cached) return null

    // 只有本地存储可以直接读取
    if (cached.backend !== 'local' && cached.backend) {
      this.logger.warn('Cannot read non-local cache: %s (backend: %s)', id, cached.backend)
      return null
    }

    try {
      return fs.readFileSync(cached.localPath)
    } catch (e) {
      this.logger.warn('Failed to read cached file: %s', id)
      return null
    }
  }

  /** 读取为 Data URL（仅本地存储可用） */
  async readAsDataUrl(id: string): Promise<string | null> {
    const cached = await this.get(id)
    if (!cached) return null

    const buffer = await this.read(id)
    if (!buffer) return null

    return `data:${cached.mime};base64,${buffer.toString('base64')}`
  }

  /** 删除缓存文件 */
  async delete(id: string): Promise<boolean> {
    const cached = this.memoryCache.get(id)
    if (!cached) {
      const record = await this.findByContentHash(id)
      if (record) {
        await this.deleteFromBackend(record.cachedKey, record.backend)
        await this.deleteFromDatabase(id)
      }
      return true
    }

    try {
      await this.deleteFromBackend(cached.filename, cached.backend || 'local')
      await this.deleteFromDatabase(id)
      this.memoryCache.delete(id)
      return true
    } catch (e) {
      this.logger.warn('Failed to delete cached file: %s', id)
      return false
    }
  }

  /** 从后端删除文件 */
  private async deleteFromBackend(key: string, backend: string): Promise<void> {
    switch (backend) {
      case 'local':
        const localPath = path.join(this.cacheRoot, key)
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath)
        }
        break
      case 's3':
        try {
          await deleteFromS3(key, this.toS3Config())
        } catch (e) {
          this.logger.warn('Failed to delete from S3: %s', e)
        }
        break
      case 'webdav':
        try {
          await this.deleteFromWebDav(key)
        } catch (e) {
          this.logger.warn('Failed to delete from WebDAV: %s', e)
        }
        break
      case 'oss':
        try {
          await deleteFromOSS(key, this.toOSSConfig())
        } catch (e) {
          this.logger.warn('Failed to delete from OSS: %s', e)
        }
        break
    }
  }

  /** 从 WebDAV 删除 */
  private async deleteFromWebDav(key: string): Promise<void> {
    const config = this.toWebDavConfig()
    const remotePath = config.basePath
      ? `${config.basePath.replace(/\/+$/, '')}/${key}`
      : key
    const url = `${config.endpoint!.replace(/\/+$/, '')}/${remotePath.split('/').map(encodeURIComponent).join('/')}`

    const auth = Buffer.from(`${config.username}:${config.password}`, 'utf8').toString('base64')

    await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` }
    })
  }

  /** 获取统计信息 */
  async getStats(): Promise<CacheStats> {
    const records = await this.ctx.database.get('medialuna_asset_cache', {})

    let oldest: Date | null = null
    let newest: Date | null = null
    let totalSize = 0

    for (const record of records) {
      totalSize += record.fileSize
      if (!oldest || record.lastAccessedAt < oldest) oldest = record.lastAccessedAt
      if (!newest || record.lastAccessedAt > newest) newest = record.lastAccessedAt
    }

    return {
      totalFiles: records.length,
      totalSizeMB: totalSize / (1024 * 1024),
      maxSizeMB: this.config.maxCacheSize,
      oldestAccess: oldest,
      newestAccess: newest,
      backend: this.config.backend || 'local'
    }
  }

  /** 清空所有缓存 */
  async clearAll(): Promise<void> {
    const records = await this.ctx.database.get('medialuna_asset_cache', {})

    for (const record of records) {
      await this.deleteFromBackend(record.cachedKey, record.backend)
    }

    await this.ctx.database.remove('medialuna_asset_cache', {})
    this.memoryCache.clear()

    this.logger.info('All cache cleared')
  }

  /**
   * 测试存储连接
   */
  async testConnection(): Promise<{ success: boolean; message: string; url?: string; duration?: number }> {
    const backend = this.config.backend || 'local'

    if (backend === 'none') {
      return { success: true, message: '存储后端设置为"不使用"，无需测试' }
    }

    const testContent = `Media Luna Storage Test - ${new Date().toISOString()}`
    const testBuffer = Buffer.from(testContent, 'utf-8')
    const testFilename = `_test-${Date.now()}.txt`
    const testMime = 'text/plain'

    const startTime = Date.now()

    try {
      const cached = await this.cache(testBuffer, testMime, testFilename)
      const duration = Date.now() - startTime

      // 清理测试文件
      await this.delete(cached.id)

      return {
        success: true,
        message: `存储连接测试成功（耗时 ${duration}ms）`,
        url: cached.url,
        duration
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // ========== 数据库操作方法 ==========

  private async findBySourceHash(sourceHash: string): Promise<MediaLunaAssetCache | null> {
    const records = await this.ctx.database.get('medialuna_asset_cache', { sourceHash })
    return records[0] || null
  }

  private async findByContentHash(contentHash: string): Promise<MediaLunaAssetCache | null> {
    const records = await this.ctx.database.get('medialuna_asset_cache', { contentHash })
    return records[0] || null
  }

  private async updateAccessTime(contentHash: string): Promise<void> {
    try {
      await this.ctx.database.set('medialuna_asset_cache', { contentHash }, {
        lastAccessedAt: new Date()
      })
    } catch (e) {
      this.logger.warn('Failed to update access time: %s', e)
    }
  }

  private async deleteFromDatabase(contentHash: string): Promise<void> {
    await this.ctx.database.remove('medialuna_asset_cache', { contentHash })
  }

  private dbRecordToCachedFile(record: MediaLunaAssetCache): CachedFile {
    const localPath = path.join(this.cacheRoot, record.cachedKey)
    return {
      id: record.contentHash,
      filename: path.basename(record.cachedKey),
      mime: record.mimeType,
      size: record.fileSize,
      createdAt: record.createdAt,
      accessedAt: record.lastAccessedAt,
      localPath,
      url: record.cachedUrl,
      backend: record.backend
    }
  }

  // ========== 私有工具方法 ==========

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private generateContentHash(data: Buffer | ArrayBuffer): string {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
    return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)
  }

  private generateSourceHash(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16)
  }

  private getExtension(mime: string, filename?: string): string {
    if (filename) {
      const ext = path.extname(filename)
      if (ext) return ext
    }
    return getExtensionFromMime(mime)
  }

  private guessMimeFromUrl(url: string): string {
    const ext = url.split('.').pop()?.toLowerCase()?.split('?')[0]
    const mimeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'mp4': 'video/mp4',
      'webm': 'video/webm'
    }
    return mimeMap[ext || ''] || 'application/octet-stream'
  }

  /** 构建本地访问 URL */
  private buildLocalUrl(id: string, ext: string, config?: CachePluginConfig): string {
    const publicBaseUrl = config?.publicBaseUrl || this.publicBaseUrl
    const publicPath = config?.publicPath || this.publicPath

    if (publicBaseUrl) {
      return `${publicBaseUrl}/${id}${ext}`
    }

    if (!this.baseUrl) {
      try {
        const server = (this.ctx as any).get?.('server')
        const selfUrl = server?.config?.selfUrl
        if (selfUrl) {
          this.baseUrl = selfUrl.replace(/\/$/, '')
        } else {
          const port = server?.config?.port || 5140
          this.baseUrl = `http://127.0.0.1:${port}`
        }
      } catch {
        this.baseUrl = 'http://127.0.0.1:5140'
      }
    }

    if (!this.baseUrl) {
      return `${publicPath}/${id}${ext}`
    }

    return `${this.baseUrl}${publicPath}/${id}${ext}`
  }

  private async ensureCacheSpace(needed: number): Promise<void> {
    const maxBytes = this.config.maxCacheSize * 1024 * 1024

    const records = await this.ctx.database.get('medialuna_asset_cache', { backend: 'local' })
    let currentSize = records.reduce((sum, r) => sum + r.fileSize, 0)

    if (currentSize + needed <= maxBytes) return

    const sorted = [...records].sort((a, b) =>
      a.lastAccessedAt.getTime() - b.lastAccessedAt.getTime()
    )

    for (const record of sorted) {
      if (currentSize + needed <= maxBytes) break
      await this.delete(record.contentHash)
      currentSize -= record.fileSize
    }
  }

  private async cleanupExpired(): Promise<void> {
    if (this.config.expireDays === 0) return

    const now = new Date()
    const expireMs = this.config.expireDays * 24 * 60 * 60 * 1000
    const expireDate = new Date(now.getTime() - expireMs)

    const records = await this.ctx.database.get('medialuna_asset_cache', { backend: 'local' })
    const toDelete = records.filter(r => r.lastAccessedAt < expireDate)

    for (const record of toDelete) {
      await this.delete(record.contentHash)
    }

    if (toDelete.length > 0) {
      this.logger.info('Cleaned up %d expired cache entries', toDelete.length)
    }
  }
}
