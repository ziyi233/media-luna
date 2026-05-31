import type { FileData, MiddlewareContext, MiddlewareDefinition } from '../../core/types'
import {
  defaultDalleSizeEnhancerConfig,
  type DalleSizeEnhancerConfig
} from './config'

interface SizeValue {
  width: number
  height: number
}

interface SizeDetection {
  size: SizeValue
  source: 'explicit' | 'ratio' | 'first-image'
  token?: string
}

const EXPLICIT_SIZE_REGEX = /(?:^|[\s,，;；(（\[])(\d{2,5})\s*[xX*×]\s*(\d{2,5})(?=$|[\s,，;；)）\]])/
const RATIO_REGEX = /(?:^|[\s,，;；(（\[])(\d{1,4})\s*[:：]\s*(\d{1,4})(?=$|[\s,，;；)）\]])/

function parsePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeConfig(config: DalleSizeEnhancerConfig): DalleSizeEnhancerConfig {
  const maxWidth = parsePositiveNumber(config.maxWidth, defaultDalleSizeEnhancerConfig.maxWidth)
  const maxHeight = parsePositiveNumber(config.maxHeight, defaultDalleSizeEnhancerConfig.maxHeight)
  const minWidth = Math.min(parsePositiveNumber(config.minWidth, defaultDalleSizeEnhancerConfig.minWidth), maxWidth)
  const minHeight = Math.min(parsePositiveNumber(config.minHeight, defaultDalleSizeEnhancerConfig.minHeight), maxHeight)

  return {
    ...config,
    maxWidth,
    maxHeight,
    minWidth,
    minHeight,
    roundTo: Math.max(1, Math.floor(parsePositiveNumber(config.roundTo, defaultDalleSizeEnhancerConfig.roundTo))),
    maxAspectRatio: Math.max(0, Number(config.maxAspectRatio) || 0),
    minTotalPixels: Math.max(0, Number(config.minTotalPixels) || 0),
    maxTotalPixels: Math.max(0, Number(config.maxTotalPixels) || 0)
  }
}

function isChannelMatched(context: MiddlewareContext, config: DalleSizeEnhancerConfig): boolean {
  const matchTags = config.matchChannelTags
    ? config.matchChannelTags.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean)
    : []

  if (matchTags.length === 0) return true

  const channelTags = (context.channel?.tags || []).map(tag => tag.toLowerCase())
  return matchTags.some(tag => channelTags.includes(tag))
}

function roundDimension(value: number, step: number): number {
  if (step <= 1) return Math.round(value)
  return Math.max(step, Math.round(value / step) * step)
}

function clampAndRoundSize(size: SizeValue, config: DalleSizeEnhancerConfig): SizeValue {
  const width = Math.min(config.maxWidth, Math.max(config.minWidth, roundDimension(size.width, config.roundTo)))
  const height = Math.min(config.maxHeight, Math.max(config.minHeight, roundDimension(size.height, config.roundTo)))
  return applyOptionalConstraints({ width, height }, config)
}

function scaleSize(size: SizeValue, scale: number): SizeValue {
  return {
    width: size.width * scale,
    height: size.height * scale
  }
}

function roundAndApplyMinMax(size: SizeValue, config: DalleSizeEnhancerConfig): SizeValue {
  return {
    width: Math.min(config.maxWidth, Math.max(config.minWidth, roundDimension(size.width, config.roundTo))),
    height: Math.min(config.maxHeight, Math.max(config.minHeight, roundDimension(size.height, config.roundTo)))
  }
}

function applyOptionalConstraints(size: SizeValue, config: DalleSizeEnhancerConfig): SizeValue {
  let adjusted = size

  if (config.maxAspectRatio > 0) {
    const longSide = Math.max(adjusted.width, adjusted.height)
    const shortSide = Math.min(adjusted.width, adjusted.height)
    if (shortSide > 0 && longSide / shortSide > config.maxAspectRatio) {
      if (adjusted.width >= adjusted.height) {
        adjusted = { ...adjusted, width: adjusted.height * config.maxAspectRatio }
      } else {
        adjusted = { ...adjusted, height: adjusted.width * config.maxAspectRatio }
      }
    }
  }

  const pixels = adjusted.width * adjusted.height
  if (config.maxTotalPixels > 0 && pixels > config.maxTotalPixels) {
    adjusted = scaleSize(adjusted, Math.sqrt(config.maxTotalPixels / pixels))
  } else if (config.minTotalPixels > 0 && pixels > 0 && pixels < config.minTotalPixels) {
    adjusted = scaleSize(adjusted, Math.sqrt(config.minTotalPixels / pixels))
  }

  return roundAndApplyMinMax(adjusted, config)
}

function fitRatioToBounds(ratioWidth: number, ratioHeight: number, config: DalleSizeEnhancerConfig): SizeValue {
  const scale = Math.min(config.maxWidth / ratioWidth, config.maxHeight / ratioHeight)
  return clampAndRoundSize({
    width: ratioWidth * scale,
    height: ratioHeight * scale
  }, config)
}

function parseSizeFromPrompt(prompt: string, config: DalleSizeEnhancerConfig): SizeDetection | null {
  const explicitMatch = EXPLICIT_SIZE_REGEX.exec(prompt)
  if (explicitMatch) {
    const width = Number(explicitMatch[1])
    const height = Number(explicitMatch[2])
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return {
        size: clampAndRoundSize({ width, height }, config),
        source: 'explicit',
        token: explicitMatch[0]
      }
    }
  }

  const ratioMatch = RATIO_REGEX.exec(prompt)
  if (ratioMatch) {
    const ratioWidth = Number(ratioMatch[1])
    const ratioHeight = Number(ratioMatch[2])
    if (Number.isFinite(ratioWidth) && Number.isFinite(ratioHeight) && ratioWidth > 0 && ratioHeight > 0) {
      return {
        size: fitRatioToBounds(ratioWidth, ratioHeight, config),
        source: 'ratio',
        token: ratioMatch[0]
      }
    }
  }

  return null
}

