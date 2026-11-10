// 缓存管理 API

import { Context } from 'koishi'

/**
 * 注册缓存管理 API
 */
export function registerCacheApi(ctx: Context): void {
  const console = ctx.console as any

  /** 获取缓存服务，如不可用则返回错误响应 */
  const getCacheService = () => {
    const cache = ctx.mediaLuna.cache
    if (!cache) {
      return { error: { success: false, error: 'Cache service not available' } }
    }
    return { cache }
  }

  // 上传文件到缓存
  console.addListener('media-luna/cache/upload', async ({
    data,
    mime,
    filename
  }: {
    data: string  // base64 编码的数据
    mime: string
    filename?: string
  }) => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      // 解析 base64 数据
      const buffer = Buffer.from(data, 'base64')

      const cached = await cache.cache(buffer, mime, filename)

      return {
        success: true,
        data: {
          id: cached.id,
          url: cached.url,  // 直接使用 cached.url
          filename: cached.filename,
          mime: cached.mime,
          size: cached.size
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 从 URL 下载并缓存
  console.addListener('media-luna/cache/cache-url', async ({ url }: { url: string }) => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      const cached = await cache.cacheFromUrl(url)

      return {
        success: true,
        data: {
          id: cached.id,
          url: cached.url,  // 直接使用 cached.url
          filename: cached.filename,
          mime: cached.mime,
          size: cached.size
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取缓存文件信息
  console.addListener('media-luna/cache/get', async ({ id }: { id: string }) => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      const cached = await cache.get(id)
      if (!cached) {
        return { success: false, error: 'Cache not found' }
      }

      return {
        success: true,
        data: {
          id: cached.id,
          url: cached.url,  // 直接使用 cached.url
          filename: cached.filename,
          mime: cached.mime,
          size: cached.size,
          createdAt: cached.createdAt,
          accessedAt: cached.accessedAt
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 读取缓存文件内容（返回 base64 Data URL）
  console.addListener('media-luna/cache/read', async ({ id }: { id: string }) => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      const dataUrl = await cache.readAsDataUrl(id)
      if (!dataUrl) {
        return { success: false, error: 'Cache not found' }
      }
      return { success: true, data: dataUrl }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 删除缓存文件
  console.addListener('media-luna/cache/delete', async ({ id }: { id: string }) => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      const success = await cache.delete(id)
      return { success }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取缓存统计信息
  console.addListener('media-luna/cache/stats', async () => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      const stats = await cache.getStats()
      return { success: true, data: stats }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 清空所有缓存
  console.addListener('media-luna/cache/clear', async () => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      await cache.clearAll()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 测试存储连接
  console.addListener('media-luna/cache/test', async () => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      const result = await cache.testConnection()
      return {
        success: result.success,
        data: result.success ? {
          backend: cache.getBackend(),
          url: result.url,
          duration: result.duration,
          message: result.message
        } : undefined,
        error: result.success ? undefined : result.message
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })
}
