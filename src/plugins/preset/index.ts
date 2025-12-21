// 预设插件入口

import { definePlugin } from '../../core'
import { PresetService } from './service'
import { RemoteSyncService } from './remote-sync.service'
import { createPresetMiddleware } from './middleware'
import { presetConfigFields, defaultPresetConfig, type PresetPluginConfig } from './config'
import type { CacheService } from '../cache/service'

export default definePlugin({
  id: 'preset',
  name: '预设管理',
  description: '预设模板和远程同步支持',
  version: '1.0.0',

  services: [
    {
      name: 'preset',
      factory: (ctx) => new PresetService(ctx.ctx)
    },
    {
      name: 'remote-sync',
      factory: (ctx) => {
        const presetService = ctx.getService<PresetService>('preset')!
        // 提供一个获取缓存服务的回调，避免直接访问 ctx.mediaLuna 导致的警告
        const getCacheService = () => ctx.getService<CacheService>('cache')
        return new RemoteSyncService(ctx.ctx, presetService, getCacheService)
      }
    }
  ],

  middlewares: [
    createPresetMiddleware()
  ],

  configFields: presetConfigFields,
  configDefaults: defaultPresetConfig,

  settingsActions: [
    {
      name: 'sync',
      label: '立即同步',
      type: 'primary',
      icon: 'sync',
      apiEvent: 'media-luna/presets/sync'
    },
    {
      name: 'clear-remote',
      label: '清空远程预设',
      type: 'error',
      icon: 'delete',
      apiEvent: 'media-luna/presets/clear-remote'
    }
  ],

  async onLoad(ctx) {
    const remoteSyncService = ctx.getService<RemoteSyncService>('remote-sync')!

    // 启动自动同步
    const config = ctx.getConfig<PresetPluginConfig>()
    if (config.autoSync && config.apiUrl) {
      remoteSyncService.startAutoSync(config)
    }

    // 注册 dispose 回调
    ctx.onDispose(() => {
      remoteSyncService.dispose()
    })

    ctx.logger.info('Preset plugin loaded')
  }
})

// 导出类型和服务
export { PresetService, PresetData } from './service'
export { RemoteSyncService, SyncResult } from './remote-sync.service'
export type { PresetPluginConfig, PresetMiddlewareConfig, RemoteSyncConfig } from './config'
