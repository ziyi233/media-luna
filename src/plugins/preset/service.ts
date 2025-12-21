// 预设服务

import { Context } from 'koishi'
import type { PluginLogger } from '../../core'
import { createPluginLogger } from '../../core'

/** 数据库记录类型 */
interface MediaLunaPreset {
  id: number
  name: string
  displayName: string
  promptTemplate: string
  tags: string
  referenceImages: string
  /** 原始远程图片URL（JSON数组），用于重新同步对比 */
  referenceImagesRemote: string
  parameterOverrides: string
  source: 'api' | 'user'
  enabled: boolean
  remoteId?: number
  remoteUrl?: string
  /** 缓存后的缩略图URL */
  thumbnail?: string
  /** 原始远程缩略图URL，用于重新同步对比 */
  thumbnailRemote?: string
  createdAt: Date
  updatedAt: Date
}

/** 预设数据 */
export interface PresetData {
  id: number
  name: string
  promptTemplate: string
  tags: string[]
  /** 参考图片URL数组（本地缓存后为本地URL） */
  referenceImages: string[]
  /** 原始远程参考图片URL数组 */
  referenceImagesRemote?: string[]
  parameterOverrides: Record<string, any>
  source: 'api' | 'user'
  enabled: boolean
  remoteId?: number
  remoteUrl?: string
  /** 缩略图URL（本地缓存后为本地URL） */
  thumbnail?: string
  /** 原始远程缩略图URL */
  thumbnailRemote?: string
}

/**
 * 预设服务
 *
 * 管理预设的 CRUD 操作
 */
export class PresetService {
  private _ctx: Context
  private _logger: PluginLogger

  constructor(ctx: Context) {
    this._ctx = ctx
    this._logger = createPluginLogger(ctx.logger('media-luna'), 'preset')
  }

  /** 将数据库记录转换为 PresetData */
  private _toData(record: MediaLunaPreset): PresetData {
    const referenceImagesRemote = JSON.parse(record.referenceImagesRemote || '[]')
    return {
      id: record.id,
      name: record.name,
      promptTemplate: record.promptTemplate,
      tags: JSON.parse(record.tags || '[]'),
      referenceImages: JSON.parse(record.referenceImages || '[]'),
      referenceImagesRemote: referenceImagesRemote.length > 0 ? referenceImagesRemote : undefined,
      parameterOverrides: JSON.parse(record.parameterOverrides || '{}'),
      source: record.source,
      enabled: record.enabled,
      remoteId: record.remoteId,
      remoteUrl: record.remoteUrl,
      thumbnail: record.thumbnail,
      thumbnailRemote: record.thumbnailRemote
    }
  }

  /** 获取所有预设 */
  async list(): Promise<PresetData[]> {
    const records = await this._ctx.database.get('medialuna_preset', {})
    return records.map(r => this._toData(r as MediaLunaPreset))
  }

  /** 获取启用的预设 */
  async listEnabled(): Promise<PresetData[]> {
    const records = await this._ctx.database.get('medialuna_preset', { enabled: true })
    return records.map(r => this._toData(r as MediaLunaPreset))
  }

  /** 根据 ID 获取预设 */
  async getById(id: number): Promise<PresetData | null> {
    const records = await this._ctx.database.get('medialuna_preset', { id })
    return records.length > 0 ? this._toData(records[0] as MediaLunaPreset) : null
  }

  /** 根据名称获取预设 */
  async getByName(name: string): Promise<PresetData | null> {
    const records = await this._ctx.database.get('medialuna_preset', { name })
    return records.length > 0 ? this._toData(records[0] as MediaLunaPreset) : null
  }

  /** 根据远程 ID 和 URL 获取预设 */
  async getByRemoteId(remoteId: number, remoteUrl: string): Promise<PresetData | null> {
    const records = await this._ctx.database.get('medialuna_preset', { remoteId, remoteUrl })
    return records.length > 0 ? this._toData(records[0] as MediaLunaPreset) : null
  }

  /** 获取指定远程源的所有预设 */
  async listByRemoteUrl(remoteUrl: string): Promise<PresetData[]> {
    const records = await this._ctx.database.get('medialuna_preset', { remoteUrl, source: 'api' })
    return records.map(r => this._toData(r as MediaLunaPreset))
  }

  /** 根据标签获取预设（匹配任意一个标签） */
  async getByTags(tags: string[]): Promise<PresetData[]> {
    const records = await this._ctx.database.get('medialuna_preset', { enabled: true })
    return records
      .map(r => this._toData(r as MediaLunaPreset))
      .filter(p => tags.some(tag => p.tags.includes(tag)))
  }

