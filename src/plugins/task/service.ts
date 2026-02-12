// 任务服务

import { Context, $ } from 'koishi'
import type { MediaLunaTask } from '../../augmentations'
import type { GenerationRequest, OutputAsset } from '../../types'

/** 任务状态 */
export type TaskStatus = 'pending' | 'processing' | 'success' | 'failed'

/** 任务数据 */
export interface TaskData {
  id: number
  uid: number | null  // Koishi user.id（可为空，表示匿名/未登录）
  channelId: number
  requestSnapshot: GenerationRequest
  responseSnapshot: OutputAsset[] | null
  status: TaskStatus
  middlewareLogs: Record<string, any>
  startTime: Date
  endTime: Date | null
  duration: number | null
}

/** 任务列表项（精简，不含 middlewareLogs） */
export interface TaskListItem {
  id: number
  uid: number | null
  channelId: number
  requestSnapshot: GenerationRequest
  responseSnapshot: OutputAsset[] | null
  status: TaskStatus
  startTime: Date
  endTime: Date | null
  duration: number | null
}

/** 任务查询选项 */
export interface TaskQueryOptions {
  uid?: number
  channelId?: number
  status?: TaskStatus
  startDate?: Date  // 只查询此时间之后的任务
  mediaType?: string  // 媒体类型筛选: image/audio/video
  limit?: number
  offset?: number
}

/**
 * 任务服务
 *
 * 管理任务记录的 CRUD 操作
 */
export class TaskService {
  private _ctx: Context

  constructor(ctx: Context) {
    this._ctx = ctx
  }

  /** 将数据库记录转换为完整 TaskData（用于单条详情） */
  private _toData(record: MediaLunaTask): TaskData {
    return {
      id: record.id,
      uid: record.uid,
      channelId: record.channelId,
      requestSnapshot: JSON.parse(record.requestSnapshot || '{}'),
      responseSnapshot: record.responseSnapshot ? JSON.parse(record.responseSnapshot) : null,
      status: record.status as TaskStatus,
      middlewareLogs: JSON.parse(record.middlewareLogs || '{}'),
      startTime: record.startTime,
      endTime: record.endTime,
      duration: record.duration
    }
  }

  /** 将数据库记录转换为列表项（跳过 middlewareLogs 解析） */
  private _toListItem(record: MediaLunaTask): TaskListItem {
    return {
      id: record.id,
      uid: record.uid,
      channelId: record.channelId,
      requestSnapshot: JSON.parse(record.requestSnapshot || '{}'),
      responseSnapshot: record.responseSnapshot ? JSON.parse(record.responseSnapshot) : null,
      status: record.status as TaskStatus,
      startTime: record.startTime,
      endTime: record.endTime,
      duration: record.duration
    }
  }

  /** 构建查询条件对象（用于 database.eval / database.remove 等） */
  private _buildQueryObject(options: Omit<TaskQueryOptions, 'limit' | 'offset' | 'mediaType'>): Record<string, any> {
    const query: Record<string, any> = {}
    if (options.uid !== undefined && options.uid !== null) {
      query.uid = options.uid
    }
    if (options.channelId !== undefined && options.channelId !== null) {
      query.channelId = options.channelId
    }
    if (options.status) {
      query.status = options.status
    }
    if (options.startDate) {
      query.startTime = { $gte: options.startDate }
    }
    return query
  }

  /** 为 selection 应用 where 条件 */
  private _applyWhere(selection: any, options: Omit<TaskQueryOptions, 'limit' | 'offset' | 'mediaType'>): any {
    if (options.uid !== undefined && options.uid !== null) {
      selection = selection.where({ uid: options.uid })
    }
    if (options.channelId !== undefined && options.channelId !== null) {
      selection = selection.where({ channelId: options.channelId })
    }
    if (options.status) {
      selection = selection.where({ status: options.status })
    }
    if (options.startDate) {
      selection = selection.where((row: any) => $.gte(row.startTime, options.startDate!))
    }
    return selection
  }

  /** 创建任务 */
  async create(
    uid: number | null,
    channelId: number,
    request: GenerationRequest
  ): Promise<TaskData> {
    const now = new Date()
    const record = await this._ctx.database.create('medialuna_task', {
      uid,
      channelId,
      requestSnapshot: JSON.stringify(request),
      responseSnapshot: null,
      status: 'pending',
      middlewareLogs: '{}',
      startTime: now,
      endTime: null,
      duration: null,
      createdAt: now
    })

    return this._toData(record)
  }

