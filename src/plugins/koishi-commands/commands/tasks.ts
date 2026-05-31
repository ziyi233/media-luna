import type { Session } from 'koishi'
import type { FileData, OutputAsset } from '../../../types'
import type { KoishiCommandsConfig } from '../config'
import { resolveLinkMode } from '../formatters/delivery'
import { executeGenerate } from '../services/generation-flow'
import { hasTaskRefs, resetTaskRefRegex, resolveTaskRefsInPrompt } from '../services/task-reference'

interface RegisterTaskCommandsOptions {
  ctx: any
  mediaLunaRef: any
  config: KoishiCommandsConfig
  logger: any
  parentCommand: string
}

export function registerTaskCommands(options: RegisterTaskCommandsOptions): Array<() => void> {
  const { ctx, mediaLunaRef, config, logger, parentCommand } = options
  const disposables: Array<() => void> = []

  const myTasksCmd = ctx.command(`${parentCommand}.mytasks [count:number]`, '查看我的画图记录')
    .alias('mytasks')
    .action(async ({ session }: { session?: Session }, count?: number) => {
      if (!session) return '会话不可用'

      const uid = (session as any)?.user?.id
      if (!uid) return '请先登录后再查看记录'

      const taskService = mediaLunaRef?.tasks
      const channelService = mediaLunaRef?.channels
      if (!taskService) return '任务服务不可用'

      const limit = count || config.myTasksDefaultCount
      const tasks = await taskService.query({ uid, limit })
      if (tasks.length === 0) return '暂无画图记录'

      const channelMap = new Map<number, { name: string; tags: string[] }>()
      if (channelService) {
        const channels = await channelService.list()
        for (const ch of channels) {
          channelMap.set(ch.id, {
            name: ch.name,
            tags: ch.tags || []
          })
        }
      }

      const forwardMessages: string[] = []
      forwardMessages.push(`<message>📜 我的画图记录（最近 ${tasks.length} 条）</message>`)

      for (const task of tasks) {
        const lines: string[] = []
        const channelInfo = channelMap.get(task.channelId)
        const channelName = channelInfo?.name || `渠道#${task.channelId}`
        const linkModeTag = resolveLinkMode(config, channelInfo?.tags || [], session?.bot?.platform)
        const statusText = task.status === 'success' ? '✅' : task.status === 'failed' ? '❌' : '⏳'

        lines.push(`${statusText}「${task.id}」${channelName}`)
        lines.push(`时间: ${new Date(task.startTime).toLocaleString()}`)

        if (task.duration) {
          lines.push(`耗时: ${formatDuration(task.duration)}`)
        }

        const prompt = task.requestSnapshot?.prompt || ''
        if (prompt) {
          const truncated = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt
          lines.push(`提示词: ${truncated}`)
        }

        if (task.status === 'success' && task.responseSnapshot && task.responseSnapshot.length > 0) {
          const firstImage = task.responseSnapshot.find((a: OutputAsset) => a.kind === 'image' && a.url)
          if (firstImage && firstImage.url) {
            if (linkModeTag) {
              lines.push(`📎 因渠道标签 [${linkModeTag}] 启用链接模式`)
              lines.push(`首图链接: ${firstImage.url}`)
              forwardMessages.push(`<message>${lines.join('\n')}</message>`)
            } else {
              forwardMessages.push(`<message>${lines.join('\n')}\n<image url="${firstImage.url}"/></message>`)
            }
          } else {
            forwardMessages.push(`<message>${lines.join('\n')}</message>`)
          }
        } else {
          forwardMessages.push(`<message>${lines.join('\n')}</message>`)
        }
      }

      forwardMessages.push(`<message>使用 ${parentCommand}.taskinfo <任务ID> 查看详细信息</message>`)
      return `<message forward>${forwardMessages.join('')}</message>`
    })
  disposables.push(() => myTasksCmd.dispose())

  const taskDetailCmd = ctx.command(`${parentCommand}.taskinfo <id:number>`, '查看任务详细信息')
    .alias('taskinfo')
    .action(async ({ session }: { session?: Session }, id: number) => {
      if (!id && id !== 0) return '请指定任务 ID'

      const taskService = mediaLunaRef?.tasks
      const channelService = mediaLunaRef?.channels
      if (!taskService) return '任务服务不可用'

      const taskId = Number(id)
      if (isNaN(taskId)) return `无效的任务 ID: ${id}`

      const task = await taskService.getById(taskId)
      if (!task) return `未找到任务「${taskId}」`

      const uid = (session as any)?.user?.id
      const isAdmin = (session as any)?.user?.authority >= 3
      if (!isAdmin && task.uid !== uid) return '无权查看此任务'

      let channelName = `渠道#${task.channelId}`
      let channelTags: string[] = []
      if (channelService) {
        const channel = await channelService.getById(task.channelId)
        if (channel) {
          channelName = channel.name
          channelTags = channel.tags || []
        }
      }

      const linkModeTag = resolveLinkMode(config, channelTags, session?.bot?.platform)
      const forwardMessages: string[] = []
      const statusText = task.status === 'success' ? '✅ 成功' :
        task.status === 'failed' ? '❌ 失败' :
          task.status === 'processing' ? '⏳ 处理中' : '🕐 等待中'

      const basicLines: string[] = []
      basicLines.push('━━━━━━━━━━━━━━')
      basicLines.push(`📋 任务「${task.id}」`)
      basicLines.push('━━━━━━━━━━━━━━')
      basicLines.push(`状态: ${statusText}`)
      basicLines.push(`渠道: ${channelName}`)
      basicLines.push(`开始时间: ${new Date(task.startTime).toLocaleString()}`)
      if (task.endTime) basicLines.push(`结束时间: ${new Date(task.endTime).toLocaleString()}`)
      if (task.duration) basicLines.push(`耗时: ${formatDuration(task.duration)}`)
      basicLines.push('━━━━━━━━━━━━━━')
      forwardMessages.push(`<message>${basicLines.join('\n')}</message>`)

      const request = task.requestSnapshot
      if (request) {
        const reqLines: string[] = []
        reqLines.push('📝 请求信息')
        reqLines.push('─────────────')

        if (request.prompt) reqLines.push(`提示词: ${request.prompt}`)
        const presetName = request.parameters?.preset
        if (presetName) reqLines.push(`预设: ${presetName}`)

        const transformedPrompt = (task.middlewareLogs as any)?.preset?.transformedPrompt
        if (transformedPrompt && transformedPrompt !== request.prompt) {
          reqLines.push(`处理后: ${transformedPrompt}`)
        }

        if (request.files && request.files.length > 0) {
          reqLines.push(`输入文件: ${request.files.length} 个`)
        }

        forwardMessages.push(`<message>${reqLines.join('\n')}</message>`)

        const inputFiles = (request as any).inputFiles as OutputAsset[] | undefined
        if (inputFiles && inputFiles.length > 0) {
          forwardMessages.push(`<message>📥 输入图片 (${inputFiles.length} 个)</message>`)
          for (const file of inputFiles) {
            if (file.kind === 'image' && file.url) {
              if (linkModeTag) {
                forwardMessages.push(`<message>输入图链接: ${file.url}</message>`)
              } else {
                forwardMessages.push(`<message><image url="${file.url}"/></message>`)
              }
            }
          }
        }
      }

      if (task.status === 'success' && task.responseSnapshot && task.responseSnapshot.length > 0) {
        forwardMessages.push(`<message>🎨 输出结果 (${task.responseSnapshot.length} 个)</message>`)
        if (linkModeTag) {
          forwardMessages.push(`<message>📎 因渠道标签 [${linkModeTag}] 启用链接模式</message>`)
        }

        for (const asset of task.responseSnapshot) {
          if (asset.kind === 'image' && asset.url) {
            forwardMessages.push(linkModeTag
              ? `<message>${asset.url}</message>`
              : `<message><image url="${asset.url}"/></message>`)
          } else if (asset.kind === 'video' && asset.url) {
            forwardMessages.push(linkModeTag
              ? `<message>${asset.url}</message>`
              : `<message><video url="${asset.url}"/></message>`)
          } else if (asset.kind === 'audio' && asset.url) {
            forwardMessages.push(`<message><audio url="${asset.url}"/></message>`)
          } else if (asset.kind === 'text' && asset.content) {
            forwardMessages.push(`<message>文本: ${asset.content}</message>`)
          }
        }
      } else if (task.status === 'failed') {
        const errorInfo = (task.middlewareLogs as any)?._error
        const errorMsg = errorInfo?.message || '未知错误'
        forwardMessages.push(`<message>❌ 错误信息: ${errorMsg}</message>`)
      }

      const billingLog = (task.middlewareLogs as any)?.billing
      if (billingLog) {
        const billingLines: string[] = []
        billingLines.push('💰 计费信息')
        billingLines.push('─────────────')
        if (billingLog.cost !== undefined) billingLines.push(`消费: ${billingLog.cost}`)
        if (billingLog.balance !== undefined) billingLines.push(`余额: ${billingLog.balance}`)
        forwardMessages.push(`<message>${billingLines.join('\n')}</message>`)
      }

      return `<message forward>${forwardMessages.join('')}</message>`
    })
  disposables.push(() => taskDetailCmd.dispose())

  const redrawCmd = ctx.command(`${parentCommand}.redraw <id:number> [...appendPrompt:string]`, '使用相同参数重新生成（可追加提示词）')
    .alias('redraw')
    .action(async ({ session }: { session?: Session }, id: number, ...appendPromptParts: string[]) => {
      if (!id && id !== 0) return '请指定任务 ID'

      const taskService = mediaLunaRef?.tasks
      const channelService = mediaLunaRef?.channels
      if (!taskService || !channelService) return '服务不可用'

      const taskId = Number(id)
      if (isNaN(taskId)) return `无效的任务 ID: ${id}`

      const task = await taskService.getById(taskId)
      if (!task) return `未找到任务「${taskId}」`

      const uid = (session as any)?.user?.id
      const isAdmin = (session as any)?.user?.authority >= 3
      if (!isAdmin && task.uid !== uid) return '无权重绘此任务'

      const channel = await channelService.getById(task.channelId)
      if (!channel) return `渠道不存在 (ID: ${task.channelId})`
      if (!channel.enabled) return `渠道「${channel.name}」已禁用`

      const request = task.requestSnapshot
      const originalPrompt = request?.prompt || ''
      const appendPrompt = appendPromptParts.join(' ').trim()
      let prompt = appendPrompt
        ? (originalPrompt ? `${originalPrompt} ${appendPrompt}` : appendPrompt)
        : originalPrompt
      const presetName = request?.parameters?.preset
      const inputFiles = (request as any)?.inputFiles as OutputAsset[] | undefined

      const files: FileData[] = []
      let inputFileWarning: string | null = null
      if (inputFiles && inputFiles.length > 0) {
        const hasHttpUrls = inputFiles.some(f => f.url?.startsWith('http'))
        const hasBase64Removed = inputFiles.some(f => f.url === '[base64-data-removed]')
        const hasEmptyUrls = inputFiles.some(f => !f.url || f.url === '')

        if (!hasHttpUrls) {
          if (hasBase64Removed) {
            inputFileWarning = `原任务有 ${inputFiles.length} 张参考图，但未启用存储中间件，无法重新下载`
          } else if (hasEmptyUrls) {
            inputFileWarning = `原任务有 ${inputFiles.length} 张参考图，但未保存 URL（需启用存储中间件）`
          }
        } else {
          for (const file of inputFiles) {
            if (file.url && file.url.startsWith('http')) {
              try {
                const response = await ctx.http.get(file.url, {
                  responseType: 'arraybuffer',
                  timeout: 30000
                })
                if (response && response.byteLength > 0) {
                  const buffer = Buffer.from(response)
                  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
                  files.push({
                    data: arrayBuffer,
                    mime: file.mime || 'image/png',
                    filename: `redraw_${files.length}.${(file.mime || 'image/png').split('/')[1] || 'png'}`
                  })
                }
              } catch (e) {
                logger.warn('Failed to download image for redraw: %s', e)
              }
            }
          }
          if (files.length === 0) {
            inputFileWarning = `原任务有 ${inputFiles.length} 张参考图，但下载失败（URL 可能已过期）`
          } else if (files.length < inputFiles.filter(f => f.url?.startsWith('http')).length) {
            inputFileWarning = `部分参考图下载失败 (${files.length}/${inputFiles.length})`
          }
        }
      }

      const infoParts = [`重绘任务「${taskId}」`]
      infoParts.push(`渠道: ${channel.name}`)
      if (presetName) infoParts.push(`预设: ${presetName}`)
      if (appendPrompt) infoParts.push(`追加: ${appendPrompt.length > 30 ? appendPrompt.slice(0, 30) + '...' : appendPrompt}`)
      infoParts.push(`提示词: ${prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt}`)
      if (files.length > 0) {
        infoParts.push(`参考图: ${files.length} 张`)
      } else if (inputFileWarning) {
        infoParts.push(`⚠️ ${inputFileWarning}`)
      }

      if (prompt && hasTaskRefs(prompt)) {
        resetTaskRefRegex()
        const resolved = await resolveTaskRefsInPrompt(ctx, mediaLunaRef, session, prompt, files, logger)
        prompt = resolved.prompt
        if (resolved.injectedCount > 0) {
          const taskHint = resolved.injectedTasks
            .map(item => item.index ? `#${item.taskId}(${item.index}) x${item.count}` : `#${item.taskId} x${item.count}`)
            .join(', ')
          infoParts.push(`任务引用: ${resolved.injectedCount} 张（${taskHint}）`)
        }
      }

      return executeGenerate(ctx, session, mediaLunaRef, {
        channelName: channel.name,
        presetName,
        prompt,
        files,
        summaryMsg: infoParts.join(' | ')
      }, config, channel.tags || [])
    })
  disposables.push(() => redrawCmd.dispose())

  return disposables
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = (seconds % 60).toFixed(0)
  return `${minutes}m ${remainingSeconds}s`
}
