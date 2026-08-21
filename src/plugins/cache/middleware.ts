// 存储中间件 - 将输入文件和生成结果上传到存储后端
// 统一通过 CacheService 进行存储操作

import type { Context } from 'koishi'
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
  /**
   * 下载生成资产时附加的请求头（如需要鉴权的上游：Authorization: Bearer xxx）
   * 部分上游（如 sub2api 中转）的视频/图片下载端点要求鉴权，不配置会 401 导致上传失败
   */
  downloadHeaders?: Record<string, string>
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

function resolveDownloadHeaders(
  url: string,
  middlewareConfig?: StorageMiddlewareConfig | null,
  channel?: { connectorConfig?: Record<string, any> } | null
): Record<string, string> {
  const headers: Record<string, string> = { ...(middlewareConfig?.downloadHeaders || {}) }
  if (headers.Authorization || headers.authorization) return headers

  const apiKey = channel?.connectorConfig?.apiKey
  const apiUrl = channel?.connectorConfig?.apiUrl
  if (!apiKey || !apiUrl) return headers

  try {
    if (new URL(url).origin === new URL(apiUrl).origin) {
      headers.Authorization = `Bearer ${apiKey}`
    }
  } catch {
    // 非法 URL 时不加渠道鉴权，交给后续下载报错
  }
  return headers
}

async function downloadAsset(
  url: string,
  options?: { headers?: Record<string, string>; ctx?: Context }
): Promise<{ buffer: Buffer; mime: string }> {
  // 处理 base64 data URL
  if (url.startsWith('data:')) {
    const parsed = parseBase64DataUrl(url)
    if (parsed) {
      return parsed
    }
    throw new Error('无效的 base64 data URL')
  }

  const headers = options?.headers || {}

  // 优先使用 koishi HTTP 服务下载：自动继承全局代理配置，且支持附加请求头
  if (options?.ctx) {
    // ctx.http 为可调用服务（非 axios 实例），返回 fetch 风格 Response，data 为解码后的内容
    const http = options.ctx.http as unknown as (url: string, config: Record<string, any>) => Promise<any>
    const resp = await http(url, {
      method: 'GET',
      headers,
      timeout: 60000
    })
    const status = typeof resp?.status === 'number' ? resp.status
      : typeof resp?.statusCode === 'number' ? resp.statusCode
      : undefined
    if (resp?.ok === false || (typeof status === 'number' && status >= 400)) {
      throw new Error(`下载失败: ${status ?? 'unknown'}`)
    }
    const mime = resp.headers?.get?.('content-type') || 'application/octet-stream'
    const data = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data)
    return { buffer: data, mime }
  }

  // 兜底：原生 fetch 下载
  const resp = await fetch(url, { headers })
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
  mctx: MiddlewareContext,
  schemeName?: string
): Promise<{ url: string; key: string }> {
  const cacheService = mctx.getService<CacheService>('cache')
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

    async execute(mctx: MiddlewareContext, next): Promise<MiddlewareRunStatus> {
      // 获取缓存服务
      const cacheService = mctx.getService<CacheService>('cache')
      if (!cacheService) {
        return next()
      }

      // 检查服务是否启用
      if (!cacheService.isEnabled()) {
        return next()
      }

      // 没有文件时跳过
      if (!mctx.files || mctx.files.length === 0) {
        return next()
      }

      // 获取中间件配置的存储方案
      const middlewareConfig = await mctx.getMiddlewareConfig<StorageMiddlewareConfig>('storage-input')
      const schemeName = middlewareConfig?.schemeName || undefined
      const backend = cacheService.getSchemeBackend(schemeName)

      const uploadLogs: Array<{ index: number; filename: string; url?: string; error?: string }> = []
      const uploadedUrls: string[] = []

      for (let i = 0; i < mctx.files.length; i++) {
        const file = mctx.files[i]

        if (!file.data || file.data.byteLength === 0) {
          continue
        }

        try {
          const buffer = Buffer.from(file.data)
          const ext = getExtensionFromMime(file.mime)
          const filename = `input-${i}${ext}`

          const result = await uploadToBackend(buffer, filename, file.mime, mctx, schemeName)

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
        mctx.store.set('inputFileUrls', uploadedUrls)
      }

      mctx.setMiddlewareLog('storage-input', {
        backend,
        schemeName: schemeName || 'default',
        total: mctx.files.length,
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

    async execute(mctx: MiddlewareContext, next): Promise<MiddlewareRunStatus> {
      // 获取缓存服务
      const cacheService = mctx.getService<CacheService>('cache')
      if (!cacheService) {
        return next()
      }

      // 检查服务是否启用
      if (!cacheService.isEnabled()) {
        return next()
      }

      // 没有输出时跳过
      if (!mctx.output || mctx.output.length === 0) {
        return next()
      }

      // 获取中间件配置的存储方案
      const middlewareConfig = await mctx.getMiddlewareConfig<StorageMiddlewareConfig>('storage')
      const schemeName = middlewareConfig?.schemeName || undefined
      const backend = cacheService.getSchemeBackend(schemeName)

      const uploadedAssets: OutputAsset[] = []
      const uploadLogs: Array<{ index: number; originalUrl: string; newUrl?: string; error?: string }> = []

      for (let i = 0; i < mctx.output.length; i++) {
        const asset = mctx.output[i]

        // 跳过文本类型或没有 URL 的资产
        if (asset.kind === 'text' || !asset.url) {
          uploadedAssets.push(asset)
          continue
        }

        try {
          const { buffer, mime } = await downloadAsset(asset.url, {
            ctx: mctx.ctx,
            headers: resolveDownloadHeaders(asset.url, middlewareConfig, mctx.channel)
          })
          const filename = `output-${asset.kind}-${i}`

          const result = await uploadToBackend(buffer, filename, mime, mctx, schemeName)

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

      mctx.output = uploadedAssets

      mctx.setMiddlewareLog('storage', {
        backend,
        schemeName: schemeName || 'default',
        total: mctx.output.length,
        uploaded: uploadLogs.filter(l => l.newUrl).length,
        failed: uploadLogs.filter(l => l.error).length,
        logs: uploadLogs
      })

      return next()
    }
  }
}
