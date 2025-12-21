// 预设管理 API

import { Context } from 'koishi'
import type { PresetData } from '../../plugins/preset'

/**
 * 注册预设管理 API
 */
export function registerPresetApi(ctx: Context): void {
  const console = ctx.console as any

  /** 获取预设服务，如不可用则返回错误响应 */
  const getPresetService = () => {
    const presets = ctx.mediaLuna.presets
    if (!presets) {
      return { error: { success: false, error: 'Preset service not available' } }
    }
    return { presets }
  }

  /** 获取远程同步服务 */
  const getRemoteSyncService = () => {
    const remotePresets = ctx.mediaLuna.remotePresets
    if (!remotePresets) {
      return { error: { success: false, error: 'Remote sync service not available' } }
    }
    return { remotePresets }
  }

  // 获取预设列表
  console.addListener('media-luna/presets/list', async ({ enabledOnly }: { enabledOnly?: boolean } = {}) => {
    try {
      const { presets, error } = getPresetService()
      if (error) return error

      const list = enabledOnly
        ? await presets.listEnabled()
        : await presets.list()
      return { success: true, data: list }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取单个预设
  console.addListener('media-luna/presets/get', async ({ id }: { id: number }) => {
    try {
      const { presets, error } = getPresetService()
      if (error) return error

      const preset = await presets.getById(id)
      if (!preset) {
        return { success: false, error: 'Preset not found' }
      }
      return { success: true, data: preset }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 创建预设
  console.addListener('media-luna/presets/create', async (data: Partial<Omit<PresetData, 'id'>>) => {
    try {
      const { presets, error } = getPresetService()
      if (error) return error

      if (!data.name) {
        return { success: false, error: 'Name is required' }
      }
      if (!data.promptTemplate) {
        return { success: false, error: 'Prompt template is required' }
      }

      const existing = await presets.getByName(data.name)
      if (existing) {
        return { success: false, error: 'Preset name already exists' }
      }

      // 前端已通过缓存服务处理图片，直接使用传入的 URL
      const preset = await presets.create({
        name: data.name,
        promptTemplate: data.promptTemplate,
        tags: data.tags || [],
        referenceImages: data.referenceImages || [],
        parameterOverrides: data.parameterOverrides || {},
        source: data.source || 'user',
        enabled: data.enabled ?? true,
        thumbnail: data.thumbnail
      })

      return { success: true, data: preset }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 更新预设
  console.addListener('media-luna/presets/update', async ({ id, data }: { id: number, data: Partial<Omit<PresetData, 'id'>> }) => {
    try {
      const { presets, error } = getPresetService()
      if (error) return error

      if (data.name) {
        const existing = await presets.getByName(data.name)
        if (existing && existing.id !== id) {
          return { success: false, error: 'Preset name already exists' }
        }
      }

      // 前端已通过缓存服务处理图片，直接保存传入的 URL
      const preset = await presets.update(id, data)
      if (!preset) {
        return { success: false, error: 'Preset not found' }
      }

      return { success: true, data: preset }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 删除预设
  console.addListener('media-luna/presets/delete', async ({ id }: { id: number }) => {
    try {
      const { presets, error } = getPresetService()
      if (error) return error

      const deleted = await presets.delete(id)
      if (!deleted) {
        return { success: false, error: 'Preset not found' }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 切换预设启用状态
  console.addListener('media-luna/presets/toggle', async ({ id, enabled }: { id: number, enabled: boolean }) => {
    try {
      const { presets, error } = getPresetService()
      if (error) return error

      const preset = await presets.update(id, { enabled })
      if (!preset) {
        return { success: false, error: 'Preset not found' }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取所有预设标签
  console.addListener('media-luna/presets/tags', async () => {
    try {
      const { presets, error } = getPresetService()
      if (error) return error

      const tags = await presets.getAllTags()
      return { success: true, data: tags }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 根据标签获取预设
  console.addListener('media-luna/presets/by-tags', async ({ tags, matchAll }: { tags: string[], matchAll?: boolean }) => {
    try {
      const { presets, error } = getPresetService()
      if (error) return error

      const list = matchAll
        ? await presets.getByAllTags(tags)
        : await presets.getByTags(tags)
      return { success: true, data: list }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取与渠道匹配的预设
  console.addListener('media-luna/presets/matching', async ({ channelId }: { channelId: number }) => {
    try {
      const { presets, error } = getPresetService()
      if (error) return error

      const channel = await ctx.mediaLuna.channels.getById(channelId)
      if (!channel) {
        return { success: false, error: 'Channel not found' }
      }
      const list = await presets.getMatchingPresets(channel.tags)
      return { success: true, data: list }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 复制预设
  console.addListener('media-luna/presets/copy', async ({ id }: { id: number }) => {
    try {
      const { presets, error } = getPresetService()
      if (error) return error

      const original = await presets.getById(id)
      if (!original) {
        return { success: false, error: 'Preset not found' }
      }

      const allPresets = await presets.list()
      let newName = `${original.name} - 副本`
      let counter = 1
      while (allPresets.some(p => p.name === newName)) {
        newName = `${original.name} - 副本 (${counter})`
        counter++
      }

      const newPreset = await presets.create({
        name: newName,
        promptTemplate: original.promptTemplate,
        tags: original.tags,
        referenceImages: original.referenceImages,
        parameterOverrides: original.parameterOverrides,
        source: 'user',
        enabled: true
      })

      return { success: true, data: newPreset }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // ========== 远程同步 API ==========

  // 手动触发同步
  console.addListener('media-luna/presets/sync', async ({
    apiUrl,
    deleteRemoved = false,
    thumbnailDelay
  }: {
    apiUrl?: string
    deleteRemoved?: boolean
    thumbnailDelay?: number
  } = {}) => {
    try {
      const { remotePresets, error } = getRemoteSyncService()
      if (error) return error

      // 从插件配置获取默认值
      const presetConfig = ctx.mediaLuna.configService.get<{
        apiUrl?: string
        thumbnailDelay?: number
      }>('plugin:preset', {})

      const url = apiUrl || presetConfig.apiUrl || 'https://prompt.vioaki.xyz/api/templates?per_page=-1'
      const delay = thumbnailDelay ?? presetConfig.thumbnailDelay ?? 100

      const result = await remotePresets.sync(url, deleteRemoved, delay)

      if (!result.success) {
        return {
          success: false,
          error: result.errors.length > 0 ? result.errors.join('; ') : '同步失败'
        }
      }

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
  })

  // 获取同步配置
  console.addListener('media-luna/presets/sync-config', async () => {
    try {
      const config = await ctx.mediaLuna.getRemotePresetConfig()
      return { success: true, data: config }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 更新同步配置
  console.addListener('media-luna/presets/sync-config/update', async (config: {
    apiUrl?: string
    autoSync?: boolean
    syncInterval?: number
    deleteRemoved?: boolean
  }) => {
    try {
      await ctx.mediaLuna.setRemotePresetConfig(config)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 清空所有远程同步的预设
  console.addListener('media-luna/presets/clear-remote', async () => {
    try {
      const presetService = ctx.mediaLuna.getService<any>('preset')
      if (!presetService) {
        return { success: false, error: 'Preset service not available' }
      }

      const count = await presetService.deleteAllRemote()
      return {
        success: true,
        data: {
          deleted: count,
          message: count > 0 ? `已删除 ${count} 个远程预设` : '没有远程预设需要删除'
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}
