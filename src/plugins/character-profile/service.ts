import type { Context } from 'koishi'
import type { MediaLunaCharacterProfile } from '../../augmentations'
import type { FileData } from '../../types'
import type { CachePluginConfig } from '../cache/config'
import type { CacheService } from '../cache/service'
import type { CharacterProfileConfig } from './config'

export interface CharacterProfileData {
  id: number
  uid: number
  name: string
  description: string
  imageUrls: string[]
  isPublic: boolean
  publicDescription: string
  sourceProfileId?: number
  sourceOwnerUid?: number
  createdAt: Date
  updatedAt: Date
}

export interface ExpandedCharacterProfile {
  profile: CharacterProfileData
  prompt: string
  files: FileData[]
}

export class CharacterProfileService {
  constructor(
    private ctx: Context,
    private getConfig?: () => CharacterProfileConfig,
    private getCacheService?: () => CacheService | undefined
  ) {}

  private toData(record: MediaLunaCharacterProfile): CharacterProfileData {
    return {
      id: record.id,
      uid: record.uid,
      name: record.name,
      description: record.description,
      imageUrls: JSON.parse(record.imageUrls || '[]'),
      isPublic: record.isPublic,
      publicDescription: record.publicDescription || '',
      sourceProfileId: record.sourceProfileId,
      sourceOwnerUid: record.sourceOwnerUid,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }
  }

  async listByUid(uid: number): Promise<CharacterProfileData[]> {
    const records = await this.ctx.database.get('medialuna_character_profile', { uid })
    return records
      .map((record) => this.toData(record as MediaLunaCharacterProfile))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }

  async getByUidAndName(uid: number, name: string): Promise<CharacterProfileData | null> {
    const records = await this.ctx.database.get('medialuna_character_profile', { uid, name })
    return records.length > 0 ? this.toData(records[0] as MediaLunaCharacterProfile) : null
  }

  async create(input: {
    uid: number
    name: string
    description: string
    imageUrls: string[]
    isPublic?: boolean
    publicDescription?: string
    sourceProfileId?: number
    sourceOwnerUid?: number
  }): Promise<CharacterProfileData> {
    const now = new Date()
    const record = await this.ctx.database.create('medialuna_character_profile', {
      uid: input.uid,
      name: input.name,
      description: input.description,
      imageUrls: JSON.stringify(input.imageUrls),
      isPublic: input.isPublic ?? false,
      publicDescription: input.publicDescription || '',
      sourceProfileId: input.sourceProfileId,
      sourceOwnerUid: input.sourceOwnerUid,
      createdAt: now,
      updatedAt: now
    })
    await this.reconcileReferences(false)
    return (await this.getById(record.id)) || this.toData(record as MediaLunaCharacterProfile)
  }

  async update(id: number, uid: number, patch: Partial<Pick<CharacterProfileData, 'name' | 'description' | 'imageUrls' | 'isPublic' | 'publicDescription'>>): Promise<CharacterProfileData | null> {
    const existing = await this.getById(id)
    if (!existing || existing.uid !== uid) return null

    const updateData: Record<string, any> = {
      updatedAt: new Date()
    }

    if (patch.name !== undefined) updateData.name = patch.name
    if (patch.description !== undefined) updateData.description = patch.description
    if (patch.imageUrls !== undefined) updateData.imageUrls = JSON.stringify(patch.imageUrls)
    if (patch.isPublic !== undefined) updateData.isPublic = patch.isPublic
    if (patch.publicDescription !== undefined) updateData.publicDescription = patch.publicDescription

    await this.ctx.database.set('medialuna_character_profile', { id }, updateData)
    await this.reconcileReferences(false)
    return this.getById(id)
  }

  async getById(id: number): Promise<CharacterProfileData | null> {
    const records = await this.ctx.database.get('medialuna_character_profile', { id })
    return records.length > 0 ? this.toData(records[0] as MediaLunaCharacterProfile) : null
  }

  async delete(id: number, uid: number): Promise<boolean> {
    const existing = await this.getById(id)
    if (!existing || existing.uid !== uid) return false
    await this.ctx.database.remove('medialuna_character_profile', { id })
    await this.reconcileReferences(true)
    return true
  }

  async listPublic(keyword?: string): Promise<CharacterProfileData[]> {
    const records = await this.ctx.database.get('medialuna_character_profile', { isPublic: true })
    const profiles = records
      .map((record) => this.toData(record as MediaLunaCharacterProfile))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

    const query = keyword?.trim().toLowerCase()
    if (!query) return profiles

    return profiles.filter((profile) => {
      return profile.name.toLowerCase().includes(query)
        || profile.description.toLowerCase().includes(query)
        || profile.publicDescription.toLowerCase().includes(query)
    })
  }

