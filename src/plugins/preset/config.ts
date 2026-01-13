// 预设插件配置字段定义

import type { ConfigField } from '../../core'

/** 预设中间件配置 */
export interface PresetMiddlewareConfig {
  /** 默认预设名称 */
  defaultPreset?: string
  /** 是否启用 */
  enabled?: boolean
}

/** 远程同步配置 */
export interface RemoteSyncConfig {
  /** 远程 API URL */
  apiUrl: string
  /** 上传 URL */
  uploadUrl: string
  /** 默认作者名 */
  defaultAuthor: string
  /** 是否启用自动同步 */
  autoSync: boolean
  /** 自动同步间隔（分钟） */
  syncInterval: number
  /** 同步时是否删除远程已移除的预设 */
  deleteRemoved: boolean
  /** 缩略图下载延迟（毫秒），用于限流 */
  thumbnailDelay: number
  /** 上次同步的 ETag（用于 304 缓存） */
  lastETag?: string
  /** 上次同步时间 */
  lastSyncTime?: string
}

/** 预设插件完整配置 */
export interface PresetPluginConfig extends PresetMiddlewareConfig, RemoteSyncConfig {}

/** 预设中间件配置字段 */
export const presetMiddlewareConfigFields: ConfigField[] = [
  {
    key: 'enabled',
    label: '启用预设处理',
    type: 'boolean',
    default: true,
    description: '是否启用预设中间件'
  },
  {
    key: 'defaultPreset',
    label: '默认预设',
    type: 'text',
    placeholder: '留空则不使用默认预设',
    description: '当用户未指定预设时使用的默认预设名称'
  }
]

/** 远程同步配置字段 */
export const remoteSyncConfigFields: ConfigField[] = [
  {
    key: 'apiUrl',
    label: '在线预设api地址',
    type: 'text',
    default: 'https://prompt.vioaki.xyz/api/templates?per_page=-1',
    placeholder: 'https://prompt.vioaki.xyz/api/templates?per_page=-1',
    description: '项目地址：https://github.com/vioaki/Prompt-Manager'
  },
  {
    key: 'uploadUrl',
    label: '上传地址',
    type: 'text',
    default: 'https://prompt.vioaki.xyz/api/upload',
    placeholder: 'https://prompt.vioaki.xyz/api/upload',
    description: '上传作品/模板的地址，留空则禁用上传功能'
  },
  {
    key: 'defaultAuthor',
    label: '默认作者名',
    type: 'text',
    default: '',
    placeholder: '匿名',
    description: '上传时使用的默认作者名，留空则显示为匿名'
  },
  {
    key: 'autoSync',
    label: '自动同步',
    type: 'boolean',
    default: false,
    description: '启用后将定期从远程同步预设'
  },
  {
    key: 'syncInterval',
    label: '同步间隔',
    type: 'number',
    default: 60,
    description: '自动同步间隔（分钟）',
    showWhen: { field: 'autoSync', value: true }
  },
  {
    key: 'deleteRemoved',
    label: '删除已移除',
    type: 'boolean',
    default: false,
    description: '同步时删除远程已移除的预设'
  },
  {
    key: 'thumbnailDelay',
    label: '下载限流',
    type: 'number',
    default: 100,
    description: '缩略图下载间隔（毫秒），避免对远程服务器造成压力，0 表示不限制'
  }
]

/** 全部配置字段 */
export const presetConfigFields: ConfigField[] = [
  ...presetMiddlewareConfigFields,
  ...remoteSyncConfigFields
]

/** 默认配置 */
export const defaultPresetConfig: PresetPluginConfig = {
  enabled: true,
  defaultPreset: '',
  apiUrl: 'https://prompt.vioaki.xyz/api/templates?per_page=-1',
  uploadUrl: 'https://prompt.vioaki.xyz/api/upload',
  defaultAuthor: '',
  autoSync: false,
  syncInterval: 60,
  deleteRemoved: false,
  thumbnailDelay: 100
}
