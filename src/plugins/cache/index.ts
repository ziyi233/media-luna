// 缓存插件入口

import { createReadStream } from 'fs'
import { basename } from 'path'
import { definePlugin } from '../../core'
import { CacheService } from './service'
import { createStorageMiddleware, createStorageInputMiddleware } from './middleware'
import { cacheConfigFields, defaultCacheConfig, type CachePluginConfig } from './config'

export default definePlugin({
  id: 'cache',
  name: '缓存管理',
  description: '本地文件缓存和外部存储支持（S3/WebDAV）',
  version: '1.0.0',

  contributes: {
    services: [
      {
        name: 'cache',
        factory: (ctx) => {
          const config = ctx.getConfig<CachePluginConfig>()
          return new CacheService(ctx.ctx, { ...defaultCacheConfig, ...config })
        }
      }
    ],
    middlewares: [
      createStorageInputMiddleware(),
      createStorageMiddleware()
    ]
  },

  // 所有配置都在"扩展插件"面板显示
  configFields: cacheConfigFields,
  configDefaults: defaultCacheConfig,

  settingsActions: [
    {
      name: 'test',
      label: '测试连接',
      type: 'primary',
      icon: 'check',
      apiEvent: 'media-luna/cache/test'
    },
    {
      name: 'stats',
      label: '查看统计',
      type: 'default',
      icon: 'chart',
      apiEvent: 'media-luna/cache/stats'
    },
    {
      name: 'clear',
      label: '清空缓存',
      type: 'error',
      icon: 'delete',
      apiEvent: 'media-luna/cache/clear'
    }
  ],

  async onLoad(ctx) {
    ctx.logger.info('Cache plugin loaded')

    // 获取配置的 publicPath
    const config = ctx.getConfig<CachePluginConfig>()
    const publicPath = config.publicPath || defaultCacheConfig.publicPath

    // 注册 HTTP 路由提供缓存文件访问
    ctx.ctx.inject(['server'], (injectedCtx) => {
      const cache = ctx.getService<CacheService>('cache')
      if (!cache) {
        ctx.logger.warn('Cache service not available, skipping HTTP route registration')
        return
      }

      // 获取 selfUrl 并设置 baseUrl
      const selfUrl = injectedCtx.server.config.selfUrl
      if (selfUrl) {
        cache.setBaseUrl(selfUrl.replace(/\/$/, ''))
        ctx.logger.info('Cache HTTP route registered at %s', publicPath)
      } else {
        ctx.logger.warn('selfUrl not configured, cache URLs will not be available')
      }

      // 注册文件访问路由: {publicPath}/:filename
      injectedCtx.server.get(publicPath + '/:filename', async (koaCtx) => {
        const filename = koaCtx.params.filename
        // 从文件名中提取 ID（去掉扩展名）
        const id = basename(filename).replace(/\.[^.]+$/, '')

        const cached = await cache.get(id)
        if (!cached) {
          koaCtx.status = 404
          koaCtx.body = 'Not found'
          return
        }

        // 更新访问时间已在 get() 中处理
        const stream = createReadStream(cached.localPath)
        koaCtx.type = cached.mime
        koaCtx.body = stream
      })
    })
  }
})

// 导出类型和服务
export { CacheService } from './service'
export type { CachedFile, CacheStats } from './service'
export type { CachePluginConfig, StorageConfig, LocalCacheConfig } from './config'