  /** 更新任务状态 */
  async updateStatus(
    id: number,
    status: TaskStatus,
    options?: {
      responseSnapshot?: OutputAsset[]
      inputSnapshot?: OutputAsset[]
      middlewareLogs?: Record<string, any>
    }
  ): Promise<TaskData | null> {
    const updateData: Partial<MediaLunaTask> = {
      status
    }

    if (status === 'success' || status === 'failed') {
      const now = new Date()
      const record = await this._ctx.database.get('medialuna_task', { id })
      if (record.length > 0) {
        updateData.endTime = now
        updateData.duration = now.getTime() - record[0].startTime.getTime()

        // 如果有输入快照，更新 requestSnapshot 添加输入文件 URL
        if (options?.inputSnapshot) {
          const existingRequest = JSON.parse(record[0].requestSnapshot || '{}')
          existingRequest.inputFiles = options.inputSnapshot
          updateData.requestSnapshot = JSON.stringify(existingRequest)
        }
      }
    }

    if (options?.responseSnapshot) {
      updateData.responseSnapshot = JSON.stringify(options.responseSnapshot)
    }

    if (options?.middlewareLogs) {
      updateData.middlewareLogs = JSON.stringify(options.middlewareLogs)
    }

    await this._ctx.database.set('medialuna_task', { id }, updateData)

    return this.getById(id)
  }

  /** 根据 ID 获取任务（完整数据含 middlewareLogs） */
  async getById(id: number): Promise<TaskData | null> {
    const records = await this._ctx.database.get('medialuna_task', { id })
    return records.length > 0 ? this._toData(records[0]) : null
  }

  /** 查询任务列表（返回精简数据） */
  async query(options: TaskQueryOptions = {}): Promise<TaskListItem[]> {
    let selection = this._ctx.database.select('medialuna_task')
    selection = this._applyWhere(selection, options)

    // 如果有 mediaType 筛选，需要在内存中过滤（因为 responseSnapshot 是 JSON 字段）
    if (options.mediaType) {
      const targetLimit = options.limit ?? 100
      const fetchLimit = targetLimit * 3

      const records = await selection
        .orderBy('id', 'desc')
        .limit(fetchLimit)
        .offset(options.offset ?? 0)
        .execute()

      const filtered: TaskListItem[] = []
      for (const r of records) {
        // 只解析 responseSnapshot 用于过滤，避免解析 requestSnapshot
        const responseSnapshot: OutputAsset[] | null = r.responseSnapshot ? JSON.parse(r.responseSnapshot) : null
        if (responseSnapshot?.some(asset => asset.kind === options.mediaType)) {
          filtered.push(this._toListItem(r))
          if (filtered.length >= targetLimit) break
        }
      }
      return filtered
    }

    const records = await selection
      .orderBy('id', 'desc')
      .limit(options.limit ?? 100)
      .offset(options.offset ?? 0)
      .execute()

    return records.map(r => this._toListItem(r))
  }

  /** 获取用户最近的任务 */
  async getRecentByUid(uid: number, limit: number = 10): Promise<TaskListItem[]> {
    return this.query({ uid, limit })
  }

  /** 统计任务数量（使用数据库聚合，不加载全部记录） */
  async count(options: Omit<TaskQueryOptions, 'limit' | 'offset'> = {}): Promise<number> {
    // 如果有 mediaType 筛选，必须在内存中过滤
    if (options.mediaType) {
      const query = this._buildQueryObject(options)
      // 只取 responseSnapshot 字段减少传输量
      const records = await this._ctx.database.get('medialuna_task', query)
      let count = 0
      for (const r of records) {
        const responseSnapshot: OutputAsset[] | null = r.responseSnapshot ? JSON.parse(r.responseSnapshot) : null
        if (responseSnapshot?.some(asset => asset.kind === options.mediaType)) {
          count++
        }
      }
      return count
    }

    // 使用数据库聚合计数
    const query = this._buildQueryObject(options)
    return await this._ctx.database.eval('medialuna_task', row => $.count(row.id), query)
  }

