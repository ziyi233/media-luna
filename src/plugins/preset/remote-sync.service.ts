// 远程预设同步服务

import { Context } from 'koishi'
import type { PluginLogger } from '../../core'
import { createPluginLogger } from '../../core'
import { PresetService, PresetData } from './service'
import type { RemoteSyncConfig } from './config'
import type { CacheService } from '../cache/service'

/** 远程 API 返回的模板数据 */
interface RemoteTemplate {
  id: number
  title: string
  prompt: string
  type: string
  tags: string[]
  category: string
  file_path: string
  thumbnail_path: string
  refs: Array<{
    id: number
    file_path: string
    is_placeholder: boolean
    position: number
  }>
  created_at: string
  description?: string
  author?: string
  heat_score?: number
}

/** 远程 API 响应 */
interface RemoteApiResponse {
  code: number
  data: RemoteTemplate[]
  message: string
  meta: {
    total_items: number
    page: number
    per_page: number
  }
}

/** 同步结果 */
export interface SyncResult {
  success: boolean
  added: number
  updated: number
  removed: number
  errors: string[]
  /** 是否命中缓存（304 Not Modified） */
  notModified?: boolean
}

/** 拉取结果 */
interface FetchResult {
  templates: RemoteTemplate[]
  notModified: boolean
  etag?: string
}

/**
 * 远程预设同步服务
 */
export class RemoteSyncService {
  private _ctx: Context
  private _logger: PluginLogger
  private _presetService: PresetService
  private _getCacheService: () => CacheService | undefined
  private _syncDispose: (() => void) | null = null
  /** 存储每个 API URL 对应的 ETag */
  private _etagCache: Map<string, string> = new Map()

  constructor(
    ctx: Context,
    presetService: PresetService,
    getCacheService: () => CacheService | undefined
  ) {
    this._ctx = ctx
    this._logger = createPluginLogger(ctx.logger('media-luna'), 'remote-sync')
    this._presetService = presetService
    this._getCacheService = getCacheService
  }

  /** 从远程 API 拉取模板列表（支持 ETag 缓存） */
  async fetchRemoteTemplates(apiUrl: string): Promise<FetchResult> {
    // 检查 context 是否仍然有效
    if (!this._ctx.scope.isActive) {
      throw new Error('Context is inactive, cannot fetch remote templates')
    }

    const headers: Record<string, string> = {}
    const cachedEtag = this._etagCache.get(apiUrl)
    if (cachedEtag) {
      headers['If-None-Match'] = cachedEtag
      this._logger.debug('Sending request with ETag: %s', cachedEtag)
    }

    try {
      // 使用原生 fetch 以获取完整响应（包括 headers 和状态码）
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(30000)
      })

      // 处理 304 Not Modified
      if (response.status === 304) {
        this._logger.info('Remote data not modified (304)')
        return {
          templates: [],
          notModified: true
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // 保存新的 ETag
      const newEtag = response.headers.get('etag')
      if (newEtag) {
        this._etagCache.set(apiUrl, newEtag)
        this._logger.debug('Saved new ETag: %s', newEtag)
      }

      const data: RemoteApiResponse = await response.json()

      // 检查 API 响应格式
      if (data.code !== undefined && data.code !== 200) {
        throw new Error(`API returned error: ${data.message || 'Unknown error'}`)
      }

      return {
        templates: data.data || [],
        notModified: false,
        etag: newEtag || undefined
      }
    } catch (error: any) {
      this._logger.error('Failed to fetch remote templates: %s', error)
      throw error
    }
  }

  /** 将远程模板转换为本地预设数据（不含缓存处理） */
  transformToPreset(template: RemoteTemplate, remoteUrl: string): Omit<PresetData, 'id'> {
    const referenceImagesRemote = template.refs
      .filter(ref => !ref.is_placeholder)
      .sort((a, b) => a.position - b.position)
      .map(ref => ref.file_path)

    // txt2image 则替换为 text2image
    const tags = [...new Set([template.type === 'txt2img' ? 'text2img' : template.type,...template.tags].filter(Boolean))]
    const thumbnailRemote = template.thumbnail_path || template.file_path || undefined

    return {
      name: template.title,
      promptTemplate: template.prompt,
      tags,
      // 初始时 referenceImages 为空，等缓存完成后更新
      referenceImages: [],
      referenceImagesRemote,
      parameterOverrides: {},
      source: 'api',
      enabled: true,
      remoteId: template.id,
      remoteUrl,
      // 初始时 thumbnail 为空，等缓存完成后更新
      thumbnail: undefined,
      thumbnailRemote
    }
  }

