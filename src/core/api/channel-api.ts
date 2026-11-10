// 渠道管理 API

import { Context } from 'koishi'
import { ChannelConfig } from '../../types'

/**
 * 注册渠道管理 API
 */
export function registerChannelApi(ctx: Context): void {
  const console = ctx.console as any

  // 获取渠道列表
  console.addListener('media-luna/channels/list', async () => {
    try {
      const channels = await ctx.mediaLuna.channels.list()
      return { success: true, data: channels }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取启用的渠道列表
  console.addListener('media-luna/channels/list-enabled', async () => {
    try {
      const channels = await ctx.mediaLuna.channels.listEnabled()
      return { success: true, data: channels }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取单个渠道
  console.addListener('media-luna/channels/get', async ({ id }: { id: number }) => {
    try {
      const channel = await ctx.mediaLuna.channels.getById(id)
      if (!channel) {
        return { success: false, error: 'Channel not found' }
      }
      return { success: true, data: channel }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 创建渠道
  console.addListener('media-luna/channels/create', async (data: Partial<Omit<ChannelConfig, 'id'>>) => {
    try {
      // 验证必填字段
      if (!data.name) {
        return { success: false, error: 'Name is required' }
      }

      if (!data.connectorId) {
        return { success: false, error: 'Connector ID is required' }
      }

      // 检查名称是否已存在
      const existing = await ctx.mediaLuna.channels.getByName(data.name)
      if (existing) {
        return { success: false, error: 'Channel name already exists' }
      }

      // 检查连接器是否存在
      if (!ctx.mediaLuna.connectors.has(data.connectorId)) {
        return { success: false, error: `Connector not found: ${data.connectorId}` }
      }

      const channel = await ctx.mediaLuna.channels.create({
        name: data.name,
        enabled: data.enabled ?? true,
        connectorId: data.connectorId,
        connectorConfig: data.connectorConfig || {},
        pluginOverrides: data.pluginOverrides || {},
        tags: data.tags || []
      })

      return { success: true, data: channel }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 更新渠道
  console.addListener('media-luna/channels/update', async ({ id, data }: { id: number, data: Partial<Omit<ChannelConfig, 'id'>> }) => {
    try {
      // 如果修改名称，检查是否与其他渠道冲突
      if (data.name) {
        const existing = await ctx.mediaLuna.channels.getByName(data.name)
        if (existing && existing.id !== id) {
          return { success: false, error: 'Channel name already exists' }
        }
      }

      // 如果修改连接器，检查是否存在
      if (data.connectorId && !ctx.mediaLuna.connectors.has(data.connectorId)) {
        return { success: false, error: `Connector not found: ${data.connectorId}` }
      }

      const channel = await ctx.mediaLuna.channels.update(id, data)
      if (!channel) {
        return { success: false, error: 'Channel not found' }
      }

      return { success: true, data: channel }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 删除渠道
  console.addListener('media-luna/channels/delete', async ({ id }: { id: number }) => {
    try {
      const deleted = await ctx.mediaLuna.channels.delete(id)
      if (!deleted) {
        return { success: false, error: 'Channel not found' }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 切换渠道启用状态
  console.addListener('media-luna/channels/toggle', async ({ id, enabled }: { id: number, enabled: boolean }) => {
    try {
      const channel = await ctx.mediaLuna.channels.update(id, { enabled })
      if (!channel) {
        return { success: false, error: 'Channel not found' }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取所有渠道标签
  console.addListener('media-luna/channels/tags', async () => {
    try {
      const tags = await ctx.mediaLuna.channels.getAllTags()
      return { success: true, data: tags }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 根据标签获取渠道
  console.addListener('media-luna/channels/by-tags', async ({ tags, matchAll }: { tags: string[], matchAll?: boolean }) => {
    try {
      const channels = matchAll
        ? await ctx.mediaLuna.channels.getByAllTags(tags)
        : await ctx.mediaLuna.channels.getByTags(tags)
      return { success: true, data: channels }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })
}
