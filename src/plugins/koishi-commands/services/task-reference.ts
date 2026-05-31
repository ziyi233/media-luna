import type { Session } from 'koishi'
import type { FileData, OutputAsset } from '../../../types'

const TASK_REF_REGEX = /#task(\d+)(?:\((\d+)\))?/gi

interface TaskRefMatch {
  raw: string
  taskId: number
  index?: number
}

export interface TaskRefResolveResult {
  prompt: string
  injectedCount: number
  injectedTasks: Array<{ taskId: number; count: number; index?: number }>
}

function parseTaskRefs(text: string): TaskRefMatch[] {
  const refs: TaskRefMatch[] = []
  let match: RegExpExecArray | null
  while ((match = TASK_REF_REGEX.exec(text)) !== null) {
    refs.push({
      raw: match[0],
      taskId: Number(match[1]),
      index: match[2] ? Number(match[2]) : undefined
    })
  }
  return refs
}

function stripTaskRefs(text: string): string {
  return text.replace(TASK_REF_REGEX, ' ').replace(/\s+/g, ' ').trim()
}

function guessImageMimeFromUrl(url: string): string {
  const lower = url.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'image/png'
}

export function hasTaskRefs(text: string): boolean {
  return TASK_REF_REGEX.test(text)
}

export function resetTaskRefRegex(): void {
  TASK_REF_REGEX.lastIndex = 0
}

export async function resolveTaskRefsInPrompt(
  ctx: any,
  mediaLuna: any,
  session: Session | undefined,
  prompt: string,
  files: FileData[],
  logger: any
): Promise<TaskRefResolveResult> {
  const refs = parseTaskRefs(prompt)
  if (refs.length === 0) {
    return { prompt, injectedCount: 0, injectedTasks: [] }
  }

  const taskService = mediaLuna?.tasks
  if (!taskService) {
    throw new Error('任务服务不可用，无法解析 #task 引用')
  }

  const uid = (session as any)?.user?.id
  const isAdmin = (session as any)?.user?.authority >= 3
  const injectedTasks: Array<{ taskId: number; count: number; index?: number }> = []
  let injectedCount = 0

  for (const ref of refs) {
    const task = await taskService.getById(ref.taskId)
    if (!task) {
      throw new Error(`未找到任务「${ref.taskId}」`)
    }
    if (task.status !== 'success') {
      throw new Error(`任务「${ref.taskId}」状态为 ${task.status}，仅支持引用成功任务`)
    }
    if (!isAdmin && uid && task.uid !== uid) {
      throw new Error(`无权引用任务「${ref.taskId}」`)
    }

    const imageAssets = (task.responseSnapshot || []).filter((a: OutputAsset) => a.kind === 'image' && !!a.url)
    if (imageAssets.length === 0) {
      throw new Error(`任务「${ref.taskId}」没有可用图片输出`)
    }

    const selected = ref.index !== undefined
      ? (() => {
          if (ref.index! <= 0 || ref.index! > imageAssets.length) {
            throw new Error(`任务「${ref.taskId}」不存在第 ${ref.index} 张图片`)
          }
          return [imageAssets[ref.index! - 1]]
        })()
      : imageAssets

    let currentInjected = 0
    for (let i = 0; i < selected.length; i++) {
      const asset = selected[i]
      try {
        const response = await ctx.http.get(asset.url, {
          responseType: 'arraybuffer',
          timeout: 30000
        })
        if (!response || response.byteLength === 0) {
          throw new Error('empty response')
        }
        const buffer = Buffer.from(response)
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        const mime = asset.mime || guessImageMimeFromUrl(asset.url || '')
        files.push({
          data: arrayBuffer,
          mime,
          filename: `task_${ref.taskId}_${ref.index ?? i + 1}.${mime.split('/')[1] || 'png'}`
        })
        injectedCount++
        currentInjected++
      } catch (e) {
        logger.warn('Failed to fetch task reference image task=%s index=%s: %s', ref.taskId, ref.index ?? (i + 1), e)
        throw new Error(`下载任务「${ref.taskId}」引用图片失败（URL可能已过期）`)
      }
    }

    injectedTasks.push({ taskId: ref.taskId, count: currentInjected, index: ref.index })
  }

  return {
    prompt: stripTaskRefs(prompt),
    injectedCount,
    injectedTasks
  }
}
