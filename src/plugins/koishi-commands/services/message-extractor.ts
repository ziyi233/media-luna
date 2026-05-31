import { h, type Session } from 'koishi'
import type { FileData } from '../../../types'
import type { KoishiCommandsConfig } from '../config'

export interface CollectState {
  files: FileData[]
  processedUrls: Set<string>
  prompts: string[]
  presetName?: string
}

interface ExtractResult {
  images: number
  avatars: number
  failed: number
  skipped: number
  failedUrls: string[]
}

export class MessageExtractor {
  private ctx: any
  private logger: any
  private state: CollectState
  private config: KoishiCommandsConfig
  private result: ExtractResult
  private commandPrefixes: string[]

  constructor(
    ctx: any,
    logger: any,
    state: CollectState,
    config: KoishiCommandsConfig,
    commandPrefixes: string[] = []
  ) {
    this.ctx = ctx
    this.logger = logger
    this.state = state
    this.config = config
    this.result = { images: 0, avatars: 0, failed: 0, skipped: 0, failedUrls: [] }
    this.commandPrefixes = [...commandPrefixes].sort((a, b) => b.length - a.length)
  }

  getResult(): ExtractResult {
    return { ...this.result }
  }

  resetResult(): void {
    this.result = { images: 0, avatars: 0, failed: 0, skipped: 0, failedUrls: [] }
  }

  async extractAll(session: Session | undefined): Promise<string> {
    if (!session?.elements) return ''
    await this.extractMedia(session)
    return this.extractText(session.elements)
  }

  get stateInfo() {
    return {
      files: this.state.files.length,
      prompts: this.state.prompts.length
    }
  }

  async extractMedia(session: Session | undefined): Promise<void> {
    if (!session?.elements) return

    this.logger.debug('Message elements: %s', JSON.stringify(session.elements, null, 2))
    if (session.quote) {
      this.logger.debug('Quote message: %s', JSON.stringify(session.quote, null, 2))
    }

    await this.extractFromQuote(session)
    await this.extractImages(session.elements)
    await this.extractVideos(session.elements, session)
    await this.extractAtAvatars(session)

    this.logger.info(
      'Extract result: %d images, %d avatars, %d failed, %d skipped. Total files: %d',
      this.result.images, this.result.avatars, this.result.failed, this.result.skipped,
      this.state.files.length
    )

    if (this.result.failedUrls.length > 0) {
      this.logger.warn('Failed URLs: %s', this.result.failedUrls.join(', '))
    }
  }

  async extractImages(elements: any[]): Promise<void> {
    for (const el of elements) {
      if (el.type === 'quote') continue

      if (el.type === 'img' || el.type === 'image') {
        const imageUrl = el.attrs?.src || el.attrs?.url || el.attrs?.file
        if (imageUrl) {
          const success = await this.fetchImage(imageUrl, 'image')
          if (success) this.result.images++
        } else {
          this.logger.warn('Image element has no URL, attrs: %s', JSON.stringify(el.attrs))
        }
      }
    }
  }

  async extractVideos(elements: any[], session?: Session): Promise<void> {
    for (const el of elements) {
      if (el.type === 'video') {
        this.logger.info('Found video element. Full structure: %s', JSON.stringify(el, null, 2))

        let targetUrl = el.attrs?.url || el.attrs?.src

        if (targetUrl && !targetUrl.startsWith('http')) {
          for (const [key, val] of Object.entries(el.attrs || {})) {
            if (typeof val === 'string' && val.startsWith('http')) {
              this.logger.info('Found alternative HTTP URL in attr %s: %s', key, val)
              targetUrl = val
              break
            }
          }
        }

        if (this.config.useNapCatFileApi && session?.bot?.platform && ['onebot', 'qq', 'red'].includes(session.bot.platform)) {
          const fileId = el.attrs?.file || el.attrs?.file_id
          const isLocalPath = !targetUrl || !targetUrl.startsWith('http')
          const onebot = (session as any).onebot

          if (isLocalPath && fileId && onebot?._request) {
            try {
              this.logger.info(`Attempting to fetch real URL for video fileId: ${fileId} using NapCat API`)
              const { data } = await onebot._request('get_file', { file: fileId })
              if (data && data.url && (data.url.startsWith('http://') || data.url.startsWith('https://'))) {
                this.logger.info(`Successfully retrieved NapCat video URL: ${data.url}`)
                targetUrl = data.url
              } else {
                this.logger.warn(`NapCat API returned no URL for fileId: ${fileId}. Trying to use get_group_file_url.`)
                const { data } = await onebot._request('get_group_file_url', { file: fileId, group_id: session.guildId })
                if (data && data.url && (data.url.startsWith('http://') || data.url.startsWith('https://'))) {
                  this.logger.info(`Successfully retrieved NapCat video URL: ${data.url}`)
                  targetUrl = data.url
                } else {
                  this.logger.warn(`get_group_file_url returned no URL for fileId: ${fileId}.`)
                }
              }
            } catch (e) {
              this.logger.warn(`Failed to call NapCat get_file for ${fileId}: ${e}`)
            }
          }
        }

        if (targetUrl) {
          this.logger.info('Attempting to fetch video from: %s', targetUrl)
          await this.fetchVideo(targetUrl, 'input')
        } else {
          this.logger.warn('No URL found for video element')
        }
      }
    }
  }