  async setPublicState(uid: number, name: string, isPublic: boolean, publicDescription?: string): Promise<CharacterProfileData | null> {
    const profile = await this.getByUidAndName(uid, name)
    if (!profile) return null

    return this.update(profile.id, uid, {
      isPublic,
      publicDescription: publicDescription !== undefined ? publicDescription : profile.publicDescription
    })
  }

  async clonePublicToUser(profileId: number, targetUid: number, targetName?: string): Promise<CharacterProfileData | null> {
    const source = await this.getById(profileId)
    if (!source || !source.isPublic) return null

    const finalName = (targetName || source.name).trim()
    const existing = await this.getByUidAndName(targetUid, finalName)
    if (existing) {
      throw new Error(`你的设定集中已存在「${finalName}」`)
    }

    return this.create({
      uid: targetUid,
      name: finalName,
      description: source.description,
      imageUrls: source.imageUrls,
      isPublic: false,
      publicDescription: '',
      sourceProfileId: source.id,
      sourceOwnerUid: source.uid
    })
  }

  async cacheImages(urls: string[], cache?: CacheService): Promise<string[]> {
    const results: string[] = []
    const storageSchemeNames = this.getStorageSchemeNames()
    for (const url of urls) {
      const trimmed = String(url || '').trim()
      if (!trimmed) continue

      if (trimmed.startsWith('data:')) {
        results.push(trimmed)
        continue
      }

      if (!cache) {
        results.push(trimmed)
        continue
      }

      try {
        const cached = await this.cacheUrlWithPriority(cache, trimmed, storageSchemeNames)
        results.push(cached.url || trimmed)
      } catch {
        results.push(trimmed)
      }
    }
    return results
  }

  async cacheFiles(files: FileData[], cache?: CacheService): Promise<string[]> {
    const results: string[] = []
    const storageSchemeNames = this.getStorageSchemeNames()

    for (const file of files) {
      if (!cache) {
        continue
      }

      try {
        const cached = await this.cacheFileWithPriority(cache, file, storageSchemeNames)
        if (cached.url) {
          results.push(cached.url)
        }
      } catch {
        // ignore broken cache writes
      }
    }

    return results
  }

  async syncProfileStorage(options?: { uid?: number; name?: string }): Promise<{ updated: number; skipped: number; failed: number; profiles: string[] }> {
    const profiles = await this.resolveProfilesForSync(options)

    const cache = this.getCacheService?.()
    if (!cache) {
      throw new Error('缓存服务不可用')
    }

    let updated = 0
    let skipped = 0
    let failed = 0
    const profileNames: string[] = []

    for (const profile of profiles) {
      profileNames.push(profile.name)
      if (!profile.imageUrls.length) {
        skipped++
        continue
      }

      const syncedUrls = await this.syncImageUrls(profile.imageUrls, cache)
      if (syncedUrls.length === 0) {
        failed++
        continue
      }

      const changed = JSON.stringify(syncedUrls) !== JSON.stringify(profile.imageUrls)
      if (!changed) {
        skipped++
        continue
      }

      await this.update(profile.id, profile.uid, { imageUrls: syncedUrls })
      updated++
    }

    return { updated, skipped, failed, profiles: profileNames }
  }

  async syncImageUrls(urls: string[], cache: CacheService): Promise<string[]> {
    const storageSchemeNames = this.getStorageSchemeNames()
    const rewrittenUrls = this.tryRewriteUrls(urls, cache, storageSchemeNames)
    if (rewrittenUrls) {
      return rewrittenUrls
    }

    return this.cacheImages(urls, cache)
  }

