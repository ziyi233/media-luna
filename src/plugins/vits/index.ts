// Vits 插件入口
// 将 text2audio 渠道注册为 Koishi vits 服务

import { definePlugin } from '../../core'
import type { PluginContext } from '../../core/types'
import {
  vitsConfigFields,
  defaultVitsConfig,
  type VitsPluginConfig
} from './config'
import { MediaLunaVits } from './service'

export default definePlugin({
  id: 'vits',
  name: 'Vits 语音服务',
  description: '将 text2audio 渠道注册为 Koishi vits 服务，供其他插件调用',
  version: '1.0.0',

  configFields: vitsConfigFields,
  configDefaults: defaultVitsConfig,

  async onLoad(pluginCtx: PluginContext) {
    const ctx = pluginCtx.ctx
    const config = pluginCtx.getConfig<VitsPluginConfig>()
    const logger = pluginCtx.logger

    if (!config.registerVitsService) {
      logger.debug('Vits service registration disabled')
      return
    }

    // 使用 ctx.plugin 注册 vits 服务（与 luna-vits 相同方式）
    ctx.plugin(MediaLunaVits, config)
    logger.info('Vits service registered')

    // 监听渠道变化，刷新 speakers（通过 media-luna 服务注册表获取，避免直接访问 Koishi ctx.vits 触发 inject 警告）
    ctx.on('mediaLuna/channel-updated' as any, async () => {
      const vits = pluginCtx.getService<MediaLunaVits>('vits')
      if (vits) {
        await vits.refreshSpeakers()
      }
    })
  }
})

// 导出类型和工具函数
export type { VitsPluginConfig } from './config'
export type { VitsSpeaker, VitsSayOptions } from './types'
export { MediaLunaVits, CHANNEL_SPEAKER_ID_BASE, getChannelSpeakerIdBase, getSpeakerIdFromChannelId, getChannelIdFromSpeakerId } from './service'
