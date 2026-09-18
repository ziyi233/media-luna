// MediaLuna Vits 服务
// 将 text2audio 渠道暴露为 Koishi vits 服务

import { h, type Context } from 'koishi'
import Vits from '@initencounter/vits'
import type { VitsSpeaker } from './types'
import type { GenerationResult } from '../../types'
import type { VitsPluginConfig } from './config'

/** text2audio 渠道 Speaker ID 基数 */
export const CHANNEL_SPEAKER_ID_BASE = 1000000

/**
 * MediaLuna Vits 服务实现
 * 继承自 @initencounter/vits 基类
 * 将 text2audio 渠道暴露为 Koishi vits 服务
 */
export class MediaLunaVits extends Vits {
  static inject = ['mediaLuna']

  private _speakerMap = new Map<number, VitsSpeaker>()

  constructor(
    public ctx: Context,
    public config: VitsPluginConfig
  ) {
    super(ctx)

    // 将自身注册到 media-luna 服务注册表，供子插件通过 getService('vits') 访问
    // 并自管理 speaker 刷新，避免由外层插件直接访问 Koishi ctx.vits 触发 inject 警告
    this.ctx.on('ready', () => {
      const mediaLuna = this.ctx.mediaLuna as any
      if (mediaLuna?.registerPluginService) {
        mediaLuna.registerPluginService('vits', this)
      }
      this.refreshSpeakers()
    })
  }

  /**
   * 刷新 speaker 列表
   */
  async refreshSpeakers(): Promise<void> {
    this._speakerMap.clear()

    try {
      const mediaLuna = this.ctx.mediaLuna
      if (!mediaLuna) {
        this.ctx.logger('media-luna').warn('MediaLuna service not available for vits')
        return
      }

      const audioChannels = await mediaLuna.channels.getByTags(['text2audio'])

      for (const channel of audioChannels) {
        const speakerId = CHANNEL_SPEAKER_ID_BASE + channel.id
        this._speakerMap.set(speakerId, {
          id: speakerId,
          name: channel.name,
          channelId: channel.id
        })
      }

      this.ctx.logger('media-luna').info('Vits speakers registered: %d audio channels', this._speakerMap.size)

      if (this._speakerMap.size > 0) {
        const speakerList = Array.from(this._speakerMap.values())
          .map(s => `${s.name} (ID: ${s.id})`)
          .join(', ')
        this.ctx.logger('media-luna').debug('Available vits speakers: %s', speakerList)
      }
    } catch (error) {
      this.ctx.logger('media-luna').error('Failed to refresh vits speakers: %s', error)
    }
  }

  /**
   * 获取所有可用的 speakers
   */
  getSpeakers(): VitsSpeaker[] {
    return Array.from(this._speakerMap.values())
  }

  /**
   * 实现 vits say 接口
   * @param options Vits.Result 参数
   */
  async say(options: Vits.Result): Promise<h> {
    const { input } = options
    const logger = this.ctx.logger('media-luna')

    // 使用传入的 speaker_id，或者使用第一个可用的 speaker
    let speakerId = options.speaker_id
    if (speakerId === undefined) {
      // 自动使用第一个可用的 speaker
      const firstSpeaker = this._speakerMap.values().next().value
      if (firstSpeaker) {
        speakerId = firstSpeaker.id
        logger.debug('Using first available speaker_id: %d (%s)', speakerId, firstSpeaker.name)
      } else {
        logger.warn('No speakers available')
        return h.text('没有可用的语音渠道，请先创建 text2audio 渠道') as h
      }
    }

    const speaker = this._speakerMap.get(speakerId)
    if (!speaker) {
      logger.warn('Speaker not found: %d', speakerId)
      return h.text(`未找到语音模型 (speaker_id: ${speakerId})`) as h
    }

    logger.debug('Vits say: speaker_id=%d, channel=%s, input=%s',
      speakerId, speaker.name, input.substring(0, 50))

    try {
      const mediaLuna = this.ctx.mediaLuna
      if (!mediaLuna) {
        return h.text('MediaLuna 服务不可用') as h
      }

      const result: GenerationResult = await mediaLuna.generateByName({
        channelName: speaker.name,
        prompt: input,
        files: [],
        session: (options as any).session
      })

      if (!result.success) {
        logger.error('Vits generation failed: %s', result.error)
        return h.text(`语音生成失败: ${result.error || '未知错误'}`) as h
      }

      const audioAsset = result.output?.find(a => a.kind === 'audio' && a.url)
      if (!audioAsset?.url) {
        logger.error('Vits generation returned no audio')
        return h.text('语音生成完成但没有音频输出') as h
      }

      return h.audio(audioAsset.url) as h
    } catch (error) {
      logger.error('Vits generation error: %s', error)
      return h.text(`语音生成异常: ${error instanceof Error ? error.message : '未知错误'}`) as h
    }
  }
}

/** 获取渠道 Speaker ID 基数 */
export function getChannelSpeakerIdBase(): number {
  return CHANNEL_SPEAKER_ID_BASE
}

/** 从渠道 ID 获取 Speaker ID */
export function getSpeakerIdFromChannelId(channelId: number): number {
  return CHANNEL_SPEAKER_ID_BASE + channelId
}

/** 从 Speaker ID 获取渠道 ID */
export function getChannelIdFromSpeakerId(speakerId: number): number | null {
  if (speakerId < CHANNEL_SPEAKER_ID_BASE) {
    return null
  }
  return speakerId - CHANNEL_SPEAKER_ID_BASE
}
