// 设置面板 API

import { Context } from 'koishi'

// 包信息
const PACKAGE_NAME = 'koishi-plugin-media-luna'

/**
 * 比较语义化版本号
 * @returns 正数表示 v1 > v2，负数表示 v1 < v2，0 表示相等
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  const len = Math.max(parts1.length, parts2.length)

  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 !== p2) return p1 - p2
  }
  return 0
}

/**
 * 注册设置面板 API
 */
export function registerSettingsApi(ctx: Context): void {
  const console = ctx.console as any

  // 获取版本信息
  console.addListener('media-luna/version/check', async () => {
    try {
      // 从服务获取当前版本
      const currentVersion = ctx.mediaLuna?.version || 'unknown'

      // 从 npm registry 获取最新版本
      let latestVersion = currentVersion
      let hasUpdate = false

      try {
        const response = await ctx.http.get(`https://registry.npmmirror.com/${PACKAGE_NAME}/latest`, {
          timeout: 5000
        })
        if (response?.version) {
          latestVersion = response.version
          hasUpdate = compareVersions(latestVersion, currentVersion) > 0
        }
      } catch (e) {
        // 网络错误时不报错，只返回当前版本
        ctx.logger('media-luna').debug('Failed to check latest version:', e)
      }

      return {
        success: true,
        data: {
          current: currentVersion,
          latest: latestVersion,
          hasUpdate,
          packageName: PACKAGE_NAME,
          npmUrl: `https://www.npmjs.com/package/${PACKAGE_NAME}`
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取所有设置面板
  console.addListener('media-luna/settings/panels', async () => {
    try {
      const panels = await ctx.mediaLuna.getSettingsPanelInfos()
      return { success: true, data: panels }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取单个设置面板配置
  console.addListener('media-luna/settings/get', async ({ id }: { id: string }) => {
    try {
      const panels = await ctx.mediaLuna.getSettingsPanelInfos()
      const panel = panels.find(p => p.id === id)
      if (!panel) {
        return { success: false, error: 'Settings panel not found' }
      }
      return { success: true, data: panel }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 更新设置面板配置（仅支持 custom 类型）
  console.addListener('media-luna/settings/update', async ({
    id,
    config
  }: {
    id: string
    config: Record<string, any>
  }) => {
    try {
      const panel = ctx.mediaLuna.settingsPanels.find(p => p.id === id)
      if (!panel) {
        return { success: false, error: 'Settings panel not found' }
      }
      if (panel.type !== 'custom' || !panel.configKey) {
        return { success: false, error: 'This panel does not support custom configuration' }
      }

      // 使用 ConfigService 保存配置
      ctx.mediaLuna.configService.set(panel.configKey, config)

      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取远程预设同步配置
  console.addListener('media-luna/settings/remote-presets/config', async () => {
    try {
      const config = await ctx.mediaLuna.getRemotePresetConfig()
      return { success: true, data: config }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 更新远程预设同步配置
  console.addListener('media-luna/settings/remote-presets/update', async ({
    config
  }: {
    config: Partial<{
      apiUrl: string
      autoSync: boolean
      syncInterval: number
      deleteRemoved: boolean
    }>
  }) => {
    try {
      await ctx.mediaLuna.setRemotePresetConfig(config)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 手动触发远程预设同步
  console.addListener('media-luna/settings/remote-presets/sync', async () => {
    try {
      const config = await ctx.mediaLuna.getRemotePresetConfig()
      const remotePresets = ctx.mediaLuna.remotePresets
      if (!remotePresets) {
        return { success: false, error: 'Remote presets service not available' }
      }
      const result = await remotePresets.sync(config.apiUrl, config.deleteRemoved)
      return {
        success: true,
        data: {
          added: result.added,
          updated: result.updated,
          removed: result.removed,
          notModified: result.notModified
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 强制同步（清除 ETag 缓存后同步）
  console.addListener('media-luna/settings/remote-presets/force-sync', async () => {
    try {
      const config = await ctx.mediaLuna.getRemotePresetConfig()
      const remotePresets = ctx.mediaLuna.remotePresets
      if (!remotePresets) {
        return { success: false, error: 'Remote presets service not available' }
      }
      // 清除 ETag 缓存，强制完整拉取
      remotePresets.clearEtagCache(config.apiUrl)
      const result = await remotePresets.sync(config.apiUrl, config.deleteRemoved)
      return {
        success: true,
        data: {
          added: result.added,
          updated: result.updated,
          removed: result.removed,
          notModified: result.notModified
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })
}
