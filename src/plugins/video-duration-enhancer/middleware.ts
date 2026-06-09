import type { MiddlewareContext, MiddlewareDefinition } from '../../core/types'
import { BILLING_DURATION_SECONDS_KEY } from '../billing/middleware'
import {
  defaultVideoDurationEnhancerConfig,
  type VideoDurationEnhancerConfig
} from './config'

interface DurationDetection {
  seconds: number
  token: string
}

const DURATION_REGEX = /(\d+(?:\.\d+)?)\s*(s|S|秒)/i

function parsePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
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

function parseDurationFromPrompt(prompt: string, config: VideoDurationEnhancerConfig): DurationDetection | null {
  const match = DURATION_REGEX.exec(prompt)
  if (!match) return null

  const seconds = Number(match[1])
  if (!Number.isFinite(seconds) || seconds <= 0) return null

  return {
    seconds: clampSeconds(seconds, config),
    token: match[0]
  }
}

function cleanPromptDurationToken(prompt: string, detection: DurationDetection): string {
  return prompt
    .replace(detection.token, ' ')
    .replace(/\s*([,，;；])\s*([,，;；])\s*/g, '$1 ')
    .replace(/^\s*[,，;；]\s*|\s*[,，;；]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function createVideoDurationEnhancerMiddleware(): MiddlewareDefinition {
  return {
    name: 'video-duration-enhancer',
    displayName: '视频时长增强',
    description: '解析提示词中的 5s/5秒 时长标记，改写视频参数并为按秒计费提供上下文',
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

      const detection = parseDurationFromPrompt(mctx.prompt || '', config)
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

      if (config.removeDurationFromPrompt) {
        const cleanPrompt = cleanPromptDurationToken(mctx.prompt, detection)
        if (cleanPrompt) {
          mctx.prompt = cleanPrompt
        }
      }

      mctx.setMiddlewareLog('video-duration-enhancer', {
        seconds,
        token: detection.token.trim(),
        promptChanged: config.removeDurationFromPrompt,
        billingStoreKey: BILLING_DURATION_SECONDS_KEY
      })

      return next()
    }
  }
}

export const VideoDurationEnhancerMiddleware = createVideoDurationEnhancerMiddleware()