  async expandPromptWithProfiles(
    uid: number | null | undefined,
    prompt: string,
    existingFiles: FileData[],
    logger?: { debug: (...args: any[]) => void }
  ): Promise<{ prompt: string; files: FileData[]; matchedProfiles: CharacterProfileData[] }> {
    const skipReplacementMarker = this.getSkipReplacementMarker()
    const hasSkipMarker = !!skipReplacementMarker && prompt.includes(skipReplacementMarker)
    const escapedPrompt = hasSkipMarker
      ? this.removeSkipMarker(prompt, skipReplacementMarker)
      : prompt.trim()

    if (!uid || !escapedPrompt.trim()) {
      return { prompt: escapedPrompt, files: existingFiles, matchedProfiles: [] }
    }

    if (hasSkipMarker) {
      logger?.debug?.('[CharacterProfile] skipped replacement due to skip marker=%s', skipReplacementMarker)
      return { prompt: escapedPrompt, files: existingFiles, matchedProfiles: [] }
    }

    const profiles = await this.listByUid(uid)
    if (profiles.length === 0) {
      return { prompt: escapedPrompt, files: existingFiles, matchedProfiles: [] }
    }

    const matchedProfiles = this.matchProfiles(escapedPrompt, profiles)
    if (matchedProfiles.length === 0) {
      return { prompt: escapedPrompt, files: existingFiles, matchedProfiles: [] }
    }

    const files = [...existingFiles]
    let expandedPrompt = escapedPrompt

    for (const profile of matchedProfiles) {
      const injectedFiles = await this.loadReferenceImages(profile.name, profile.imageUrls)
      const description = profile.description.trim()

      if (!description && injectedFiles.length === 0) {
        logger?.debug?.('[CharacterProfile] skipped empty profile=%s', profile.name)
        continue
      }

      files.push(...injectedFiles)

      const suffixParts: string[] = []
      if (description) {
        suffixParts.push(`${profile.name}的形象文本描述：${description}`)
      }

      if (injectedFiles.length > 0) {
        const imageStartIndex = files.length - injectedFiles.length + 1
        const imageLabels = injectedFiles.map((_, index) => `第${imageStartIndex + index}张图`).join(' ')
        suffixParts.push(`${imageLabels}是${profile.name}的形象设计图`)
      }

      if (suffixParts.length > 0) {
        expandedPrompt = `${expandedPrompt} ${suffixParts.join('。')}`.trim()
      }

      logger?.debug?.('[CharacterProfile] expanded profile=%s injectedFiles=%s', profile.name, injectedFiles.length)
    }

    return {
      prompt: expandedPrompt,
      files,
      matchedProfiles
    }
  }

  private async loadReferenceImages(profileName: string, urls: string[]): Promise<FileData[]> {
    const files: FileData[] = []
    const cache = this.getCacheService?.()

    for (let index = 0; index < urls.length; index++) {
      const url = urls[index]
      const loaded = cache ? await cache.loadReference(url) : null
      if (!loaded) {
        throw new Error(`人物设定「${profileName}」的第 ${index + 1} 张参考图已丢失，请编辑设定并重新上传图片`)
      }
      files.push(loaded)
    }

    return files
  }

  private getStorageSchemeNames(): Array<string | undefined> {
    const raw = this.getConfig?.().storageSchemeNames || ''
    const names = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    if (names.length === 0) {
      return [undefined]
    }

    return [...names, undefined]
  }

  private getSkipReplacementMarker(): string {
    return this.getConfig?.().skipReplacementMarker?.trim() || '@@'
  }

  private tryRewriteUrls(urls: string[], cache: CacheService, schemeNames: Array<string | undefined>): string[] | null {
    const targetConfig = this.resolveTargetCacheConfig(cache, schemeNames)
    if (!targetConfig) return null

    const targetBase = this.resolveTargetBaseUrl(targetConfig, cache)
    const targetPublicPath = this.resolveTargetPublicPath(targetConfig)
    const currentBases = this.collectCurrentBaseCandidates(cache)

    if (!targetBase && !targetPublicPath) {
      return null
    }

    const rewritten: string[] = []
    for (const url of urls) {
      const parsed = this.parseCacheAssetUrl(url)
      if (!parsed) {
        return null
      }

      const matched = currentBases.some((base) => url.startsWith(base)) || url.startsWith('/')
      if (!matched) {
        return null
      }

      rewritten.push(this.buildTargetUrl(parsed.id, parsed.ext, targetBase, targetPublicPath))
    }

    return rewritten
  }

  private removeSkipMarker(prompt: string, marker: string): string {
    if (!marker) {
      return prompt.trim()
    }

    return prompt
      .split(marker).join('')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim()
  }

  private async cacheUrlWithPriority(cache: CacheService, url: string, schemeNames: Array<string | undefined>) {
    let lastError: unknown = null
    for (const schemeName of schemeNames) {
      try {
        return await cache.cacheFromUrl(url, { schemeName, persistent: true })
      } catch (error) {
        lastError = error
      }
    }
    throw lastError || new Error('cacheFromUrl failed')
  }

  private resolveTargetCacheConfig(cache: CacheService, schemeNames: Array<string | undefined>): CachePluginConfig | null {
    try {
      return cache.getSchemeConfig(schemeNames[0])
    } catch {
      return null
    }
  }

  private collectCurrentBaseCandidates(cache: CacheService): string[] {
    const config = cache.getConfig()
    const candidates = new Set<string>()

    if (config.publicBaseUrl) {
      candidates.add(config.publicBaseUrl.replace(/\/$/, ''))
    }

    const baseUrl = cache.getBaseUrl()
    if (baseUrl) {
      const publicPath = (config.publicPath || '/media-luna/cache').replace(/\/$/, '')
      candidates.add(`${baseUrl.replace(/\/$/, '')}${publicPath}`)
    }

    candidates.add((config.publicPath || '/media-luna/cache').replace(/\/$/, ''))
    return Array.from(candidates)
  }

