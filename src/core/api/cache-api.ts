// 缓存管理 API

import { Context } from 'koishi'
import path from 'path'

export function sanitizeOrphanFileNames(files: string[]): string[] {
  return files.map(file => path.basename(file.replace(/\\/g, '/')))
}

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
    filename,
    persistent
  }: {
    data: string  // base64 编码的数据
    mime: string
    filename?: string
    persistent?: boolean
  }) => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      // 解析 base64 数据
      const buffer = Buffer.from(data, 'base64')

      const cached = await cache.cache(buffer, mime, filename, undefined, { persistent })

      return {
        success: true,
        data: {
          id: cached.id,
          url: cached.url,  // 直接使用 cached.url
          filename: cached.filename,
          mime: cached.mime,
          size: cached.size,
          persistent: cached.persistent
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 从 URL 下载并缓存
  console.addListener('media-luna/cache/cache-url', async ({ url, persistent }: { url: string; persistent?: boolean }) => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      const cached = await cache.cacheFromUrl(url, { persistent })

      return {
        success: true,
        data: {
          id: cached.id,
          url: cached.url,  // 直接使用 cached.url
          filename: cached.filename,
          mime: cached.mime,
          size: cached.size,
          persistent: cached.persistent
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

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
          persistent: cached.persistent,
          createdAt: cached.createdAt,
          accessedAt: cached.accessedAt
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

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
  })

  // 删除缓存文件
  console.addListener('media-luna/cache/delete', async ({ id }: { id: string }) => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      const success = await cache.delete(id)
      return success
        ? { success: true }
        : { success: false, error: '该资源仍被人物设定或预设引用，不能直接删除' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

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
  })

  // 清空所有缓存
  console.addListener('media-luna/cache/clear', async () => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error

      const count = await cache.clearAll()
      return { success: true, data: { count, message: `已清理 ${count} 个临时缓存，持久参考资源未受影响` } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  console.addListener('media-luna/cache/repair-references', async () => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error
      const result = await cache.repairReferences({ downloadRemote: true, demoteUnreferenced: true })
      const missingDetail = result.unrecoverable.length > 0
        ? `；需重新上传：${result.unrecoverable.slice(0, 5).join('、')}${result.unrecoverable.length > 5 ? '等' : ''}`
        : ''
      return {
        success: true,
        data: {
          ...result,
          message: `修复完成：保护 ${result.protected}，迁移 ${result.moved}，重新登记 ${result.reindexed}，重写地址 ${result.rewritten}，远程恢复 ${result.redownloaded}，无法恢复 ${result.unrecoverable.length}${missingDetail}`
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  console.addListener('media-luna/cache/scan-orphans', async () => {
    try {
      const { cache, error } = getCacheService()
      if (error) return error
      const result = await cache.scanOrphans()
      return {
        success: true,
        data: {
          count: result.files.length,
          totalSize: result.totalSize,
          files: sanitizeOrphanFileNames(result.files),
          message: `发现 ${result.files.length} 个孤儿文件，共 ${(result.totalSize / 1024 / 1024).toFixed(1)} MB`
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  console.addListener('media-luna/cache/cleanup-orphans', async ({ confirmation }: { confirmation?: string } = {}) => {
    try {
      if (confirmation !== 'DELETE_ORPHANS') {
        return { success: false, error: '请先在管理界面确认清理孤儿文件' }
      }
      const { cache, error } = getCacheService()
      if (error) return error
      const result = await cache.cleanupOrphans(confirmation)
      return {
        success: true,
        data: {
          count: result.files.length,
          totalSize: result.totalSize,
          message: `已清理 ${result.files.length} 个孤儿文件，释放 ${(result.totalSize / 1024 / 1024).toFixed(1)} MB`
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

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
  })
}