  /** 删除任务 */
  async delete(id: number): Promise<boolean> {
    const result = await this._ctx.database.remove('medialuna_task', { id })
    return (result.matched ?? 0) > 0
  }

  /** 按状态删除任务 */
  async deleteByStatus(status: TaskStatus): Promise<number> {
    const count = await this.count({ status })
    if (count > 0) {
      await this._ctx.database.remove('medialuna_task', { status })
    }
    return count
  }

  /** 清理旧任务 */
  async cleanup(beforeDate: Date): Promise<number> {
    const count = await this._ctx.database.eval(
      'medialuna_task',
      row => $.count(row.id),
      { createdAt: { $lt: beforeDate } }
    )
    if (count > 0) {
      await this._ctx.database.remove('medialuna_task', {
        createdAt: { $lt: beforeDate }
      } as any)
    }
    return count
  }

  /** 获取统计信息（并行聚合查询，不加载记录） */
  async getStats(): Promise<{
    total: number
    pending: number
    processing: number
    success: number
    failed: number
    successRate: number
  }> {
    const db = this._ctx.database
    const [total, pending, processing, success, failed] = await Promise.all([
      db.eval('medialuna_task', row => $.count(row.id)),
      db.eval('medialuna_task', row => $.count(row.id), { status: 'pending' }),
      db.eval('medialuna_task', row => $.count(row.id), { status: 'processing' }),
      db.eval('medialuna_task', row => $.count(row.id), { status: 'success' }),
      db.eval('medialuna_task', row => $.count(row.id), { status: 'failed' }),
    ])

    const completed = success + failed
    const successRate = completed > 0 ? (success / completed) * 100 : 0

    return {
      total,
      pending,
      processing,
      success,
      failed,
      successRate: Math.round(successRate * 100) / 100
    }
  }

  /**
   * 获取用户的生成历史（仅成功的任务，用于画廊展示）
   * 返回简化的数据，适合前端展示
   */
  async getUserGallery(uid: number, options: {
    limit?: number
    offset?: number
    channelId?: number
  } = {}): Promise<{
    items: Array<{
      id: number
      prompt: string
      images: string[]  // 输出图片 URL 列表
      createdAt: Date
      channelId: number
    }>
    total: number
    hasMore: boolean
  }> {
    const limit = Math.min(options.limit || 20, 100)
    const offset = options.offset || 0

    // 并行执行列表查询和计数
    const countOptions: Omit<TaskQueryOptions, 'limit' | 'offset'> = {
      uid,
      status: 'success',
      channelId: options.channelId
    }
    const queryOptions: TaskQueryOptions = {
      ...countOptions,
      limit: limit + 1,  // 多查一条用于判断 hasMore
      offset
    }

    const [tasks, total] = await Promise.all([
      this.query(queryOptions),
      this.count(countOptions)
    ])

    const hasMore = tasks.length > limit
    const items = tasks.slice(0, limit)

    return {
      items: items.map(task => ({
        id: task.id,
        prompt: task.requestSnapshot?.prompt || '',
        images: (task.responseSnapshot || [])
          .filter(asset => asset.kind === 'image' && asset.url)
          .map(asset => asset.url!),
        createdAt: task.startTime,
        channelId: task.channelId
      })),
      total,
      hasMore
    }
  }

  /**
   * 获取用户最近生成的图片（扁平化，用于快速预览）
   */
  async getUserRecentImages(uid: number, limit: number = 20): Promise<Array<{
    taskId: number
    url: string
    prompt: string
    createdAt: Date
  }>> {
    const tasks = await this.query({
      uid,
      status: 'success',
      limit: Math.min(limit * 2, 100)  // 多查一些，因为一个任务可能有多张图
    })

    const images: Array<{
      taskId: number
      url: string
      prompt: string
      createdAt: Date
    }> = []

    for (const task of tasks) {
      if (!task.responseSnapshot) continue
      for (const asset of task.responseSnapshot) {
        if (asset.kind === 'image' && asset.url) {
          images.push({
            taskId: task.id,
            url: asset.url,
            prompt: task.requestSnapshot?.prompt || '',
            createdAt: task.startTime
          })
          if (images.length >= limit) break
        }
      }
      if (images.length >= limit) break
    }

    return images
  }
}
