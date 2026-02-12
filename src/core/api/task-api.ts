// 任务管理 API

import { Context } from 'koishi'
import { Status } from '@satorijs/protocol'
import type { TaskStatus } from '../../plugins/task'
import { getUidFromAuth } from './api-utils'

/**
 * 注册任务管理 API
 */
export function registerTaskApi(ctx: Context): void {
  const console = ctx.console as any

  /** 获取任务服务，如不可用则返回错误响应 */
  const getTaskService = () => {
    const tasks = ctx.mediaLuna.tasks
    if (!tasks) {
      return { error: { success: false, error: 'Task service not available' } }
    }
    return { tasks }
  }

  // 获取任务列表
  console.addListener('media-luna/tasks/list', async (options: {
    uid?: number
    channelId?: number
    status?: TaskStatus
    startDate?: string  // ISO date string
    mediaType?: string  // image/audio/video
    limit?: number
    offset?: number
  } = {}) => {
    try {
      const { tasks, error } = getTaskService()
      if (error) return error

      const queryOptions = {
        uid: options.uid,
        channelId: options.channelId,
        status: options.status,
        startDate: options.startDate ? new Date(options.startDate) : undefined,
        mediaType: options.mediaType,
        limit: Math.min(options.limit || 50, 100),
        offset: options.offset || 0
      }

      const [list, total] = await Promise.all([
        tasks.query(queryOptions),
        tasks.count({
          uid: queryOptions.uid,
          channelId: queryOptions.channelId,
          status: queryOptions.status,
          startDate: queryOptions.startDate,
          mediaType: queryOptions.mediaType
        })
      ])

      return {
        success: true,
        data: {
          items: list,
          total,
          limit: queryOptions.limit,
          offset: queryOptions.offset
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取任务详情
  console.addListener('media-luna/tasks/get', async ({ id }: { id: number }) => {
    try {
      const { tasks, error } = getTaskService()
      if (error) return error

      const task = await tasks.getById(id)
      if (!task) {
        return { success: false, error: 'Task not found' }
      }
      return { success: true, data: task }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 删除任务
  console.addListener('media-luna/tasks/delete', async ({ id }: { id: number }) => {
    try {
      const { tasks, error } = getTaskService()
      if (error) return error

      const deleted = await tasks.delete(id)
      if (!deleted) {
        return { success: false, error: 'Task not found' }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取任务统计（单次查询）
  console.addListener('media-luna/tasks/stats', async ({ channelId, startDate }: { channelId?: number, startDate?: string } = {}) => {
    try {
      const { tasks, error } = getTaskService()
      if (error) return error

      // 无筛选条件时使用优化的 getStats（单次查询）
      if (!channelId && !startDate) {
        const stats = await tasks.getStats()
        return {
          success: true,
          data: {
            total: stats.total,
            byStatus: {
              pending: stats.pending,
              processing: stats.processing,
              success: stats.success,
              failed: stats.failed
            },
            successRate: stats.successRate.toFixed(2) + '%'
          }
        }
      }

      // 有筛选条件时，使用聚合 count（5 次轻量 COUNT 查询）
      const queryOptions: { channelId?: number, startDate?: Date } = {}
      if (channelId) queryOptions.channelId = channelId
      if (startDate) queryOptions.startDate = new Date(startDate)

      const [total, pending, processing, success, failed] = await Promise.all([
        tasks.count(queryOptions),
        tasks.count({ ...queryOptions, status: 'pending' }),
        tasks.count({ ...queryOptions, status: 'processing' }),
        tasks.count({ ...queryOptions, status: 'success' }),
        tasks.count({ ...queryOptions, status: 'failed' })
      ])

      return {
        success: true,
        data: {
          total,
          byStatus: { pending, processing, success, failed },
          successRate: total > 0 ? (success / total * 100).toFixed(2) + '%' : '0%'
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 清理旧任务
  console.addListener('media-luna/tasks/cleanup', async ({ days }: { days?: number } = {}) => {
    try {
      const { tasks, error } = getTaskService()
      if (error) return error

      const cleanupDays = days ?? 30
      if (cleanupDays < 1) {
        return { success: false, error: 'Days must be at least 1' }
      }

      const beforeDate = new Date()
      beforeDate.setDate(beforeDate.getDate() - cleanupDays)

      const count = await tasks.cleanup(beforeDate)

      return {
        success: true,
        data: {
          deleted: count,
          beforeDate: beforeDate.toISOString()
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 删除指定状态的任务（如删除所有失败任务）
  console.addListener('media-luna/tasks/delete-by-status', async ({ status }: { status: TaskStatus }) => {
    try {
      const { tasks, error } = getTaskService()
      if (error) return error

      if (!status) {
        return { success: false, error: 'Status is required' }
      }

      const validStatuses: TaskStatus[] = ['pending', 'processing', 'success', 'failed']
      if (!validStatuses.includes(status)) {
        return { success: false, error: `Invalid status: ${status}` }
      }

      const count = await tasks.deleteByStatus(status)

      return {
        success: true,
        data: { deleted: count, status }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取用户最近的任务
  console.addListener('media-luna/tasks/recent', async function (this: any, { uid, limit }: { uid?: number, limit?: number }) {
    try {
      const { tasks, error } = getTaskService()
      if (error) return error

      // 如果没有传入 uid，使用 session 或 webui-auth 的 uid
      const effectiveUid = uid ?? getUidFromAuth(ctx, this.auth)
      if (!effectiveUid) {
        return { success: false, error: 'User ID required (not logged in or not bound)' }
      }

      const list = await tasks.getRecentByUid(effectiveUid, Math.min(limit || 10, 100))
      return { success: true, data: list }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取当前登录用户的任务（自动使用 session uid 或 webui-auth 绑定的 uid）
  console.addListener('media-luna/tasks/my', async function (this: any, options: {
    channelId?: number
    status?: TaskStatus
    limit?: number
    offset?: number
  } = {}) {
    try {
      const uid = getUidFromAuth(ctx, this.auth)
      if (!uid) {
        return { success: false, error: 'Not logged in or not bound' }
      }

      const { tasks, error } = getTaskService()
      if (error) return error

      const queryOptions = {
        uid,
        channelId: options.channelId,
        status: options.status,
        limit: Math.min(options.limit || 50, 100),
        offset: options.offset || 0
      }

      const [list, total] = await Promise.all([
        tasks.query(queryOptions),
        tasks.count({
          uid: queryOptions.uid,
          channelId: queryOptions.channelId,
          status: queryOptions.status
        })
      ])

      return {
        success: true,
        data: {
          items: list,
          total,
          limit: queryOptions.limit,
          offset: queryOptions.offset
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取当前用户信息（用于前端判断登录/绑定状态）
  console.addListener('media-luna/auth/me', async function (this: any) {
    // 检查 @koishijs/plugin-auth 登录
    if (this.auth?.id) {
      return {
        success: true,
        data: {
          loggedIn: true,
          source: 'auth-plugin',
          uid: this.auth.id,
          name: this.auth.name,
          authority: this.auth.authority
        }
      }
    }

    // 检查 webui-auth 绑定
    const uid = getUidFromAuth(ctx, null)
    if (uid) {
      return {
        success: true,
        data: {
          loggedIn: true,
          source: 'webui-auth',
          uid
        }
      }
    }

    return { success: true, data: { loggedIn: false } }
  })

  // ============ 画廊 API ============

  // 获取当前用户的生成画廊（仅成功的任务）
  console.addListener('media-luna/gallery/my', async function (this: any, options: {
    limit?: number
    offset?: number
    channelId?: number
  } = {}) {
    try {
      const uid = getUidFromAuth(ctx, this.auth)
      if (!uid) {
        return { success: false, error: 'Not logged in or not bound' }
      }

      const { tasks, error } = getTaskService()
      if (error) return error

      const result = await tasks.getUserGallery(uid, {
        limit: options.limit,
        offset: options.offset,
        channelId: options.channelId
      })

      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取当前用户最近生成的图片（扁平化列表）
  console.addListener('media-luna/gallery/recent-images', async function (this: any, { limit }: { limit?: number } = {}) {
    try {
      const uid = getUidFromAuth(ctx, this.auth)
      if (!uid) {
        return { success: false, error: 'Not logged in or not bound' }
      }

      const { tasks, error } = getTaskService()
      if (error) return error

      const images = await tasks.getUserRecentImages(uid, limit || 20)
      return { success: true, data: images }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取指定用户的画廊（管理员用）
  console.addListener('media-luna/gallery/user', async (options: {
    uid: number
    limit?: number
    offset?: number
    channelId?: number
  }) => {
    try {
      if (!options.uid) {
        return { success: false, error: 'User ID required' }
      }

      const { tasks, error } = getTaskService()
      if (error) return error

      const result = await tasks.getUserGallery(options.uid, {
        limit: options.limit,
        offset: options.offset,
        channelId: options.channelId
      })

      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 批量获取用户信息（用于画廊显示）
  // 注意：头像和用户名存储在平台侧，需要通过 binding 表查找平台账号，再通过 bot 获取
  console.addListener('media-luna/users/batch', async (options: {
    uids: number[]
  }) => {
    try {
      const { uids } = options
      if (!uids || uids.length === 0) {
        return { success: true, data: {} }
      }

      // 限制一次最多查询 100 个用户
      const limitedUids = uids.slice(0, 100)

      // 1. 并行获取用户表和绑定表
      const [users, bindings] = await Promise.all([
        ctx.database.get('user', limitedUids),
        ctx.database.get('binding', { aid: limitedUids })
      ])

      // 按 aid 分组绑定信息
      const bindingsByAid = new Map<number, Array<{ platform: string; pid: string }>>()
      for (const binding of bindings) {
        if (!bindingsByAid.has(binding.aid)) {
          bindingsByAid.set(binding.aid, [])
        }
        bindingsByAid.get(binding.aid)!.push({ platform: binding.platform, pid: binding.pid })
      }

      // 2. 构建初始用户映射
      const userMap: Record<number, { name?: string; avatar?: string; platform?: string }> = {}
      for (const user of users) {
        userMap[user.id] = {
          name: (user as any).name || undefined,
          avatar: undefined,
          platform: undefined
        }
      }

      // 3. 并行请求平台用户信息（每个用户只取第一个有效绑定）
      const platformTasks: Array<{ userId: number; binding: { platform: string; pid: string } }> = []
      for (const user of users) {
        const userBindings = bindingsByAid.get(user.id) || []
        for (const binding of userBindings) {
          const bot = ctx.bots.find(b => b.platform === binding.platform && b.status === Status.ONLINE)
          if (bot) {
            platformTasks.push({ userId: user.id, binding })
            break  // 每个用户只用一个绑定
          }
        }
      }

      // 并行执行所有 bot.getUser 调用，带超时保护
      const results = await Promise.allSettled(
        platformTasks.map(async ({ userId, binding }) => {
          const bot = ctx.bots.find(b => b.platform === binding.platform && b.status === Status.ONLINE)
          if (!bot) return null
          const platformUser = await Promise.race([
            bot.getUser(binding.pid),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))
          ])
          if (platformUser) {
            userMap[userId] = {
              name: platformUser.nick || platformUser.name || userMap[userId]?.name,
              avatar: platformUser.avatar,
              platform: binding.platform
            }
          }
        })
      )

      return { success: true, data: userMap }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}