  private resolveTargetBaseUrl(config: CachePluginConfig, cache: CacheService): string | null {
    if (config.publicBaseUrl) {
      return config.publicBaseUrl.replace(/\/$/, '')
    }

    const baseUrl = cache.getBaseUrl()
    if (!baseUrl) return null
    return `${baseUrl.replace(/\/$/, '')}${this.resolveTargetPublicPath(config)}`
  }

  private resolveTargetPublicPath(config: CachePluginConfig): string {
    return (config.publicPath || '/media-luna/cache').replace(/\/$/, '')
  }

  private parseCacheAssetUrl(url: string): { id: string; ext: string } | null {
    const matched = url.match(/\/([^/?#]+?)(\.[a-zA-Z0-9]+)(?:\?[^#]*)?$/)
    if (!matched) return null

    return {
      id: matched[1],
      ext: matched[2]
    }
  }

  private buildTargetUrl(id: string, ext: string, targetBase: string | null, targetPublicPath: string): string {
    const base = targetBase || targetPublicPath
    return `${base}/${id}${ext}`.replace(/([^:]\/)\/+/, '$1')
  }

  private async cacheFileWithPriority(cache: CacheService, file: FileData, schemeNames: Array<string | undefined>) {
    let lastError: unknown = null
    for (const schemeName of schemeNames) {
      try {
        return await cache.cache(file.data, file.mime, file.filename, undefined, {
          schemeName,
          persistent: true
        })
      } catch (error) {
        lastError = error
      }
    }
    throw lastError || new Error('cache file failed')
  }

  private async resolveProfilesForSync(options?: { uid?: number; name?: string }): Promise<CharacterProfileData[]> {
    const targetUid = options?.uid
    const targetName = options?.name?.trim()

    let profiles = targetUid !== undefined
      ? await this.listByUid(targetUid)
      : await this.listAll()

    if (targetName) {
      profiles = profiles.filter((profile) => profile.name === targetName)
      if (profiles.length === 0) {
        throw new Error(`未找到设定集「${targetName}」`)
      }
    }

    return profiles
  }

  private async reconcileReferences(demoteUnreferenced: boolean): Promise<void> {
    const cache = this.getCacheService?.()
    if (!cache) return
    try {
      await cache.repairReferences({ downloadRemote: false, demoteUnreferenced })
    } catch (error) {
      this.ctx.logger('media-luna').warn('[character-profile] Failed to reconcile reference assets: %s', error)
    }
  }

  private async listAll(): Promise<CharacterProfileData[]> {
    const records = await this.ctx.database.get('medialuna_character_profile', {})
    return records
      .map((record) => this.toData(record as MediaLunaCharacterProfile))
      .sort((a, b) => a.uid - b.uid || a.name.localeCompare(b.name, 'zh-CN'))
  }

  private matchProfiles(prompt: string, profiles: CharacterProfileData[]): CharacterProfileData[] {
    const explicitMatches = Array.from(prompt.matchAll(/@([^@\n\r]+)@/g))
    if (explicitMatches.length > 0) {
      const profileMap = new Map(
        profiles.map((profile) => [profile.name.trim(), profile] as const)
      )
      const matched: CharacterProfileData[] = []
      const seen = new Set<string>()

      for (const match of explicitMatches) {
        const rawName = match[1]?.trim()
        if (!rawName || seen.has(rawName)) continue

        const profile = profileMap.get(rawName)
        if (!profile) continue

        matched.push(profile)
        seen.add(rawName)
      }

      return matched
    }

    const sortedProfiles = [...profiles].sort((left, right) => {
      if (right.name.length !== left.name.length) {
        return right.name.length - left.name.length
      }
      return left.name.localeCompare(right.name, 'zh-CN')
    })

    const matched: CharacterProfileData[] = []
    const occupiedRanges: Array<{ start: number; end: number }> = []

    for (const profile of sortedProfiles) {
      const name = profile.name.trim()
      if (!name) continue

      let searchStart = 0
      let found = false
      while (searchStart < prompt.length) {
        const index = prompt.indexOf(name, searchStart)
        if (index === -1) break

        const end = index + name.length
        const overlaps = occupiedRanges.some((range) => !(end <= range.start || index >= range.end))
        if (!overlaps) {
          occupiedRanges.push({ start: index, end })
          matched.push(profile)
          found = true
          break
        }

        searchStart = index + 1
      }

      if (found) {
        occupiedRanges.sort((left, right) => left.start - right.start)
      }
    }

    return matched
  }
}