  async extractAtAvatars(session: Session): Promise<void> {
    if (!session.elements) return

    const atElements = h.select(session.elements, 'at')
    for (const at of atElements) {
      const userId = at.attrs?.id
      if (userId && session.bot) {
        try {
          const user = await session.bot.getUser(userId)
          const avatarUrl = user?.avatar
          if (avatarUrl) {
            const success = await this.fetchImage(avatarUrl, 'avatar')
            if (success) {
              this.result.avatars++
              this.logger.debug('Extracted avatar for user %s', userId)
            }
          } else {
            this.logger.debug('User %s has no avatar', userId)
          }
        } catch (e) {
          this.logger.warn('Failed to get user info for %s: %s', userId, e)
        }
      }
    }
  }

  async extractFromQuote(session: Session): Promise<void> {
    if (session.elements) {
      for (const el of session.elements) {
        if (el.type === 'quote' && el.children && el.children.length > 0) {
          for (const child of el.children) {
            if (child.type === 'img' || child.type === 'image') {
              await this.fetchImage(child.attrs?.src || child.attrs?.url, 'quote')
            }
          }
        }
      }
    }

    const quote = session.quote as any
    if (quote?.elements) {
      this.logger.debug('Extracting from session.quote.elements')
      for (const el of quote.elements) {
        if (el.type === 'img' || el.type === 'image') {
          await this.fetchImage(el.attrs?.src || el.attrs?.url, 'quote')
        }
      }
    } else if (quote?.content) {
      this.logger.debug('Quote has content but no elements: %s', quote.content)
    }
  }

  extractText(elements: any[]): string {
    const textElements = h.select(elements, 'text')
    return textElements.map(el => el.attrs?.content || '').join('').trim()
  }

  extractTextWithoutCommand(elements: any[]): string {
    let text = this.extractText(elements)
    if (!text || this.commandPrefixes.length === 0) return text

    const textLower = text.toLowerCase()

    for (const cmdName of this.commandPrefixes) {
      const cmdLower = cmdName.toLowerCase()
      if (textLower.startsWith(cmdLower)) {
        text = text.substring(cmdName.length).trimStart()
        break
      }
    }

    return text
  }

  addPrompt(text: string): void {
    if (text && !['开始', 'go', 'start', '取消', 'cancel'].includes(text.toLowerCase())) {
      this.state.prompts.push(text)
    }
  }

  async fetchImage(url: string, source: 'image' | 'avatar' | 'quote' | 'input'): Promise<boolean> {
    if (!url) {
      this.logger.debug('fetchImage called with empty URL')
      return false
    }

    if (this.state.processedUrls.has(url)) {
      this.logger.debug('Skipping duplicate URL: %s', url.substring(0, 100))
      this.result.skipped++
      return false
    }

    this.state.processedUrls.add(url)

    try {
      const response = await this.ctx.http.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000
      })

      if (!response || response.byteLength === 0) {
        this.logger.warn('Empty response for image: %s', url.substring(0, 100))
        this.result.failed++
        this.result.failedUrls.push(url.substring(0, 100))
        return false
      }

      const buffer = Buffer.from(response)
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      const mime = this.detectMimeType(buffer) || 'image/png'

      this.state.files.push({
        data: arrayBuffer,
        mime,
        filename: `${source}_${this.state.files.length}.${this.getExtFromMime(mime)}`
      })

      this.logger.debug('Fetched image: %s (%d bytes, %s)', source, buffer.length, mime)
      return true
    } catch (e: any) {
      const errorMsg = e?.message || String(e)
      this.logger.warn('Failed to fetch image [%s]: %s (URL: %s)', source, errorMsg, url.substring(0, 100))
      this.result.failed++
      this.result.failedUrls.push(url.substring(0, 100))
      return false
    }
  }

  async fetchVideo(url: string, source: 'quote' | 'input'): Promise<boolean> {
    if (!url || this.state.processedUrls.has(url)) return false

    this.state.processedUrls.add(url)
    try {
      this.logger.debug('Fetching video from %s', url)
      const response = await this.ctx.http.get(url, { responseType: 'arraybuffer', timeout: 30000 })
      const buffer = Buffer.from(response)

      if (buffer.length === 0) {
        this.logger.warn('Empty video response from %s', url)
        return false
      }

      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

      let mime = 'video/mp4'
      if (url.endsWith('.webm')) mime = 'video/webm'
      if (url.endsWith('.mov')) mime = 'video/quicktime'
      if (url.endsWith('.mkv')) mime = 'video/x-matroska'

      this.state.files.push({
        data: arrayBuffer,
        mime,
        filename: `${source}_${this.state.files.length}.${mime.split('/')[1] || 'mp4'}`
      })

      this.logger.debug('Fetched video: %s (%d bytes, %s)', source, buffer.length, mime)
      return true
    } catch (e: any) {
      this.logger.warn('Failed to fetch video from %s: %s', source, e?.message || e)
      return false
    }
  }

  private detectMimeType(buffer: Buffer): string | null {
    if (buffer.length < 4) return null

    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'image/png'
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg'
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return 'image/gif'
    }
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer.length > 11 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'image/webp'
    }
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
      return 'image/bmp'
    }

    return null
  }

  private getExtFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp'
    }
    return map[mime] || 'png'
  }
}
