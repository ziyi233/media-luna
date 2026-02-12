// 任务记录插件入口

import { definePlugin } from '../../core'
import { TaskService } from './service'
import { createTaskRecorderPrepareMiddleware, createTaskRecorderFinalizeMiddleware } from './middleware'
import { taskConfigFields, defaultTaskConfig, type TaskPluginConfig } from './config'

export default definePlugin({
  id: 'task',
  name: '任务记录',
  description: '记录生成任务的详细信息和状态',
  version: '1.0.0',

  services: [
    {
      name: 'task',
      factory: (ctx) => new TaskService(ctx.ctx)
    }
  ],

  middlewares: [
    createTaskRecorderPrepareMiddleware(),
    createTaskRecorderFinalizeMiddleware()
  ],

  configFields: taskConfigFields,
  configDefaults: defaultTaskConfig,

  settingsActions: [
    {
      name: 'stats',
      label: '查看统计',
      type: 'default',
      icon: 'chart',
      apiEvent: 'media-luna/tasks/stats'
    },
    {
      name: 'cleanup',
      label: '清理记录',
      type: 'error',
      icon: 'delete',
      apiEvent: 'media-luna/tasks/cleanup'
    }
  ],

  async onLoad(ctx) {
    const taskService = ctx.getService<TaskService>('task')!
    const config = ctx.getConfig<TaskPluginConfig>()

    // 设置自动清理
    if (config.autoCleanup && config.retentionDays > 0) {
      const cleanupInterval = setInterval(async () => {
        const beforeDate = new Date()
        beforeDate.setDate(beforeDate.getDate() - config.retentionDays)
        await taskService.cleanup(beforeDate)
      }, 24 * 60 * 60 * 1000) // 每天执行一次

      ctx.onDispose(() => {
        clearInterval(cleanupInterval)
      })
    }

    ctx.logger.info('Task plugin loaded')
  }
})

// 导出类型和服务
export { TaskService, TaskData, TaskListItem, TaskStatus, TaskQueryOptions } from './service'
export type { TaskPluginConfig } from './config'
