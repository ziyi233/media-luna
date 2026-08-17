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
  recordId: number
  id: string
  key: string
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
  /** 人物设定或预设引用的持久资源 */
  persistent: boolean
  /** 数据库中记录的实际存储路径 */
  storagePath: string
}

/** 缓存统计 */
export interface CacheStats {
  totalFiles: number
  totalSizeMB: number
  maxSizeMB: number
  oldestAccess: Date | null
  newestAccess: Date | null
  backend: string
  temporaryFiles: number
  temporarySizeMB: number
  persistentFiles: number
  persistentSizeMB: number
}

export interface CacheWriteOptions {
  schemeName?: string
  dedupe?: boolean
  persistent?: boolean
}

export interface ReferenceRepairResult {
  protected: number
  moved: number
  reindexed: number
  rewritten: number
  redownloaded: number
  unrecoverable: string[]
}

export interface OrphanScanResult {
  files: string[]
  totalSize: number
}

export interface CachedReferenceData {
  data: ArrayBuffer
  mime: string
  filename: string
}

/**
 * 统一存储服务
 * 根据配置的 backend 自动选择存储方式（local/s3/webdav）
 */
export class CacheService {
  private logger: PluginLogger
  private ctx: Context
  private cacheRoot: string
  private persistentRoot: string
  private publicPath: string
  private publicBaseUrl: string | null
  private config: CachePluginConfig
  /** 基础URL（从 selfUrl 获取），用于生成本地访问链接 */
  private baseUrl: string = ''
  /** 内存缓存（加速查询） */
  private memoryCache: Map<string, CachedFile> = new Map()
  /** 是否已初始化 */
  private initialized: boolean = false
  private initialization: Promise<void> | null = null

  constructor(ctx: Context, config: CachePluginConfig) {
    this.ctx = ctx
    this.logger = createPluginLogger(ctx.logger('media-luna'), 'cache')
    this.config = config

    // 本地缓存目录（即使使用 S3/WebDAV，也可能需要临时存储）
    this.cacheRoot = path.resolve(ctx.baseDir, config.cacheDir || 'data/media-luna/cache')
    this.persistentRoot = path.resolve(ctx.baseDir, config.persistentDir || 'data/media-luna/assets')
    this.publicPath = config.publicPath || '/media-luna/cache'
    this.publicBaseUrl = config.publicBaseUrl?.replace(/\/$/, '') || null

    this.ensureDir(this.cacheRoot)
    this.ensureDir(this.persistentRoot)

    this.logger.info('Cache service initialized, backend: %s', config.backend || 'local')
  }

