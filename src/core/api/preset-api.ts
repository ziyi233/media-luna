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
  }, { authority: 3 })

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
  }, { authority: 3 })

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
  }, { authority: 3 })

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
  }, { authority: 3 })

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
  }, { authority: 3 })

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
  }, { authority: 3 })

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
  }, { authority: 3 })

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
  }, { authority: 3 })

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
  }, { authority: 3 })

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
  }, { authority: 3 })

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
  }, { authority: 3 })

  // 获取同步配置
  console.addListener('media-luna/presets/sync-config', async () => {
    try {
      const config = await ctx.mediaLuna.getRemotePresetConfig()
      return { success: true, data: config }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

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
  }, { authority: 3 })

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
  }, { authority: 3 })

  // ========== 上传 API ==========

  // 获取上传配置
  console.addListener('media-luna/presets/upload-config', async () => {
    try {
      const presetConfig = ctx.mediaLuna.configService.get<{
        uploadUrl?: string
        defaultAuthor?: string
      }>('plugin:preset', {})

      return {
        success: true,
        data: {
          uploadUrl: presetConfig.uploadUrl || '',
          defaultAuthor: presetConfig.defaultAuthor || '',
          enabled: !!presetConfig.uploadUrl
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 上传预设到远程
  console.addListener('media-luna/presets/upload', async (data: {
    title: string
    prompt: string
    imageUrl?: string
    category?: 'gallery' | 'template'
    type?: 'txt2img' | 'img2img'
    author?: string
    description?: string
    tags?: string[]
    referenceImages?: Array<{ url?: string; isPlaceholder?: boolean }>
  }) => {
    try {
      const { remotePresets, error } = getRemoteSyncService()
      if (error) return error

      // 从配置获取上传 URL 和默认作者
      const presetConfig = ctx.mediaLuna.configService.get<{
        uploadUrl?: string
        defaultAuthor?: string
      }>('plugin:preset', {})

      const uploadUrl = presetConfig.uploadUrl
      if (!uploadUrl) {
        return { success: false, error: '未配置上传地址' }
      }

      // 使用默认作者（如果未指定）
      const author = data.author || presetConfig.defaultAuthor || ''

      const result = await remotePresets.upload(uploadUrl, {
        title: data.title,
        prompt: data.prompt,
        imageUrl: data.imageUrl,
        category: data.category || 'gallery',
        type: data.type || 'txt2img',
        author,
        description: data.description,
        tags: data.tags,
        referenceImages: data.referenceImages?.map(ref => ({
          url: ref.url,
          isPlaceholder: ref.isPlaceholder
        }))
      })

      if (!result.success) {
        return { success: false, error: result.error }
      }

      return {
        success: true,
        data: {
          pending: result.pending,
          message: result.pending ? '上传成功，等待审核' : '上传成功'
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 上传任务生成结果到远程
  console.addListener('media-luna/presets/upload-task', async (data: {
    taskId: number
    assetIndex?: number
    title: string
    category?: 'gallery' | 'template'
    author?: string
    description?: string
    tags?: string[]
  }) => {
    try {
      const { remotePresets, error } = getRemoteSyncService()
      if (error) return error

      // 获取任务数据
      const taskService = ctx.mediaLuna.tasks
      if (!taskService) {
        return { success: false, error: 'Task service not available' }
      }

      const task = await taskService.getById(data.taskId)
      if (!task) {
        return { success: false, error: '任务不存在' }
      }

      if (task.status !== 'success' || !task.responseSnapshot?.length) {
        return { success: false, error: '任务没有可上传的结果' }
      }

      // 获取配置
      const presetConfig = ctx.mediaLuna.configService.get<{
        uploadUrl?: string
        defaultAuthor?: string
      }>('plugin:preset', {})

      const uploadUrl = presetConfig.uploadUrl
      if (!uploadUrl) {
        return { success: false, error: '未配置上传地址' }
      }

      // 确定要上传的资产
      const assetIndex = data.assetIndex ?? 0
      const asset = task.responseSnapshot[assetIndex]
      if (!asset || !asset.url) {
        return { success: false, error: '无效的资产索引' }
      }

      // 获取提示词
      const prompt = (task.middlewareLogs as any)?.preset?.transformedPrompt
        || task.requestSnapshot?.prompt
        || ''

      // 确定类型
      const hasRefImages = task.requestSnapshot?.files && task.requestSnapshot.files.length > 0
      const type = hasRefImages ? 'img2img' : 'txt2img'

      // 构建参考图片
      const referenceImages = hasRefImages
        ? task.requestSnapshot!.files!.map((file: any) => ({
            url: typeof file === 'string' ? file : (file.url || file.data)
          }))
        : undefined

      const author = data.author || presetConfig.defaultAuthor || ''

      const result = await remotePresets.upload(uploadUrl, {
        title: data.title,
        prompt,
        imageUrl: asset.url,
        category: data.category || 'gallery',
        type,
        author,
        description: data.description,
        tags: data.tags,
        referenceImages
      })

      if (!result.success) {
        return { success: false, error: result.error }
      }

      return {
        success: true,
        data: {
          pending: result.pending,
          message: result.pending ? '上传成功，等待审核' : '上传成功'
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })
}
