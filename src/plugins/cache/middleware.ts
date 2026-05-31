// 存储中间件 - 将输入文件和生成结果上传到存储后端
// 统一通过 CacheService 进行存储操作

import type {
  MiddlewareDefinition,
  MiddlewareContext,
  MiddlewareRunStatus,
  OutputAsset
} from '../../core'
import type { CacheService } from './service'
import { getExtensionFromMime } from './utils'

// ============ 中间件配置 ============

/** 存储中间件配置（从插件配置读取） */
interface StorageMiddlewareConfig {
  /** 使用的存储方案名称（不填则使用默认） */
  schemeName?: string
}

// ============ 工具函数 ============

/**
 * 解析 base64 data URL
 */
function parseBase64DataUrl(dataUrl: string): { buffer: Buffer; mime: string } | null {
  // 检查格式: data:mime;base64,data
  if (!dataUrl.startsWith('data:') || !dataUrl.includes(';base64,')) {
    return null
  }

  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex === -1) return null

  // 提取 MIME 类型
  const mimeStart = 5 // 'data:'.length
  const mimeEnd = dataUrl.indexOf(';', mimeStart)
  if (mimeEnd === -1) return null

  const mime = dataUrl.substring(mimeStart, mimeEnd)
  const base64Data = dataUrl.substring(commaIndex + 1)

  try {
    const buffer = Buffer.from(base64Data, 'base64')
    return { buffer, mime }
  } catch {
    return null
  }
}

async function downloadAsset(url: string): Promise<{ buffer: Buffer; mime: string }> {
  // 处理 base64 data URL
  if (url.startsWith('data:')) {
    const parsed = parseBase64DataUrl(url)
    if (parsed) {
      return parsed
    }
    throw new Error('无效的 base64 data URL')
  }

  // 普通 URL，使用 fetch 下载
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`下载失败: ${resp.status}`)
  const arrayBuffer = await resp.arrayBuffer()
  const mime = resp.headers.get('content-type') || 'application/octet-stream'
  return { buffer: Buffer.from(arrayBuffer), mime }
}

/**
 * 上传文件到存储后端（通过 CacheService）
 * @param schemeName 可选的存储方案名称
 */
async function uploadToBackend(
  buffer: Buffer,
  filename: string,
  mime: string,
  context: MiddlewareContext,
  schemeName?: string
): Promise<{ url: string; key: string }> {
  const cacheService = context.getService<CacheService>('cache')
  if (!cacheService) {
    throw new Error('缓存服务不可用')
  }

  const cached = await cacheService.cache(buffer, mime, filename, undefined, schemeName)
  if (!cached.url) {
    throw new Error('无法获取缓存 URL，请检查存储配置')
  }
  return { url: cached.url, key: cached.id }
}

// ============ 中间件定义 ============

/**
 * 输入文件存储中间件
 * 在 lifecycle-prepare 阶段将输入文件上传到存储后端
 */