function cleanPromptSizeToken(prompt: string, token?: string): string {
  if (!token) return prompt
  return prompt
    .replace(token, ' ')
    .replace(/\s*([,，;；])\s*([,，;；])\s*/g, '$1 ')
    .replace(/^\s*[,，;；]\s*|\s*[,，;；]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function readPngDimensions(bytes: Uint8Array): SizeValue | null {
  if (bytes.length < 24) return null
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return null
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false)
  }
}

function readJpegDimensions(bytes: Uint8Array): SizeValue | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null

    const marker = bytes[offset + 1]
    offset += 2

    if (marker === 0xd8 || marker === 0xd9) continue
    if (offset + 2 > bytes.length) return null

    const length = (bytes[offset] << 8) + bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) return null

    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof && length >= 7) {
      return {
        height: (bytes[offset + 3] << 8) + bytes[offset + 4],
        width: (bytes[offset + 5] << 8) + bytes[offset + 6]
      }
    }

    offset += length
  }

  return null
}

function readWebpDimensions(bytes: Uint8Array): SizeValue | null {
  if (bytes.length < 30) return null
  const riff = String.fromCharCode(...bytes.slice(0, 4))
  const webp = String.fromCharCode(...bytes.slice(8, 12))
  if (riff !== 'RIFF' || webp !== 'WEBP') return null

  const chunk = String.fromCharCode(...bytes.slice(12, 16))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (chunk === 'VP8X' && bytes.length >= 30) {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    }
  }

  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff
    }
  }

  if (chunk === 'VP8L' && bytes.length >= 25) {
    const b0 = bytes[21]
    const b1 = bytes[22]
    const b2 = bytes[23]
    const b3 = bytes[24]
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    }
  }

  return null
}

function readImageDimensions(file: FileData): SizeValue | null {
  if (!file.mime?.startsWith('image/')) return null

  const bytes = new Uint8Array(file.data)
  if (file.mime === 'image/png') return readPngDimensions(bytes)
  if (file.mime === 'image/jpeg' || file.mime === 'image/jpg') return readJpegDimensions(bytes)
  if (file.mime === 'image/webp') return readWebpDimensions(bytes)

  return readPngDimensions(bytes) || readJpegDimensions(bytes) || readWebpDimensions(bytes)
}

function detectSizeFromFirstImage(files: FileData[], config: DalleSizeEnhancerConfig): SizeDetection | null {
  const firstImage = files.find(file => file.mime?.startsWith('image/'))
  if (!firstImage) return null

  const dimensions = readImageDimensions(firstImage)
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return null

  return {
    size: fitRatioToBounds(dimensions.width, dimensions.height, config),
    source: 'first-image'
  }
}

function formatSize(size: SizeValue): string {
  return `${size.width}x${size.height}`
}

export function createDalleSizeEnhancerMiddleware(): MiddlewareDefinition {
  return {
    name: 'dalle-size-enhancer',
    displayName: 'DALL-E 尺寸增强',
    description: '解析 prompt 中的分辨率/比例，并按最大宽高推导 DALL-E size 参数',
    category: 'transform',
    phase: 'lifecycle-pre-request',
    after: ['preset'],
    before: ['request'],
    configGroup: 'dalle-size-enhancer',

    async execute(context, next) {
      const mwConfig = await context.getMiddlewareConfig<DalleSizeEnhancerConfig>('dalle-size-enhancer')
      const config = normalizeConfig({
        ...defaultDalleSizeEnhancerConfig,
        ...(mwConfig || {})
      })

      if (!isChannelMatched(context, config)) {
        context.setMiddlewareLog('dalle-size-enhancer', { skipped: true, reason: 'channel tags not matched' })
        return next()
      }

      const promptDetection = parseSizeFromPrompt(context.prompt || '', config)
      const detection = promptDetection || (config.autoFromFirstImage
        ? detectSizeFromFirstImage(context.files || [], config)
        : null)

      if (!detection) {
        context.setMiddlewareLog('dalle-size-enhancer', { skipped: true, reason: 'size not detected' })
        return next()
      }

      const size = formatSize(detection.size)
      context.parameters = {
        ...context.parameters,
        size
      }

      if (context.channel) {
        context.channel.connectorConfig = {
          ...context.channel.connectorConfig,
          size
        }
      }

      if (config.removeSizeFromPrompt && promptDetection?.token) {
        const cleanPrompt = cleanPromptSizeToken(context.prompt, promptDetection.token)
        if (cleanPrompt) {
          context.prompt = cleanPrompt
        }
      }

      context.setMiddlewareLog('dalle-size-enhancer', {
        size,
        source: detection.source,
        token: detection.token?.trim(),
        maxWidth: config.maxWidth,
        maxHeight: config.maxHeight,
        maxAspectRatio: config.maxAspectRatio || undefined,
        minTotalPixels: config.minTotalPixels || undefined,
        maxTotalPixels: config.maxTotalPixels || undefined
      })

      return next()
    }
  }
}

export const DalleSizeEnhancerMiddleware = createDalleSizeEnhancerMiddleware()