  /** 异步初始化 */
  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initialization) return this.initialization

    this.initialization = (async () => {
      await this.loadFromDatabase()
      // 引用修复必须先于普通缓存清理，避免旧记录在迁移前被淘汰。
      await this.repairReferences({ downloadRemote: false, demoteUnreferenced: true })
      if (this.config.backend === 'local' || !this.config.backend) {
        await this.cleanupExpired()
      }
      this.initialized = true
    })()

    try {
      await this.initialization
    } catch (e) {
      this.logger.error('Cache initialization failed: %s', e)
      throw e
    } finally {
      this.initialization = null
    }
  }

  /** 从数据库加载缓存元数据到内存 */
  private async loadFromDatabase(): Promise<void> {
    try {
      const records = await this.ctx.database.get('medialuna_asset_cache', {})
      for (const record of records) {
        this.memoryCache.set(record.contentHash, this.dbRecordToCachedFile(record))
      }
      this.logger.debug('Loaded %d cache entries from database', records.length)
    } catch (e) {
      this.logger.warn('Failed to load cache from database: %s', e)
    }
  }

  /** 更新配置 */
  updateConfig(config: Partial<CachePluginConfig>): void {
    this.config = { ...this.config, ...config }
    this.cacheRoot = path.resolve(this.ctx.baseDir, this.config.cacheDir || 'data/media-luna/cache')
    this.persistentRoot = path.resolve(this.ctx.baseDir, this.config.persistentDir || 'data/media-luna/assets')
    this.ensureDir(this.cacheRoot)
    this.ensureDir(this.persistentRoot)
    this.repairReferences({ downloadRemote: false, demoteUnreferenced: true }).catch(e => {
      this.logger.warn('Failed to migrate references after cache config update: %s', e)
    })
    this.logger.info('Cache config updated, backend: %s', this.config.backend || 'local')
  }

  /** 设置基础URL */
  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '')
    this.logger.debug('Base URL set to: %s', this.baseUrl)
  }

  /** 将本地缓存路由转换为适配器可直接访问的绝对 URL。 */
  resolvePublicUrl(url: string): string {
    const value = String(url || '').trim()
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return value

    const publicPath = this.publicPath.replace(/\/$/, '')
    if (this.publicBaseUrl && value.startsWith(`${publicPath}/`)) {
      return `${this.publicBaseUrl}/${path.basename(value)}`
    }

    if (!this.baseUrl) return value
    return `${this.baseUrl}${value.startsWith('/') ? '' : '/'}${value}`
  }

  /** 在 server 确定实际监听地址后改写已有本地缓存 URL。 */
  async rewriteLocalUrls(): Promise<number> {
    if (!this.baseUrl && !this.publicBaseUrl) return 0

    const records = await this.ctx.database.get('medialuna_asset_cache', { backend: 'local' })
    let rewritten = 0
    for (const record of records) {
      const nextUrl = this.buildLocalUrl(record.contentHash, path.extname(record.cachedKey))
      if (nextUrl === record.cachedUrl) continue

      await this.ctx.database.set('medialuna_asset_cache', { id: record.id }, { cachedUrl: nextUrl })
      const cached = this.memoryCache.get(record.contentHash)
      if (cached?.recordId === record.id) cached.url = nextUrl
      rewritten++
    }
    return rewritten
  }

  /** 删除已不再被本地业务数据引用的远程预设缓存。 */
  async removeCachedSources(urls: string[]): Promise<number> {
    let removed = 0
    for (const url of new Set(urls.filter(Boolean))) {
      const record = await this.findBySourceHash(this.generateSourceHash(url))
      if (!record || record.persistent) continue
      if (await this.deleteRecord(record, true)) removed++
    }
    return removed
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
  async cache(data: Buffer | ArrayBuffer, mime: string, filename?: string, sourceUrl?: string, schemeNameOrOptions?: string | CacheWriteOptions): Promise<CachedFile> {
    const writeOptions: CacheWriteOptions = typeof schemeNameOrOptions === 'string'
      ? { schemeName: schemeNameOrOptions }
      : (schemeNameOrOptions || {})

    // 获取指定方案的配置
    const effectiveConfig = this.getSchemeConfig(writeOptions.schemeName)

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
    if (writeOptions.dedupe !== false) {
      const existingByContent = await this.findByContentHash(contentHash)
      if (existingByContent) {
        // 检查后端是否一致，不一致则需要重新存储
        if (existingByContent.backend === backend) {
          if (backend === 'local' && !this.findExistingRecordPath(existingByContent)) {
            return this.restoreLocalRecord(existingByContent, buffer, mime, filename, Boolean(writeOptions.persistent), effectiveConfig)
          }
          if (writeOptions.persistent && !existingByContent.persistent) {
            await this.promoteRecord(existingByContent)
            const promoted = await this.findByContentHash(contentHash)
            if (promoted) return this.dbRecordToCachedFile(promoted)
          }
          await this.updateAccessTime(existingByContent.contentHash)
          this.logger.debug('Cache hit by content hash: %s', contentHash)
          return this.dbRecordToCachedFile(existingByContent)
        } else {
          if (existingByContent.persistent) return this.dbRecordToCachedFile(existingByContent)
          // 后端不一致，删除旧记录后重新缓存
          this.logger.debug('Backend changed (%s -> %s), re-caching: %s', existingByContent.backend, backend, contentHash)
          await this.deleteRecord(existingByContent, true)
        }
      }
    }

    // 根据后端存储文件
    const ext = this.getExtension(mime, filename)
    const storageKey = writeOptions.dedupe === false
      ? `${contentHash}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
      : `${contentHash}${ext}`
    let cachedUrl: string
    let localPath = ''

    switch (backend) {
      case 'local':
        localPath = await this.storeLocal(buffer, storageKey, Boolean(writeOptions.persistent), effectiveConfig)
        cachedUrl = this.buildLocalUrl(contentHash, ext, effectiveConfig)
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
    const sourceHash = sourceUrl
      ? this.generateSourceHash(sourceUrl)
      : (writeOptions.dedupe === false ? `${contentHash}-${Date.now()}` : contentHash)

    // 保存到数据库
    const now = new Date()
    const created = await this.ctx.database.create('medialuna_asset_cache', {
      sourceUrl: sourceUrl || '',
      sourceHash,
      contentHash,
      backend,
      cachedUrl,
      cachedKey: storageKey,
      persistent: Boolean(writeOptions.persistent),
      storagePath: localPath ? this.serializeStoragePath(localPath) : '',
      mimeType: mime,
      fileSize: buffer.length,
      createdAt: now,
      lastAccessedAt: now
    })

    const cached: CachedFile = {
      recordId: created.id,
      id: contentHash,
      key: storageKey,
      filename: filename || `file${ext}`,
      mime,
      size: buffer.length,
      createdAt: now,
      accessedAt: now,
      localPath,
      url: cachedUrl,
      backend,
      persistent: Boolean(writeOptions.persistent),
      storagePath: localPath ? this.serializeStoragePath(localPath) : ''
    }

    // 更新内存缓存
    this.memoryCache.set(cached.id, cached)

    this.logger.debug('Cached file to %s: %s', backend, cached.id)
    return cached
  }

  /** 存储到本地 */
  private async storeLocal(buffer: Buffer, storageKey: string, persistent: boolean, config?: CachePluginConfig): Promise<string> {
    if (!persistent) await this.ensureCacheSpace(buffer.length)

    const cacheRoot = persistent
      ? this.persistentRoot
      : path.resolve(this.ctx.baseDir, config?.cacheDir || this.config.cacheDir || 'data/media-luna/cache')
    this.ensureDir(cacheRoot)

    const localPath = path.join(cacheRoot, storageKey)
    fs.writeFileSync(localPath, new Uint8Array(buffer))
    return localPath
  }

  private async restoreLocalRecord(
    record: MediaLunaAssetCache,
    buffer: Buffer,
    mime: string,
    filename: string | undefined,
    persistent: boolean,
    config: CachePluginConfig
  ): Promise<CachedFile> {
    const contentHash = this.generateContentHash(buffer)
    const ext = this.getExtension(mime, filename || record.cachedKey)
    const storageKey = `${contentHash}${ext}`
    const keepPersistent = Boolean(record.persistent || persistent)
    const localPath = await this.storeLocal(buffer, storageKey, keepPersistent, config)
    const now = new Date()
    const cachedUrl = this.buildLocalUrl(contentHash, ext, config)
    const update = {
      contentHash,
      cachedUrl,
      cachedKey: storageKey,
      persistent: keepPersistent,
      storagePath: this.serializeStoragePath(localPath),
      mimeType: mime,
      fileSize: buffer.length,
      lastAccessedAt: now
    }
    await this.ctx.database.set('medialuna_asset_cache', { id: record.id }, update)
    const restored = this.dbRecordToCachedFile({ ...record, ...update })
    this.memoryCache.delete(record.contentHash)
    this.memoryCache.set(contentHash, restored)
    return restored
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
  async cacheFromUrl(url: string, schemeNameOrOptions?: string | CacheWriteOptions): Promise<CachedFile> {
    const writeOptions: CacheWriteOptions = typeof schemeNameOrOptions === 'string'
      ? { schemeName: schemeNameOrOptions }
      : (schemeNameOrOptions || {})
    const effectiveConfig = this.getSchemeConfig(writeOptions.schemeName)
    const currentBackend = effectiveConfig.backend || 'local'
    let missingLocalRecord: MediaLunaAssetCache | null = null

    // 先检查是否已有相同源 URL 的缓存
    if (writeOptions.dedupe !== false) {
      const sourceHash = this.generateSourceHash(url)
      const existingBySource = await this.findBySourceHash(sourceHash)
      if (existingBySource) {
        // 检查后端是否一致，不一致则需要重新存储
        if (existingBySource.backend === currentBackend) {
          if (currentBackend === 'local' && !this.findExistingRecordPath(existingBySource)) {
            this.logger.warn('Cached source is missing on disk, downloading it again: %s', url)
            missingLocalRecord = existingBySource
          } else {
            if (writeOptions.persistent && !existingBySource.persistent) {
              await this.promoteRecord(existingBySource)
              const promoted = await this.findByContentHash(existingBySource.contentHash)
              if (promoted) return this.dbRecordToCachedFile(promoted)
            }
            await this.updateAccessTime(existingBySource.contentHash)
            this.logger.debug('Cache hit by source hash: %s -> %s', url, sourceHash)
            return this.dbRecordToCachedFile(existingBySource)
          }
        } else {
          if (existingBySource.persistent) return this.dbRecordToCachedFile(existingBySource)
          // 后端不一致，删除旧记录后重新缓存
          this.logger.debug('Backend changed (%s -> %s), re-caching: %s', existingBySource.backend, currentBackend, url)
          await this.deleteRecord(existingBySource, true)
        }
      }
    }

    // 下载文件
    const response = await this.ctx.http.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer'
    })

    const mime = this.guessMimeFromUrl(url)
    const filename = url.split('/').pop()?.split('?')[0] || 'downloaded'

    if (missingLocalRecord && currentBackend === 'local') {
      return this.restoreLocalRecord(missingLocalRecord, Buffer.from(response), mime, filename, Boolean(writeOptions.persistent), effectiveConfig)
    }

    return this.cache(response, mime, filename, url, writeOptions)
  }

  /** 修复人物设定和预设引用，并在普通缓存清理前提升为持久资源。 */
  async repairReferences(options: { downloadRemote?: boolean; demoteUnreferenced?: boolean } = {}): Promise<ReferenceRepairResult> {
    const result: ReferenceRepairResult = {
      protected: 0,
      moved: 0,
      reindexed: 0,
      rewritten: 0,
      redownloaded: 0,
      unrecoverable: []
    }
    const protectedIds = new Set<number>()

    const repairOne = async (url: string, remoteUrl: string | undefined, label: string): Promise<string> => {
      if (!url) return url

      if (url.startsWith('data:')) {
        const parsed = this.parseDataUrl(url)
        if (!parsed) {
          result.unrecoverable.push(label)
          return url
        }
        const cached = await this.cache(parsed.buffer, parsed.mime, `reference${getExtensionFromMime(parsed.mime)}`, undefined, { persistent: true })
        protectedIds.add(cached.recordId)
        result.protected++
        result.reindexed++
        return cached.url || url
      }

      let record = (await this.ctx.database.get('medialuna_asset_cache', { cachedUrl: url }))[0] || null
      if (record && record.backend !== 'local') {
        await this.promoteRecord(record)
        protectedIds.add(record.id)
        result.protected++
        return record.cachedUrl
      }

      const localFilename = this.extractLocalCacheFilename(url) || (record ? path.basename(record.cachedKey) : null)
      if (!localFilename) {
        // 外部 URL 不属于本地缓存，不在启动阶段主动下载。
        return url
      }

      record = record || await this.findRecordByReference(url, localFilename)
      let sourcePath = record ? this.findExistingRecordPath(record, localFilename) : this.findOrphanPath(localFilename)

      if (!record && sourcePath) {
        const buffer = fs.readFileSync(sourcePath)
        const contentHash = this.generateContentHash(buffer)
        const mime = this.guessMimeFromUrl(localFilename)
        const ext = path.extname(localFilename) || getExtensionFromMime(mime)
        const key = `${contentHash}${ext}`
        const targetPath = path.join(this.persistentRoot, key)
        await this.copyFileSafely(sourcePath, targetPath, contentHash)
        const now = new Date()
        record = await this.ctx.database.create('medialuna_asset_cache', {
          sourceUrl: '',
          sourceHash: `recovered-${contentHash}`,
          contentHash,
          backend: 'local',
          cachedUrl: this.buildLocalUrl(contentHash, ext),
          cachedKey: key,
          persistent: true,
          storagePath: this.serializeStoragePath(targetPath),
          mimeType: mime,
          fileSize: buffer.length,
          createdAt: now,
          lastAccessedAt: now
        })
        if (path.resolve(sourcePath) !== path.resolve(targetPath) && fs.existsSync(sourcePath)) {
          try {
            fs.unlinkSync(sourcePath)
          } catch {
            this.logger.warn('Recovered asset was registered but its old orphan file could not be removed: %s', sourcePath)
          }
        }
        this.memoryCache.set(contentHash, this.dbRecordToCachedFile(record))
        result.reindexed++
        sourcePath = targetPath
      }

      if (record && (record.backend !== 'local' || sourcePath)) {
        const oldPath = sourcePath ? path.resolve(sourcePath) : ''
        await this.promoteRecord(record)
        const promoted = await this.findRecordById(record.id)
        if (promoted) {
          protectedIds.add(promoted.id)
          result.protected++
          const newPath = promoted.backend === 'local' ? path.resolve(this.resolveRecordPath(promoted)) : ''
          if (oldPath && newPath && oldPath !== newPath) result.moved++
          if (promoted.cachedUrl !== url) result.rewritten++
          return promoted.cachedUrl
        }
      }

      if (options.downloadRemote && remoteUrl) {
        try {
          const cached = await this.cacheFromUrl(remoteUrl, { persistent: true })
          protectedIds.add(cached.recordId)
          result.protected++
          result.redownloaded++
          return cached.url || url
        } catch (e) {
          this.logger.warn('Failed to restore remote reference %s: %s', remoteUrl, e)
        }
      }

      result.unrecoverable.push(label)
      return url
    }

    const characters = await this.ctx.database.get('medialuna_character_profile', {})
    for (const character of characters) {
      const urls = this.parseStringArray(character.imageUrls)
      const repaired: string[] = []
      for (let index = 0; index < urls.length; index++) {
        repaired.push(await repairOne(urls[index], undefined, `人物设定「${character.name}」第 ${index + 1} 张图`))
      }
      if (JSON.stringify(urls) !== JSON.stringify(repaired)) {
        await this.ctx.database.set('medialuna_character_profile', { id: character.id }, { imageUrls: JSON.stringify(repaired) })
      }
    }

    const presets = await this.ctx.database.get('medialuna_preset', {})
    for (const preset of presets) {
      // 远程预设直接使用远程媒体，不进入本地持久资源生命周期。
      if (preset.source === 'api') continue

      const urls = this.parseStringArray(preset.referenceImages)
      const remoteUrls = this.parseStringArray(preset.referenceImagesRemote)
      const repaired: string[] = []
      for (let index = 0; index < urls.length; index++) {
        repaired.push(await repairOne(urls[index], remoteUrls[index], `预设「${preset.name}」第 ${index + 1} 张参考图`))
      }

      const update: Partial<MediaLunaAssetCache> & { referenceImages?: string; thumbnail?: string } = {}
      if (JSON.stringify(urls) !== JSON.stringify(repaired)) update.referenceImages = JSON.stringify(repaired)
      if (preset.thumbnail) {
        const thumbnail = await repairOne(preset.thumbnail, preset.thumbnailRemote, `预设「${preset.name}」缩略图`)
        if (thumbnail !== preset.thumbnail) update.thumbnail = thumbnail
      }
      if (Object.keys(update).length > 0) {
        await this.ctx.database.set('medialuna_preset', { id: preset.id }, update as any)
      }
    }

    if (options.demoteUnreferenced) {
      const persistentRecords = await this.ctx.database.get('medialuna_asset_cache', { persistent: true })
      for (const record of persistentRecords) {
        if (!protectedIds.has(record.id)) {
          await this.ctx.database.set('medialuna_asset_cache', { id: record.id }, { persistent: false })
          const cached = this.memoryCache.get(record.contentHash)
          if (cached?.recordId === record.id) cached.persistent = false
        }
      }
    }

    if (result.unrecoverable.length > 0) {
      this.logger.warn('Reference repair completed with %d unrecoverable assets', result.unrecoverable.length)
      this.logger.warn('Unrecoverable references: %s', result.unrecoverable.slice(0, 20).join('；'))
    } else {
      this.logger.info('Reference repair completed: protected=%d, moved=%d, reindexed=%d, rewritten=%d', result.protected, result.moved, result.reindexed, result.rewritten)
    }
    return result
  }

  async isReferenceAvailable(url: string): Promise<boolean> {
    if (url.startsWith('data:')) return Boolean(this.parseDataUrl(url))
    const exact = (await this.ctx.database.get('medialuna_asset_cache', { cachedUrl: url }))[0]
    if (exact) {
      if (exact.backend !== 'local') return true
      return Boolean(this.findExistingRecordPath(exact, path.basename(exact.cachedKey)))
    }
    const filename = this.extractLocalCacheFilename(url)
    if (!filename) return false
    const record = await this.findRecordByReference(url, filename)
    if (!record) return Boolean(this.findOrphanPath(filename))
    if (record.backend !== 'local') return Boolean(record.cachedUrl)
    return Boolean(this.findExistingRecordPath(record, filename))
  }

  async loadReference(url: string): Promise<CachedReferenceData | null> {
    const parsed = this.parseDataUrl(url)
    if (parsed) {
      return {
        data: this.toArrayBuffer(parsed.buffer),
        mime: parsed.mime,
        filename: `reference${getExtensionFromMime(parsed.mime)}`
      }
    }

    const exact = (await this.ctx.database.get('medialuna_asset_cache', { cachedUrl: url }))[0]
    if (exact?.backend === 'local') {
      const filePath = this.findExistingRecordPath(exact, path.basename(exact.cachedKey))
      if (!filePath) return null
      const buffer = fs.readFileSync(filePath)
      await this.updateAccessTime(exact.contentHash)
      return { data: this.toArrayBuffer(buffer), mime: exact.mimeType, filename: exact.cachedKey }
    }
    if (exact) url = exact.cachedUrl

    const filename = this.extractLocalCacheFilename(url)
    if (filename) {
      const record = await this.findRecordByReference(url, filename)
      if (record?.backend === 'local') {
        const filePath = this.findExistingRecordPath(record, filename)
        if (!filePath) return null
        const buffer = fs.readFileSync(filePath)
        await this.updateAccessTime(record.contentHash)
        return { data: this.toArrayBuffer(buffer), mime: record.mimeType, filename: record.cachedKey }
      }
      if (!record) return null
      url = record.cachedUrl
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) return null
    try {
      const response = await this.ctx.http.get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
      return {
        data: response,
        mime: this.guessMimeFromUrl(url),
        filename: url.split('/').pop()?.split('?')[0] || 'reference.png'
      }
    } catch {
      return null
    }
  }

  async scanOrphans(): Promise<OrphanScanResult> {
    const records = await this.ctx.database.get('medialuna_asset_cache', {})
    const indexedPaths = new Set(records
      .filter(record => record.backend === 'local')
      .map(record => path.resolve(this.resolveRecordPath(record))))
    const files = fs.existsSync(this.cacheRoot)
      ? fs.readdirSync(this.cacheRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() && !entry.name.includes('.tmp-'))
        .map(entry => path.join(this.cacheRoot, entry.name))
        .filter(filePath => !indexedPaths.has(path.resolve(filePath)))
      : []
    return { files, totalSize: files.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0) }
  }

  async cleanupOrphans(confirmation: string): Promise<OrphanScanResult> {
    if (confirmation !== 'DELETE_ORPHANS') {
      throw new Error('清理孤儿文件需要明确确认')
    }
    const scan = await this.scanOrphans()
    for (const filePath of scan.files) fs.unlinkSync(filePath)
    this.logger.info('Removed %d orphan cache files', scan.files.length)
    return scan
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
        if (!cached.persistent) {
          await this.deleteFromDatabaseById(cached.recordId)
        }
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
    const record = await this.findByContentHash(id)
    if (!record) return true
    if (record.persistent) {
      this.logger.warn('Refusing to delete referenced persistent asset: %s', id)
      return false
    }
    return this.deleteRecord(record, false)
  }

  /** 从后端删除文件 */
  private async deleteFromBackend(key: string, backend: string, storagePath = ''): Promise<void> {
    switch (backend) {
      case 'local':
        const localPath = storagePath
          ? this.resolveStoragePath(storagePath)
          : path.join(this.cacheRoot, key)
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath)
        }
        break
      case 's3':
        try {
          await deleteFromS3(key, this.toS3Config())
        } catch (e) {
          this.logger.warn('Failed to delete from S3: %s', e)
          throw e
        }
        break
      case 'webdav':
        try {
          await this.deleteFromWebDav(key)
        } catch (e) {
          this.logger.warn('Failed to delete from WebDAV: %s', e)
          throw e
        }
        break
      case 'oss':
        try {
          await deleteFromOSS(key, this.toOSSConfig())
        } catch (e) {
          this.logger.warn('Failed to delete from OSS: %s', e)
          throw e
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

    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` }
    })
    if (!response.ok && response.status !== 404) {
      throw new Error(`WebDAV delete failed: HTTP ${response.status}`)
    }
  }

  /** 获取统计信息 */
  async getStats(): Promise<CacheStats> {
    const records = await this.ctx.database.get('medialuna_asset_cache', {})

    let oldest: Date | null = null
    let newest: Date | null = null
    let totalSize = 0
    let temporaryFiles = 0
    let temporarySize = 0
    let persistentFiles = 0
    let persistentSize = 0

    for (const record of records) {
      totalSize += record.fileSize
      if (record.persistent) {
        persistentFiles++
        persistentSize += record.fileSize
      } else {
        temporaryFiles++
        temporarySize += record.fileSize
      }
      if (!oldest || record.lastAccessedAt < oldest) oldest = record.lastAccessedAt
      if (!newest || record.lastAccessedAt > newest) newest = record.lastAccessedAt
    }

    return {
      totalFiles: records.length,
      totalSizeMB: totalSize / (1024 * 1024),
      maxSizeMB: this.config.maxCacheSize,
      oldestAccess: oldest,
      newestAccess: newest,
      backend: this.config.backend || 'local',
      temporaryFiles,
      temporarySizeMB: temporarySize / (1024 * 1024),
      persistentFiles,
      persistentSizeMB: persistentSize / (1024 * 1024)
    }
  }

  /** 清空所有缓存 */
  async clearAll(): Promise<number> {
    const records = await this.ctx.database.get('medialuna_asset_cache', {})
    const temporary = records.filter(record => !record.persistent)

    let removed = 0
    for (const record of temporary) {
      if (await this.deleteRecord(record, false)) removed++
    }
    this.logger.info('Cleared %d temporary cache entries', removed)
    return removed
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

  private async findRecordById(id: number): Promise<MediaLunaAssetCache | null> {
    const records = await this.ctx.database.get('medialuna_asset_cache', { id })
    return records[0] || null
  }

  private async findRecordByReference(url: string, filename: string): Promise<MediaLunaAssetCache | null> {
    const exact = await this.ctx.database.get('medialuna_asset_cache', { cachedUrl: url })
    if (exact[0]) return exact[0]

    const byKey = await this.ctx.database.get('medialuna_asset_cache', { cachedKey: filename })
    if (byKey[0]) return byKey[0]

    const contentHash = path.basename(filename, path.extname(filename))
    return this.findByContentHash(contentHash)
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

  private async deleteFromDatabaseById(id: number): Promise<void> {
    await this.ctx.database.remove('medialuna_asset_cache', { id })
  }

  private async deleteRecord(record: MediaLunaAssetCache, allowPersistent: boolean): Promise<boolean> {
    if (record.persistent && !allowPersistent) return false

    try {
      await this.deleteFromBackend(record.cachedKey, record.backend, record.storagePath)
      await this.deleteFromDatabaseById(record.id)
      const cached = this.memoryCache.get(record.contentHash)
      if (cached?.recordId === record.id) this.memoryCache.delete(record.contentHash)
      return true
    } catch (e) {
      this.logger.warn('Failed to delete cache record %d: %s', record.id, e)
      return false
    }
  }

  private async promoteRecord(record: MediaLunaAssetCache): Promise<void> {
    let storagePath = record.storagePath || ''
    let cachedUrl = record.cachedUrl

    if (record.backend === 'local' || !record.backend) {
      const sourcePath = this.resolveRecordPath(record)
      if (!fs.existsSync(sourcePath)) return

      const targetPath = path.join(this.persistentRoot, record.cachedKey)
      if (path.resolve(sourcePath) !== path.resolve(targetPath)) {
        await this.copyFileSafely(sourcePath, targetPath, record.contentHash)
      }
      storagePath = this.serializeStoragePath(targetPath)
      cachedUrl = this.buildLocalUrl(record.contentHash, path.extname(record.cachedKey))

      await this.ctx.database.set('medialuna_asset_cache', { id: record.id }, {
        persistent: true,
        storagePath,
        cachedUrl
      })

      if (path.resolve(sourcePath) !== path.resolve(targetPath) && fs.existsSync(sourcePath)) {
        try {
          fs.unlinkSync(sourcePath)
        } catch (e) {
          this.logger.warn('Persistent asset migrated but old file could not be removed: %s', sourcePath)
        }
      }
    } else {
      await this.ctx.database.set('medialuna_asset_cache', { id: record.id }, { persistent: true })
    }

    const refreshed: MediaLunaAssetCache = {
      ...record,
      persistent: true,
      storagePath,
      cachedUrl
    }
    this.memoryCache.set(record.contentHash, this.dbRecordToCachedFile(refreshed))
  }

  private dbRecordToCachedFile(record: MediaLunaAssetCache): CachedFile {
    const localPath = record.backend === 'local' || !record.backend
      ? this.resolveRecordPath(record)
      : ''
    return {
      recordId: record.id,
      id: record.contentHash,
      key: record.cachedKey,
      filename: path.basename(record.cachedKey),
      mime: record.mimeType,
      size: record.fileSize,
      createdAt: record.createdAt,
      accessedAt: record.lastAccessedAt,
      localPath,
      url: record.cachedUrl,
      backend: record.backend,
      persistent: Boolean(record.persistent),
      storagePath: record.storagePath || ''
    }
  }

  // ========== 私有工具方法 ==========

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private serializeStoragePath(filePath: string): string {
    const absolute = path.resolve(filePath)
    const relative = path.relative(this.ctx.baseDir, absolute)
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
      ? relative
      : absolute
  }

  private resolveStoragePath(storagePath: string): string {
    return path.isAbsolute(storagePath)
      ? storagePath
      : path.resolve(this.ctx.baseDir, storagePath)
  }

  private resolveRecordPath(record: MediaLunaAssetCache): string {
    if (record.storagePath) return this.resolveStoragePath(record.storagePath)
    const root = record.persistent ? this.persistentRoot : this.cacheRoot
    return path.join(root, record.cachedKey)
  }

  private findExistingRecordPath(record: MediaLunaAssetCache, referencedFilename?: string): string | null {
    const candidates = [
      this.resolveRecordPath(record),
      path.join(this.cacheRoot, record.cachedKey),
      path.join(this.persistentRoot, record.cachedKey)
    ]
    if (referencedFilename) {
      candidates.push(path.join(this.cacheRoot, referencedFilename))
      candidates.push(path.join(this.persistentRoot, referencedFilename))
    }
    return candidates.find(candidate => fs.existsSync(candidate)) || null
  }

  private findOrphanPath(filename: string): string | null {
    const candidates = [
      path.join(this.cacheRoot, filename),
      path.join(this.persistentRoot, filename)
    ]
    return candidates.find(candidate => fs.existsSync(candidate)) || null
  }

  private extractLocalCacheFilename(url: string): string | null {
    const publicPath = (this.config.publicPath || this.publicPath).replace(/\/$/, '')
    let pathname = url
    try {
      pathname = new URL(url, this.baseUrl || 'http://127.0.0.1').pathname
    } catch {
      return null
    }
    const marker = `${publicPath}/`
    const markerIndex = pathname.indexOf(marker)
    if (markerIndex < 0) return null
    const filename = decodeURIComponent(pathname.slice(markerIndex + marker.length)).split('/')[0]
    return filename ? path.basename(filename) : null
  }

  private parseStringArray(value: string | undefined | null): string[] {
    if (!value) return []
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
    } catch {
      return []
    }
  }

  private parseDataUrl(url: string): { buffer: Buffer; mime: string } | null {
    const matched = url.match(/^data:([^;]+);base64,(.+)$/)
    if (!matched) return null
    try {
      return { mime: matched[1], buffer: Buffer.from(matched[2], 'base64') }
    } catch {
      return null
    }
  }

  private toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  }

  private async copyFileSafely(sourcePath: string, targetPath: string, expectedHash: string): Promise<void> {
    this.ensureDir(path.dirname(targetPath))
    if (fs.existsSync(targetPath)) {
      const targetHash = this.generateContentHash(fs.readFileSync(targetPath))
      if (targetHash !== expectedHash) {
        throw new Error(`Persistent asset hash mismatch: ${targetPath}`)
      }
      return
    }

    const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
    fs.copyFileSync(sourcePath, temporaryPath)
    const copiedHash = this.generateContentHash(fs.readFileSync(temporaryPath))
    if (copiedHash !== expectedHash) {
      fs.unlinkSync(temporaryPath)
      throw new Error(`Persistent asset copy verification failed: ${sourcePath}`)
    }
    fs.renameSync(temporaryPath, targetPath)
  }

  private generateContentHash(data: Buffer | ArrayBuffer): string {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
    return crypto.createHash('sha256').update(new Uint8Array(buffer)).digest('hex').slice(0, 16)
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
      return `${publicPath}/${id}${ext}`
    }

    return `${this.baseUrl}${publicPath}/${id}${ext}`
  }

  private async ensureCacheSpace(needed: number): Promise<void> {
    const maxBytes = this.config.maxCacheSize * 1024 * 1024

    const records = (await this.ctx.database.get('medialuna_asset_cache', { backend: 'local' }))
      .filter(record => !record.persistent)
    let currentSize = records.reduce((sum, r) => sum + r.fileSize, 0)

    if (currentSize + needed <= maxBytes) return

    const sorted = [...records].sort((a, b) =>
      a.lastAccessedAt.getTime() - b.lastAccessedAt.getTime()
    )

    for (const record of sorted) {
      if (currentSize + needed <= maxBytes) break
      if (await this.deleteRecord(record, false)) currentSize -= record.fileSize
    }
  }

  private async cleanupExpired(): Promise<void> {
    if (this.config.expireDays === 0) return

    const now = new Date()
    const expireMs = this.config.expireDays * 24 * 60 * 60 * 1000
    const expireDate = new Date(now.getTime() - expireMs)

    const records = await this.ctx.database.get('medialuna_asset_cache', { backend: 'local' })
    const toDelete = records.filter(r => !r.persistent && r.lastAccessedAt < expireDate)

    let removed = 0
    for (const record of toDelete) {
      if (await this.deleteRecord(record, false)) removed++
    }

    if (removed > 0) {
      this.logger.info('Cleaned up %d expired cache entries', removed)
    }
  }
}
