import type { MiddlewareContext, MiddlewareDefinition } from '../../core/types'
import { BILLING_DURATION_SECONDS_KEY } from '../billing/middleware'
import {
  defaultVideoDurationEnhancerConfig,
  type VideoDurationEnhancerConfig
} from './config'

export interface DurationDetection {
  seconds: number
  token?: string
  source: 'parameter' | 'prompt' | 'channel-duration' | 'channel-frames'
}

const DURATION_REGEX = /(\d+(?:\.\d+)?)\s*(s|\u79d2)/i

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parsePositiveNumber(value: unknown, fallback: number): number {
  return positiveNumber(value) ?? fallback
}

function normalizeConfig(config: VideoDurationEnhancerConfig): VideoDurationEnhancerConfig {
  const minSeconds = parsePositiveNumber(config.minSeconds, defaultVideoDurationEnhancerConfig.minSeconds)
  const maxSeconds = Math.max(0, Number(config.maxSeconds) || 0)
  return {
    ...config,
    minSeconds,
    maxSeconds: maxSeconds > 0 ? Math.max(minSeconds, maxSeconds) : 0
  }
}

function isChannelMatched(mctx: MiddlewareContext, config: VideoDurationEnhancerConfig): boolean {
  const matchTags = config.matchChannelTags
    ? config.matchChannelTags.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean)
    : []

  if (matchTags.length === 0) return true

  const channelTags = (mctx.channel?.tags || []).map(tag => tag.toLowerCase())
  return matchTags.some(tag => channelTags.includes(tag))
}

function clampSeconds(seconds: number, config: VideoDurationEnhancerConfig): number {
  const upperBound = config.maxSeconds > 0 ? config.maxSeconds : Number.POSITIVE_INFINITY
  return Math.min(upperBound, Math.max(config.minSeconds, seconds))
}

export function resolveDuration(mctx: MiddlewareContext, config: VideoDurationEnhancerConfig): DurationDetection | null {
  const parameters = mctx.parameters || {}
  const effectiveMode = String(parameters.mode ?? mctx.channel?.connectorConfig?.mode ?? '').toLowerCase()
  if (mctx.channel?.connectorId === 'xai-video' && effectiveMode === 'edit') {
    return null
  }

  const explicit = positiveNumber(
    parameters.duration
      ?? parameters.time
      ?? parameters.seconds
      ?? parameters.videoDurationSeconds
  )
  if (explicit) {
    return { seconds: clampSeconds(explicit, config), source: 'parameter' }
  }

  const match = DURATION_REGEX.exec(mctx.prompt || '')
  if (match) {
    const seconds = positiveNumber(match[1])
    if (seconds) {
      return {
        seconds: clampSeconds(seconds, config),
        token: match[0],
        source: 'prompt'
      }
    }
  }

  const connectorConfig = mctx.channel?.connectorConfig || {}
  const configured = positiveNumber(connectorConfig.duration ?? connectorConfig.seconds ?? connectorConfig.time)
  if (configured) {
    return { seconds: clampSeconds(configured, config), source: 'channel-duration' }
  }

  const frameCount = positiveNumber(connectorConfig.numFrames)
  const frameRate = positiveNumber(connectorConfig.frameRate ?? connectorConfig.fps ?? connectorConfig.framerate)
  if (frameCount && frameRate && frameCount >= 1) {
    return {
      seconds: clampSeconds(Math.max(1, frameCount - 1) / frameRate, config),
      source: 'channel-frames'
    }
  }

  return null
}

function cleanPromptDurationToken(prompt: string, token: string): string {
  return prompt
    .replace(token, ' ')
    .replace(/\s*([,;\uFF0C\uFF1B])\s*([,;\uFF0C\uFF1B])\s*/g, '$1 ')
    .replace(/^\s*[,;\uFF0C\uFF1B]\s*|\s*[,;\uFF0C\uFF1B]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function createVideoDurationEnhancerMiddleware(): MiddlewareDefinition {
  return {
    name: 'video-duration-enhancer',
    displayName: '视频时长增强',
    description: '统一读取指令、提示词和渠道配置中的视频时长，并为按秒计费提供一致上下文',
    category: 'transform',
    phase: 'lifecycle-prepare',
    before: ['billing-prepare'],
    configGroup: 'video-duration-enhancer',

    async execute(mctx, next) {
      const mwConfig = await mctx.getMiddlewareConfig<VideoDurationEnhancerConfig>('video-duration-enhancer')
      const config = normalizeConfig({
        ...defaultVideoDurationEnhancerConfig,
        ...(mwConfig || {})
      })

      if (!isChannelMatched(mctx, config)) {
        mctx.setMiddlewareLog('video-duration-enhancer', { skipped: true, reason: 'channel tags not matched' })
        return next()
      }

      const detection = resolveDuration(mctx, config)
      if (!detection) {
        mctx.setMiddlewareLog('video-duration-enhancer', { skipped: true, reason: 'duration not detected' })
        return next()
      }

      const seconds = detection.seconds
      mctx.store.set(BILLING_DURATION_SECONDS_KEY, seconds)
      mctx.parameters = {
        ...mctx.parameters,
        videoDurationSeconds: seconds,
        ...(config.writeSecondsParameter ? { seconds } : {}),
        ...(config.writeDurationParameter ? { duration: seconds } : {})
      }

      if (config.removeDurationFromPrompt && detection.token) {
        const cleanPrompt = cleanPromptDurationToken(mctx.prompt, detection.token)
        if (cleanPrompt) mctx.prompt = cleanPrompt
      }

      mctx.setMiddlewareLog('video-duration-enhancer', {
        seconds,
        source: detection.source,
        token: detection.token?.trim(),
        promptChanged: Boolean(config.removeDurationFromPrompt && detection.token),
        billingStoreKey: BILLING_DURATION_SECONDS_KEY
      })

      return next()
    }
  }
}

export const VideoDurationEnhancerMiddleware = createVideoDurationEnhancerMiddleware()