  /**
   * 缓存预设的图片资源（缩略图和参考图片）
   * @param presetData 预设数据（需要包含 thumbnailRemote 和 referenceImagesRemote）
   * @param thumbnailDelay 下载间隔（毫秒），用于限流
   * @returns 更新后的预设数据（包含缓存后的 URL）
   */
  async cachePresetImages(
    presetData: Omit<PresetData, 'id'>,
    thumbnailDelay: number = 100
  ): Promise<Omit<PresetData, 'id'>> {
    // 检查 context 是否仍然有效
    if (!this._ctx.scope.isActive) {
      this._logger.debug('Context inactive, returning original preset data')
      return {
        ...presetData,
        thumbnail: presetData.thumbnailRemote,
        referenceImages: presetData.referenceImagesRemote || []
      }
    }

    const cache = this._getCacheService()

    // 如果缓存服务不可用，返回原数据（使用远程URL作为降级）
    if (!cache || !cache.isEnabled()) {
      this._logger.debug('Cache service not available, using remote URLs as fallback')
      return {
        ...presetData,
        thumbnail: presetData.thumbnailRemote,
        referenceImages: presetData.referenceImagesRemote || []
      }
    }

    const result = { ...presetData }
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // 缓存缩略图
    if (presetData.thumbnailRemote) {
      try {
        const cached = await cache.cacheFromUrl(presetData.thumbnailRemote)
        // 直接使用 cached.url，它已经包含正确的存储后端 URL
        result.thumbnail = cached.url || presetData.thumbnailRemote
        this._logger.debug('Cached thumbnail: %s -> %s', presetData.thumbnailRemote, result.thumbnail)
      } catch (e) {
        this._logger.warn('Failed to cache thumbnail %s: %s', presetData.thumbnailRemote, e)
        // 降级使用远程URL
        result.thumbnail = presetData.thumbnailRemote
      }

      // 限流
      if (thumbnailDelay > 0) {
        await delay(thumbnailDelay)
      }
    }

    // 缓存参考图片
    const cachedReferenceImages: string[] = []
    for (const remoteUrl of presetData.referenceImagesRemote || []) {
      try {
        const cached = await cache.cacheFromUrl(remoteUrl)
        // 直接使用 cached.url，它已经包含正确的存储后端 URL
        const cachedUrl = cached.url || remoteUrl
        cachedReferenceImages.push(cachedUrl)
        this._logger.debug('Cached reference image: %s -> %s', remoteUrl, cachedUrl)
      } catch (e) {
        this._logger.warn('Failed to cache reference image %s: %s', remoteUrl, e)
        // 降级使用远程URL
        cachedReferenceImages.push(remoteUrl)
      }

      // 限流
      if (thumbnailDelay > 0) {
        await delay(thumbnailDelay)
      }
    }
    result.referenceImages = cachedReferenceImages

    return result
  }

