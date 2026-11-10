// ChatLuna 模型列表 API 及远程选项 API

import { Context } from 'koishi'

// ModelType 枚举值（从 chatluna 复制，避免直接依赖）
const ModelType = {
  all: 0,
  llm: 1,
  embeddings: 2
}

/**
 * 注册 ChatLuna 相关 API
 * 注意：API 在插件加载时注册，在调用时动态获取服务
 */
export function registerChatLunaApi(ctx: Context, logger: any) {
  const koishiConsole = (ctx as any).console
  if (!koishiConsole?.addListener) {
    logger.warn('Console service not available, skipping API registration')
    return
  }

  // ============ ChatLuna 模型 API ============

  // 获取所有平台（适配器）列表
  koishiConsole.addListener('media-luna/chatluna/platforms', async () => {
    try {
      const chatluna = (ctx as any).chatluna
      if (!chatluna) {
        return { success: false, error: 'ChatLuna service not available' }
      }

      const allModels = chatluna.platform.listAllModels(ModelType.llm)
      const platforms = new Set<string>()

      for (const model of allModels.value || []) {
        if (model.platform) {
          platforms.add(model.platform)
        }
      }

      const options = Array.from(platforms).sort().map(p => ({
        label: p,
        value: p
      }))

      return { success: true, data: options }
    } catch (error) {
      logger.error('Failed to get platforms:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取指定平台下的模型列表
  koishiConsole.addListener('media-luna/chatluna/models', async ({ platform }: { platform?: string }) => {
    try {
      const chatluna = (ctx as any).chatluna
      if (!chatluna) {
        return { success: false, error: 'ChatLuna service not available' }
      }

      const allModels = chatluna.platform.listAllModels(ModelType.llm)
      let models = allModels.value || []

      // 如果指定了平台，过滤
      if (platform) {
        models = models.filter((m: any) => m.platform === platform)
      }

      const options = models.map((m: any) => ({
        label: m.toModelName ? m.toModelName() : `${m.platform}/${m.name}`,
        value: m.toModelName ? m.toModelName() : `${m.platform}/${m.name}`
      }))

      return { success: true, data: options }
    } catch (error) {
      logger.error('Failed to get models:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取所有模型（平台/模型名格式）
  koishiConsole.addListener('media-luna/chatluna/all-models', async () => {
    try {
      const chatluna = (ctx as any).chatluna
      if (!chatluna) {
        return { success: false, error: 'ChatLuna service not available' }
      }

      const allModels = chatluna.platform.listAllModels(ModelType.llm)
      const models = allModels.value || []

      const options = models.map((m: any) => ({
        label: m.toModelName ? m.toModelName() : `${m.platform}/${m.name}`,
        value: m.toModelName ? m.toModelName() : `${m.platform}/${m.name}`
      }))

      return { success: true, data: options }
    } catch (error) {
      logger.error('Failed to get all models:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // ============ Media Luna 渠道/预设 API（用于工具配置下拉选项） ============

  // 获取渠道选项列表
  koishiConsole.addListener('media-luna/chatluna/channel-options', async () => {
    try {
      const mediaLuna = (ctx as any).mediaLuna
      if (!mediaLuna) {
        return { success: false, error: 'MediaLuna service not available' }
      }

      const channelService = mediaLuna.channelService
      if (!channelService) {
        return { success: true, data: [] }
      }

      const channels = await channelService.list()
      const options = channels
        .filter((c: any) => c.enabled)
        .map((c: any) => ({
          label: c.name,
          value: c.name
        }))

      return { success: true, data: options }
    } catch (error) {
      logger.error('Failed to get channel options:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取预设选项列表
  koishiConsole.addListener('media-luna/chatluna/preset-options', async () => {
    try {
      const mediaLuna = (ctx as any).mediaLuna
      if (!mediaLuna) {
        return { success: false, error: 'MediaLuna service not available' }
      }

      const presetService = mediaLuna.presetService
      if (!presetService) {
        return { success: true, data: [] }
      }

      const presets = await presetService.list({ enabledOnly: true })
      const options = presets.map((p: any) => ({
        label: p.name,
        value: p.name
      }))

      return { success: true, data: options }
    } catch (error) {
      logger.error('Failed to get preset options:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取所有预设（包含描述，用于预设查看工具）
  koishiConsole.addListener('media-luna/chatluna/preset-list', async () => {
    try {
      const mediaLuna = (ctx as any).mediaLuna
      if (!mediaLuna) {
        return { success: false, error: 'MediaLuna service not available' }
      }

      const presetService = mediaLuna.presetService
      if (!presetService) {
        return { success: true, data: [] }
      }

      const presets = await presetService.list({ enabledOnly: true })
      const data = presets.map((p: any) => ({
        name: p.name,
        description: p.description || '',
        tags: p.tags || []
      }))

      return { success: true, data }
    } catch (error) {
      logger.error('Failed to get preset list:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  logger.info('ChatLuna API registered')
}
