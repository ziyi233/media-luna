// 预设中间件

import type {
  MiddlewareDefinition,
  MiddlewareContext,
  MiddlewareRunStatus,
  FileData
} from '../../core'
import type { PresetMiddlewareConfig } from './config'
import type { PresetService } from './service'
import type { CacheService } from '../cache/service'

/**
 * 创建预设中间件
 */
export function createPresetMiddleware(): MiddlewareDefinition {
  return {
    name: 'preset',
    displayName: '预设处理',
    description: '应用预设模板和参考图到生成请求',
    category: 'preset',
    phase: 'lifecycle-pre-request',
    // 配置在 preset 插件的扩展插件面板中设置

    async execute(context: MiddlewareContext, next): Promise<MiddlewareRunStatus> {
      const config = await context.getMiddlewareConfig<PresetMiddlewareConfig>('preset')

      if (config?.enabled === false) {
        return next()
      }

      // 从上下文获取 presetService
      const presetService = context.getService<PresetService>('preset')
      if (!presetService) {
        return next()
      }

      const presetName = context.parameters.preset || config?.defaultPreset
      if (!presetName) {
        return next()
      }

      let preset = await presetService.getByName(presetName)
      if (!preset) {
        return next()
      }

      if (!preset.enabled) {
        return next()
      }

      // 注入预设参考图
      if (preset.referenceImages && preset.referenceImages.length > 0) {
        const presetFiles = preset.source === 'api'
          ? await loadRemoteReferenceImages(context, preset.name, preset.referenceImages)
          : await loadLocalReferenceImages(context, preset.name, preset.referenceImages)
        context.files = [...presetFiles, ...context.files]
      }

      // 应用预设模板
      const originalPrompt = context.prompt
      context.prompt = applyTemplate(preset.promptTemplate, originalPrompt)

      // 应用参数覆盖
      if (preset.parameterOverrides) {
        context.parameters = {
          ...context.parameters,
          ...preset.parameterOverrides
        }
      }

      context.setMiddlewareLog('preset', {
        presetId: preset.id,
        presetName: preset.name,
        originalPrompt,
        transformedPrompt: context.prompt,
        referenceImagesInjected: preset.referenceImages?.length ?? 0
      })

      return next()
    }
  }
}

/** 加载参考图 */
async function loadLocalReferenceImages(
  context: MiddlewareContext,
  presetName: string,
  urls: string[]
): Promise<FileData[]> {
  const cache = context.getService<CacheService>('cache')
  if (!cache) throw new Error('缓存服务不可用，无法读取预设参考图')

  const files: FileData[] = []

  for (let index = 0; index < urls.length; index++) {
    const loaded = await cache.loadReference(urls[index])
    if (!loaded) {
      throw new Error(`预设「${presetName}」的第 ${index + 1} 张参考图已丢失；请重新同步远程预设或重新上传图片`)
    }
    files.push(loaded)
  }

  return files
}

/** 远程预设不落本地缓存，在生成时直接读取源站媒体。 */
async function loadRemoteReferenceImages(
  context: MiddlewareContext,
  presetName: string,
  urls: string[]
): Promise<FileData[]> {
  const files: FileData[] = []

  for (let index = 0; index < urls.length; index++) {
    const url = urls[index]
    try {
      const data = await context.ctx.http.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 30000
      })
      if (!data?.byteLength) throw new Error('响应内容为空')
      files.push({
        data,
        mime: guessMimeFromUrl(url),
        filename: getFilenameFromUrl(url, index)
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`远程预设「${presetName}」的第 ${index + 1} 张参考图读取失败：${reason}`)
    }
  }

  return files
}

function guessMimeFromUrl(url: string): string {
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase()
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg'
  if (pathname.endsWith('.webp')) return 'image/webp'
  if (pathname.endsWith('.gif')) return 'image/gif'
  if (pathname.endsWith('.bmp')) return 'image/bmp'
  return 'image/png'
}

function getFilenameFromUrl(url: string, index: number): string {
  try {
    return new URL(url).pathname.split('/').pop() || `preset-reference-${index + 1}.png`
  } catch {
    return `preset-reference-${index + 1}.png`
  }
}

/** 应用模板替换 */
function applyTemplate(template: string, userText: string): string {
  if (template.includes('{prompt}')) {
    return template.replace(/\{prompt\}/g, userText)
  }

  if (template.includes('{{userText}}')) {
    return template.replace(/\{\{userText\}\}/g, userText)
  }

  return `${template}\n\n${userText}`
}