  /** 执行同步 */
  async sync(apiUrl: string, deleteRemoved: boolean = false, thumbnailDelay: number = 100): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      added: 0,
      updated: 0,
      removed: 0,
      errors: [],
      notModified: false
    }

    // 检查 context 是否仍然有效
    if (!this._ctx.scope.isActive) {
      result.errors.push('Context is inactive, sync aborted')
      this._logger.debug('Context inactive, skipping sync')
      return result
    }

    try {
      this._logger.info('Starting sync from: %s', apiUrl)

      const fetchResult = await this.fetchRemoteTemplates(apiUrl)

      // 304 Not Modified - 数据未变化，直接返回成功
      if (fetchResult.notModified) {
        result.success = true
        result.notModified = true
        this._logger.info('Sync skipped: data not modified (304)')
        return result
      }

      const remoteTemplates = fetchResult.templates
      this._logger.info('Fetched %d templates from remote', remoteTemplates.length)

      const localPresets = await this._presetService.listByRemoteUrl(apiUrl)
      const remoteIds = new Set(remoteTemplates.map(t => t.id))

      for (const template of remoteTemplates) {
        try {
          // 转换为预设数据
          let presetData = this.transformToPreset(template, apiUrl)

          // 检查是否需要重新缓存图片
          const existing = await this._presetService.getByRemoteId(template.id, apiUrl)
          const needsCaching = this._needsImageCaching(existing, presetData)

          if (needsCaching) {
            // 缓存图片资源
            presetData = await this.cachePresetImages(presetData, thumbnailDelay)
            this._logger.debug('Cached images for preset: %s', template.title)
          } else if (existing) {
            // 保留已有的缓存URL
            presetData.thumbnail = existing.thumbnail
            presetData.referenceImages = existing.referenceImages
          }

          if (existing) {
            // 更新时保留用户设置的 enabled 状态
            const { enabled: _ignored, ...updateData } = presetData
            await this._presetService.update(existing.id, updateData)
            result.updated++
            this._logger.debug('Updated preset: %s', template.title)
          } else {
            // 创建新预设前，检查是否与现有用户预设重复（通过 prompt 内容匹配）
            const duplicate = await this._findDuplicateUserPreset(presetData.promptTemplate)
            if (duplicate) {
              // 发现重复，将新的远程预设默认禁用
              presetData.enabled = false
              this._logger.info(
                'Found duplicate user preset "%s", disabling synced preset "%s"',
                duplicate.name,
                template.title
              )
            }
            await this._presetService.create(presetData)
            result.added++
            this._logger.debug('Created preset: %s', template.title)
          }
        } catch (error) {
          const message = `Failed to sync template ${template.id}: ${error instanceof Error ? error.message : String(error)}`
          result.errors.push(message)
          this._logger.warn(message)
        }
      }

      if (deleteRemoved) {
        for (const preset of localPresets) {
          if (preset.remoteId && !remoteIds.has(preset.remoteId)) {
            try {
              await this._presetService.delete(preset.id)
              result.removed++
              this._logger.debug('Deleted preset: %s', preset.name)
            } catch (error) {
              const message = `Failed to delete preset ${preset.id}: ${error instanceof Error ? error.message : String(error)}`
              result.errors.push(message)
            }
          }
        }
      }

      result.success = result.errors.length === 0
      this._logger.info('Sync completed: %d added, %d updated, %d removed', result.added, result.updated, result.removed)

      return result
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error))
      this._logger.error('Sync failed: %s', error)
      return result
    }
  }

  /**
   * 判断是否需要重新缓存图片
   * - 新预设需要缓存
   * - 远程URL变化需要重新缓存
   * - 本地缓存URL为空需要缓存
   */
  private _needsImageCaching(
    existing: PresetData | null,
    newData: Omit<PresetData, 'id'>
  ): boolean {
    // 新预设需要缓存
    if (!existing) return true

    // 缩略图远程URL变化
    if (existing.thumbnailRemote !== newData.thumbnailRemote) return true

    // 参考图片远程URL变化
    const existingRemote = existing.referenceImagesRemote || []
    const newRemote = newData.referenceImagesRemote || []
    if (existingRemote.length !== newRemote.length) return true
    if (!existingRemote.every((url, i) => url === newRemote[i])) return true

    // 本地缓存URL为空（之前缓存失败或未缓存）
    if (newData.thumbnailRemote && !existing.thumbnail) return true
    if (newRemote.length > 0 && existing.referenceImages.length === 0) return true

    return false
  }

  /**
   * 查找与指定 prompt 内容重复的用户预设
   * 用于避免上传后同步导致重复预设
   */
  private async _findDuplicateUserPreset(promptTemplate: string): Promise<PresetData | null> {
    // 获取所有用户创建的预设（source = 'user'）
    const allPresets = await this._presetService.list()
    const userPresets = allPresets.filter(p => p.source === 'user')

    // 标准化 prompt 进行比较（去除首尾空白、统一换行符）
    const normalize = (s: string) => s.trim().replace(/\r\n/g, '\n')
    const normalizedPrompt = normalize(promptTemplate)

    // 查找 prompt 内容完全匹配的用户预设
    return userPresets.find(p => normalize(p.promptTemplate) === normalizedPrompt) || null
  }

  /** 启动定时同步 */
  startAutoSync(config: RemoteSyncConfig): void {
    this.stopAutoSync()

    if (!config.autoSync || config.syncInterval <= 0 || !config.apiUrl) {
      return
    }

    const intervalMs = config.syncInterval * 60 * 1000
    const thumbnailDelay = config.thumbnailDelay || 100
    this._logger.info('Starting auto sync every %d minutes', config.syncInterval)

    // 立即执行一次同步（延迟执行以确保服务初始化完成）
    const initialSyncTimer = setTimeout(() => {
      // 检查 context 是否仍然有效
      if (!this._ctx.scope.isActive) {
        this._logger.debug('Context inactive, skipping initial sync')
        return
      }
      this.sync(config.apiUrl, config.deleteRemoved, thumbnailDelay).catch(e => {
        this._logger.error('Initial sync failed: %s', e)
      })
    }, 3000)

    // 使用原生 setInterval 并手动管理
    const intervalId = setInterval(() => {
      // 检查 context 是否仍然有效
      if (!this._ctx.scope.isActive) {
        this._logger.debug('Context inactive, stopping scheduled sync')
        clearInterval(intervalId)
        return
      }
      this.sync(config.apiUrl, config.deleteRemoved, thumbnailDelay).catch(e => {
        this._logger.error('Scheduled sync failed: %s', e)
      })
    }, intervalMs)

    // 保存清理函数
    this._syncDispose = () => {
      clearTimeout(initialSyncTimer)
      clearInterval(intervalId)
    }
  }

  /** 停止定时同步 */
  stopAutoSync(): void {
    if (this._syncDispose) {
      this._syncDispose()
      this._syncDispose = null
      this._logger.info('Auto sync stopped')
    }
  }

  /** 清除 ETag 缓存（强制下次完整拉取） */
  clearEtagCache(apiUrl?: string): void {
    if (apiUrl) {
      this._etagCache.delete(apiUrl)
    } else {
      this._etagCache.clear()
    }
    this._logger.debug('ETag cache cleared')
  }

  /** 销毁服务 */
  dispose(): void {
    this.stopAutoSync()
    this._etagCache.clear()
  }

  /**
   * 上传作品/模板到远程 Prompt-Manager
   * @param uploadUrl 上传 URL（如 https://prompt.vioaki.xyz/upload）
   * @param data 上传数据
   * @returns 上传结果
   */
  async upload(uploadUrl: string, data: UploadData): Promise<UploadResult> {
    // 检查 context 是否仍然有效
    if (!this._ctx.scope.isActive) {
      return {
        success: false,
        error: 'Context is inactive, cannot upload'
      }
    }

    try {
      this._logger.info('Uploading to: %s', uploadUrl)

      // 构建 FormData
      const formData = new FormData()

      // 必填字段
      formData.append('title', data.title)
      formData.append('prompt', data.prompt)

      // 主图片（必填）
      if (data.image) {
        formData.append('image', data.image)
        this._logger.debug('Using provided image blob')
      } else if (data.imageUrl) {
        // 从 URL 下载图片
        this._logger.debug('Downloading main image from: %s', data.imageUrl)
        const imageBlob = await this._fetchImageAsBlob(data.imageUrl)
        if (imageBlob) {
          const ext = this._getExtFromMime(imageBlob.type)
          formData.append('image', imageBlob, `image${ext}`)
          this._logger.debug('Main image downloaded: %s, size: %d bytes', imageBlob.type, imageBlob.size)
        } else {
          return { success: false, error: `Failed to fetch main image from URL: ${data.imageUrl}` }
        }
      } else {
        return { success: false, error: 'Main image is required' }
      }

      // 可选字段
      formData.append('category', data.category || 'gallery')
      formData.append('type', data.type || 'txt2img')

      if (data.author) {
        formData.append('author', data.author)
      }
      if (data.description) {
        formData.append('description', data.description)
      }
      if (data.tags && data.tags.length > 0) {
        formData.append('tags', data.tags.join(','))
      }

      // 参考图片（仅 img2img）
      if (data.type === 'img2img' && data.referenceImages && data.referenceImages.length > 0) {
        for (let i = 0; i < data.referenceImages.length; i++) {
          const ref = data.referenceImages[i]
          // 跳过占位符
          if (ref.isPlaceholder) continue

          if (ref.blob) {
            const ext = this._getExtFromMime(ref.blob.type)
            formData.append('ref_images', ref.blob, `ref_${i}${ext}`)
          } else if (ref.url) {
            const refBlob = await this._fetchImageAsBlob(ref.url)
            if (refBlob) {
              const ext = this._getExtFromMime(refBlob.type)
              formData.append('ref_images', refBlob, `ref_${i}${ext}`)
            }
          }
        }
      }

      // 发送请求 - 使用 Koishi 的 HTTP 客户端
      this._logger.debug('Sending upload request to: %s', uploadUrl)

      // Koishi HTTP 客户端支持 FormData
      const json = await this._ctx.http.post(uploadUrl, formData, {
        timeout: 60000
      })

      this._logger.debug('Upload response: %o', json)

      // 检查响应
      // API 返回 JSON 格式 { code: 200/201, message: "..." }
      if (json.code === 200 || json.code === 201 || json.success) {
        this._logger.info('Upload successful')
        return { success: true }
      }

      // 上传失败
      const errorMsg = json.message || json.error || 'Unknown error'
      this._logger.error('Upload failed: %s', errorMsg)
      return {
        success: false,
        error: errorMsg
      }
    } catch (error: any) {
      this._logger.error('Upload error: %s', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /** 从 URL 获取图片 Blob */
  private async _fetchImageAsBlob(url: string): Promise<Blob | null> {
    try {
      this._logger.debug('Fetching image from: %s', url)

      // 使用 Koishi 的 http 服务，可以正确处理本地和远程 URL
      const response = await this._ctx.http.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000
      }) as ArrayBuffer

      if (!response || response.byteLength === 0) {
        this._logger.warn('Empty response when fetching image')
        return null
      }

      // 根据 URL 或响应推断 MIME 类型
      const mime = this._getMimeFromUrl(url)
      this._logger.debug('Fetched image: %d bytes, mime: %s', response.byteLength, mime)

      return new Blob([response], { type: mime })
    } catch (error) {
      this._logger.warn('Failed to fetch image from %s: %s', url, error)
      return null
    }
  }

  /** 根据 URL 推断 MIME 类型 */
  private _getMimeFromUrl(url: string): string {
    const lower = url.toLowerCase()
    if (lower.includes('.png')) return 'image/png'
    if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg'
    if (lower.includes('.gif')) return 'image/gif'
    if (lower.includes('.webp')) return 'image/webp'
    if (lower.includes('.bmp')) return 'image/bmp'
    // 默认 PNG
    return 'image/png'
  }

  /** 根据 MIME 类型获取文件扩展名 */
  private _getExtFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp'
    }
    return map[mime] || '.png'
  }
}

/** 上传数据 */
export interface UploadData {
  /** 标题（必填） */
  title: string
  /** 提示词（必填） */
  prompt: string
  /** 主图片 Blob */
  image?: Blob
  /** 主图片 URL（如果没有 Blob，会从 URL 下载） */
  imageUrl?: string
  /** 分类：gallery（画廊）或 template（模板） */
  category?: 'gallery' | 'template'
  /** 类型：txt2img（文生图）或 img2img（图生图） */
  type?: 'txt2img' | 'img2img'
  /** 作者 */
  author?: string
  /** 备注描述 */
  description?: string
  /** 标签数组 */
  tags?: string[]
  /** 参考图片（仅 img2img） */
  referenceImages?: Array<{
    /** 图片 Blob */
    blob?: Blob
    /** 图片 URL（如果没有 Blob，会从 URL 下载） */
    url?: string
    /** 是否是占位符 */
    isPlaceholder?: boolean
  }>
}

/** 上传结果 */
export interface UploadResult {
  success: boolean
  error?: string
  /** 是否需要审核 */
  pending?: boolean
}