  /** 根据标签获取预设（匹配所有标签） */
  async getByAllTags(tags: string[]): Promise<PresetData[]> {
    const records = await this._ctx.database.get('medialuna_preset', { enabled: true })
    return records
      .map(r => this._toData(r as MediaLunaPreset))
      .filter(p => tags.every(tag => p.tags.includes(tag)))
  }

  /** 获取所有唯一标签 */
  async getAllTags(): Promise<string[]> {
    const records = await this._ctx.database.get('medialuna_preset', {})
    const tagSet = new Set<string>()
    for (const record of records) {
      const tags: string[] = JSON.parse((record as MediaLunaPreset).tags || '[]')
      tags.forEach(tag => tagSet.add(tag))
    }
    return Array.from(tagSet).sort()
  }

  /** 根据渠道标签获取匹配的预设 */
  async getMatchingPresets(channelTags: string[]): Promise<PresetData[]> {
    if (channelTags.length === 0) {
      return this.listEnabled()
    }
    return this.getByTags(channelTags)
  }

  /** 生成唯一名称 */
  private async _generateUniqueName(baseName: string, excludeId?: number): Promise<string> {
    let name = baseName
    let counter = 1

    while (true) {
      const existing = await this.getByName(name)
      if (!existing || existing.id === excludeId) {
        return name
      }
      counter++
      name = `${baseName}-${counter}`
    }
  }

  /** 创建预设 */
  async create(data: Omit<PresetData, 'id'>): Promise<PresetData> {
    const now = new Date()
    const uniqueName = await this._generateUniqueName(data.name)

    const record = await this._ctx.database.create('medialuna_preset', {
      name: uniqueName,
      displayName: uniqueName,
      promptTemplate: data.promptTemplate,
      tags: JSON.stringify(data.tags),
      referenceImages: JSON.stringify(data.referenceImages),
      referenceImagesRemote: JSON.stringify(data.referenceImagesRemote || []),
      parameterOverrides: JSON.stringify(data.parameterOverrides),
      source: data.source,
      enabled: data.enabled,
      remoteId: data.remoteId,
      remoteUrl: data.remoteUrl,
      thumbnail: data.thumbnail,
      thumbnailRemote: data.thumbnailRemote,
      createdAt: now,
      updatedAt: now
    })

    return this._toData(record as MediaLunaPreset)
  }

  /** 更新预设 */
  async update(id: number, data: Partial<Omit<PresetData, 'id'>>): Promise<PresetData | null> {
    const existing = await this.getById(id)
    if (!existing) return null

    const updateData: any = {
      updatedAt: new Date()
    }

    if (data.name !== undefined) {
      const uniqueName = await this._generateUniqueName(data.name, id)
      updateData.name = uniqueName
      updateData.displayName = uniqueName
    }
    if (data.promptTemplate !== undefined) updateData.promptTemplate = data.promptTemplate
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags)
    if (data.referenceImages !== undefined) updateData.referenceImages = JSON.stringify(data.referenceImages)
    if (data.referenceImagesRemote !== undefined) updateData.referenceImagesRemote = JSON.stringify(data.referenceImagesRemote)
    if (data.parameterOverrides !== undefined) updateData.parameterOverrides = JSON.stringify(data.parameterOverrides)
    if (data.source !== undefined) updateData.source = data.source
    if (data.enabled !== undefined) updateData.enabled = data.enabled
    if (data.remoteId !== undefined) updateData.remoteId = data.remoteId
    if (data.remoteUrl !== undefined) updateData.remoteUrl = data.remoteUrl
    if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail
    if (data.thumbnailRemote !== undefined) updateData.thumbnailRemote = data.thumbnailRemote

    await this._ctx.database.set('medialuna_preset', { id }, updateData)

    return this.getById(id)
  }

  /** 删除预设 */
  async delete(id: number): Promise<boolean> {
    const existing = await this.getById(id)
    if (!existing) return false

    await this._ctx.database.remove('medialuna_preset', { id })
    return true
  }

  /** 删除所有远程同步的预设 */
  async deleteAllRemote(): Promise<number> {
    const remotePresets = await this._ctx.database.get('medialuna_preset', { source: 'api' })
    if (remotePresets.length === 0) return 0

    await this._ctx.database.remove('medialuna_preset', { source: 'api' })
    return remotePresets.length
  }

  /** 批量导入预设 */
  async bulkUpsert(presets: Array<Omit<PresetData, 'id'>>, source: 'api' | 'user' = 'api'): Promise<number> {
    let count = 0
    for (const preset of presets) {
      const existing = await this.getByName(preset.name)
      if (existing) {
        if (existing.source === 'api') {
          await this.update(existing.id, { ...preset, source })
          count++
        }
      } else {
        await this.create({ ...preset, source })
        count++
      }
    }
    return count
  }
}