export function createStorageInputMiddleware(): MiddlewareDefinition {
  return {
    name: 'storage-input',
    displayName: '输入文件存储',
    description: '将输入文件上传到存储后端（本地/S3/WebDAV）',
    category: 'cache',
    configGroup: 'cache',  // 关联到 plugin:cache 配置
    phase: 'lifecycle-prepare',

    async execute(context: MiddlewareContext, next): Promise<MiddlewareRunStatus> {
      // 获取缓存服务
      const cacheService = context.getService<CacheService>('cache')
      if (!cacheService) {
        return next()
      }

      // 检查服务是否启用
      if (!cacheService.isEnabled()) {
        return next()
      }

      // 没有文件时跳过
      if (!context.files || context.files.length === 0) {
        return next()
      }

      // 获取中间件配置的存储方案
      const middlewareConfig = await context.getMiddlewareConfig<StorageMiddlewareConfig>('storage-input')
      const schemeName = middlewareConfig?.schemeName || undefined
      const backend = cacheService.getSchemeBackend(schemeName)

      const uploadLogs: Array<{ index: number; filename: string; url?: string; error?: string }> = []
      const uploadedUrls: string[] = []

      for (let i = 0; i < context.files.length; i++) {
        const file = context.files[i]

        if (!file.data || file.data.byteLength === 0) {
          continue
        }

        try {
          const buffer = Buffer.from(file.data)
          const ext = getExtensionFromMime(file.mime)
          const filename = `input-${i}${ext}`

          const result = await uploadToBackend(buffer, filename, file.mime, context, schemeName)

          uploadedUrls.push(result.url)
          uploadLogs.push({ index: i, filename: file.filename, url: result.url })
        } catch (error) {
          uploadLogs.push({
            index: i,
            filename: file.filename,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      if (uploadedUrls.length > 0) {
        context.store.set('inputFileUrls', uploadedUrls)
      }

      context.setMiddlewareLog('storage-input', {
        backend,
        schemeName: schemeName || 'default',
        total: context.files.length,
        uploaded: uploadLogs.filter(l => l.url).length,
        failed: uploadLogs.filter(l => l.error).length,
        urls: uploadedUrls,
        logs: uploadLogs
      })

      return next()
    }
  }
}

/**
 * 输出存储中间件
 * 在 lifecycle-post-request 阶段将生成结果上传到存储后端
 */
export function createStorageMiddleware(): MiddlewareDefinition {
  return {
    name: 'storage',
    displayName: '存储缓存',
    description: '将生成结果上传到存储后端（本地/S3/WebDAV）',
    category: 'cache',
    configGroup: 'cache',  // 关联到 plugin:cache 配置
    phase: 'lifecycle-post-request',

    async execute(context: MiddlewareContext, next): Promise<MiddlewareRunStatus> {
      // 获取缓存服务
      const cacheService = context.getService<CacheService>('cache')
      if (!cacheService) {
        return next()
      }

      // 检查服务是否启用
      if (!cacheService.isEnabled()) {
        return next()
      }

      // 没有输出时跳过
      if (!context.output || context.output.length === 0) {
        return next()
      }

      // 获取中间件配置的存储方案
      const middlewareConfig = await context.getMiddlewareConfig<StorageMiddlewareConfig>('storage')
      const schemeName = middlewareConfig?.schemeName || undefined
      const backend = cacheService.getSchemeBackend(schemeName)

      const uploadedAssets: OutputAsset[] = []
      const uploadLogs: Array<{ index: number; originalUrl: string; newUrl?: string; error?: string }> = []

      for (let i = 0; i < context.output.length; i++) {
        const asset = context.output[i]

        // 跳过文本类型或没有 URL 的资产
        if (asset.kind === 'text' || !asset.url) {
          uploadedAssets.push(asset)
          continue
        }

        try {
          const { buffer, mime } = await downloadAsset(asset.url)
          const filename = `output-${asset.kind}-${i}`

          const result = await uploadToBackend(buffer, filename, mime, context, schemeName)

          const isBase64 = asset.url.startsWith('data:')
          uploadedAssets.push({
            ...asset,
            url: result.url,
            meta: {
              ...asset.meta,
              ...(isBase64 ? {} : { originalUrl: asset.url }),
              storageKey: result.key,
              storageBackend: backend,
              storageSchemeName: schemeName || 'default'
            }
          })

          uploadLogs.push({
            index: i,
            originalUrl: isBase64 ? '[base64 data]' : asset.url,
            newUrl: result.url
          })
        } catch (error) {
          uploadedAssets.push(asset)
          const isBase64 = asset.url.startsWith('data:')
          uploadLogs.push({
            index: i,
            originalUrl: isBase64 ? '[base64 data]' : asset.url,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      context.output = uploadedAssets

      context.setMiddlewareLog('storage', {
        backend,
        schemeName: schemeName || 'default',
        total: context.output.length,
        uploaded: uploadLogs.filter(l => l.newUrl).length,
        failed: uploadLogs.filter(l => l.error).length,
        logs: uploadLogs
      })

      return next()
    }
  }
}
