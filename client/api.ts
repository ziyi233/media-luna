import { send, socket } from '@koishijs/client'
import type {
  ChannelConfig,
  PresetData,
  TaskData,
  TaskStats,
  ConnectorDefinition,
  ConfigField,
  GenerationResult,
  ClientFileData,
  MiddlewareInfo,
  CardFieldsResponse,
  PaginatedResponse,
  ApiResponse,
  SettingsPanelInfo,
  PluginInfo,
  GalleryItem,
  GalleryResponse,
  RecentImage,
  CacheFileInfo,
  CacheStats,
  ExternalPluginInfo,
  CurrentUser
} from './types'

// 重新导出类型，方便使用
export type {
  GalleryItem,
  GalleryResponse,
  RecentImage,
  CacheFileInfo,
  CacheStats,
  SettingsPanelInfo,
  PluginInfo,
  ExternalPluginInfo,
  CurrentUser
}

// 支持自定义超时的 send 函数
// @koishijs/client 的 send 默认超时 60 秒，对于生成任务不够用
const responseHooks: Record<string, [(value: any) => void, (reason: any) => void]> = {}

// 监听响应消息
let listenerInitialized = false
function initResponseListener() {
  if (listenerInitialized || !socket.value) return
  listenerInitialized = true
  socket.value.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data)
      if (data.type === 'response' && data.body) {
        const { id, value, error } = data.body
        if (responseHooks[id]) {
          const [resolve, reject] = responseHooks[id]
          delete responseHooks[id]
          if (error) {
            reject(error)
          } else {
            resolve(value)
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  })
}

function sendWithTimeout(type: string, args: any[], timeoutMs: number): Promise<any> {
  if (!socket.value) return Promise.reject(new Error('WebSocket not connected'))
  initResponseListener()

  const id = Math.random().toString(36).slice(2, 9)
  socket.value.send(JSON.stringify({ id, type, args: [args] }))

  return new Promise((resolve, reject) => {
    responseHooks[id] = [resolve, reject]
    setTimeout(() => {
      if (responseHooks[id]) {
        delete responseHooks[id]
        reject(new Error('timeout'))
      }
    }, timeoutMs)
  })
}

// 通用调用封装
async function call<T>(event: keyof any, params?: any): Promise<T> {
  // @ts-ignore
  const result = await send(event, params) as ApiResponse<T>
  if (!result.success) {
    throw new Error(result.error || '请求失败')
  }
  // @ts-ignore
  return result.data
}

// 支持自定义超时的调用封装
async function callWithTimeout<T>(event: string, params: any, timeoutMs: number): Promise<T> {
  const result = await sendWithTimeout(event, params, timeoutMs) as ApiResponse<T>
  if (!result.success) {
    throw new Error(result.error || '请求失败')
  }
  // @ts-ignore
  return result.data
}

// 渠道 API
export const channelApi = {
  list: () => call<ChannelConfig[]>('media-luna/channels/list'),
  listEnabled: () => call<ChannelConfig[]>('media-luna/channels/list-enabled'),
  get: (id: number) => call<ChannelConfig>('media-luna/channels/get', { id }),
  create: (data: Omit<ChannelConfig, 'id'>) => call<ChannelConfig>('media-luna/channels/create', data),
  update: (id: number, data: Partial<ChannelConfig>) => call<ChannelConfig>('media-luna/channels/update', { id, data }),
  delete: (id: number) => call<void>('media-luna/channels/delete', { id }),
  toggle: (id: number, enabled: boolean) => call<void>('media-luna/channels/toggle', { id, enabled }),
  tags: () => call<string[]>('media-luna/channels/tags'),
  getByTags: (tags: string[], matchAll?: boolean) => call<ChannelConfig[]>('media-luna/channels/by-tags', { tags, matchAll })
}

// 预设 API
export const presetApi = {
  list: (enabledOnly?: boolean) => call<PresetData[]>('media-luna/presets/list', { enabledOnly }),
  get: (id: number) => call<PresetData>('media-luna/presets/get', { id }),
  create: (data: Omit<PresetData, 'id'>) => call<PresetData>('media-luna/presets/create', data),
  update: (id: number, data: Partial<PresetData>) => call<PresetData>('media-luna/presets/update', { id, data }),
  delete: (id: number) => call<void>('media-luna/presets/delete', { id }),
  toggle: (id: number, enabled: boolean) => call<void>('media-luna/presets/toggle', { id, enabled }),
  copy: (id: number) => call<PresetData>('media-luna/presets/copy', { id }),
  matching: (channelId: number) => call<PresetData[]>('media-luna/presets/matching', { channelId }),
  tags: () => call<string[]>('media-luna/presets/tags'),
  getByTags: (tags: string[], matchAll?: boolean) => call<PresetData[]>('media-luna/presets/by-tags', { tags, matchAll }),
  // 上传相关
  getUploadConfig: () => call<{ uploadUrl: string, defaultAuthor: string, enabled: boolean }>('media-luna/presets/upload-config'),
  upload: (data: {
    title: string
    prompt: string
    imageUrl?: string
    category?: 'gallery' | 'template'
    type?: 'txt2img' | 'img2img'
    author?: string
    description?: string
    tags?: string[]
    referenceImages?: Array<{ url?: string; isPlaceholder?: boolean }>
  }) => call<{ pending?: boolean, message: string }>('media-luna/presets/upload', data),
  uploadTask: (data: {
    taskId: number
    assetIndex?: number
    title: string
    category?: 'gallery' | 'template'
    author?: string
    description?: string
    tags?: string[]
  }) => call<{ pending?: boolean, message: string }>('media-luna/presets/upload-task', data)
}

// 任务 API
export const taskApi = {
  list: (params?: { uid?: number, channelId?: number, status?: string, startDate?: string, limit?: number, offset?: number }) =>
    call<PaginatedResponse<TaskData>>('media-luna/tasks/list', params),
  get: (id: number) => call<TaskData>('media-luna/tasks/get', { id }),
  delete: (id: number) => call<void>('media-luna/tasks/delete', { id }),
  stats: (params?: { channelId?: number, startDate?: string }) => call<TaskStats>('media-luna/tasks/stats', params),
  cleanup: (days?: number) => call<{ deleted: number, beforeDate: string }>('media-luna/tasks/cleanup', { days }),
  deleteByStatus: (status: string) => call<{ deleted: number, status: string }>('media-luna/tasks/delete-by-status', { status }),
  recent: (userId: number, limit?: number) => call<TaskData[]>('media-luna/tasks/recent', { userId, limit }),
  /** 获取当前用户的任务列表 */
  my: (params?: { channelId?: number, status?: string, limit?: number, offset?: number }) =>
    call<PaginatedResponse<TaskData>>('media-luna/tasks/my', params)
}

// 用户 API
export const userApi = {
  /** 批量获取用户信息（通过 binding 表和 bot 从平台获取头像和用户名） */
  batch: (uids: number[]) =>
    call<Record<number, { name?: string; avatar?: string; platform?: string }>>('media-luna/users/batch', { uids })
}

// 画廊 API
export const galleryApi = {
  /** 获取当前用户的生成画廊 */
  my: (params?: { limit?: number, offset?: number, channelId?: number }) =>
    call<GalleryResponse>('media-luna/gallery/my', params),
  /** 获取当前用户最近生成的图片 */
  recentImages: (limit?: number) =>
    call<RecentImage[]>('media-luna/gallery/recent-images', { limit }),
  /** 获取指定用户的画廊（管理员） */
  user: (params: { uid: number, limit?: number, offset?: number, channelId?: number }) =>
    call<GalleryResponse>('media-luna/gallery/user', params)
}

// 认证 API
export const authApi = {
  /** 获取当前登录用户信息 */
  me: () => call<{ loggedIn: boolean, source?: string, uid?: number, name?: string, authority?: number }>('media-luna/auth/me')
}

// 中间件 API
export const middlewareApi = {
  list: () => call<MiddlewareInfo[]>('media-luna/middlewares/list'),
  get: (name: string) => call<MiddlewareInfo>('media-luna/middlewares/get', { name }),
  update: (name: string, data: { enabled?: boolean, config?: any }) => call<void>('media-luna/middlewares/update', { name, data }),
  reset: (name: string) => call<void>('media-luna/middlewares/reset', { name }),
  executionOrder: () => call<any[]>('media-luna/middlewares/execution-order'),
  /** 获取中间件注册的卡片展示字段 */
  cardFields: () => call<CardFieldsResponse>('media-luna/middlewares/card-fields')
}

// 连接器 API
export const connectorApi = {
  list: () => call<ConnectorDefinition[]>('media-luna/connectors/list'),
  get: (id: string) => call<ConnectorDefinition>('media-luna/connectors/get', { id }),
  fields: (id: string) => call<ConfigField[]>('media-luna/connectors/fields', { id }),
  schema: () => call<any[]>('media-luna/connectors/schema')
}

// 生成 API
// 生成任务使用 10 分钟超时（600000ms），因为某些连接器（如 chat-api）可能需要较长时间
const GENERATE_TIMEOUT = 10 * 60 * 1000

export const generateApi = {
  generate: (params: { channelId: number, prompt: string, files?: ClientFileData[], parameters?: any, userId?: number }) =>
    callWithTimeout<GenerationResult>('media-luna/generate', params, GENERATE_TIMEOUT),
  preview: (params: { channelId: number, prompt: string, parameters?: any }) =>
    call<{ channelName: string, connectorId: string, finalPrompt: string, parameters: any }>('media-luna/generate/preview', params)
}

// 缓存 API
export const cacheApi = {
  /** 上传文件到缓存 */
  upload: (data: string, mime: string, filename?: string, persistent = false) =>
    call<CacheFileInfo>('media-luna/cache/upload', { data, mime, filename, persistent }),
  /** 从 URL 下载并缓存 */
  cacheUrl: (url: string, persistent = false) =>
    call<CacheFileInfo>('media-luna/cache/cache-url', { url, persistent }),
  /** 获取缓存文件信息 */
  get: (id: string) =>
    call<CacheFileInfo>('media-luna/cache/get', { id }),
  /** 读取缓存文件内容（返回 data URL） */
  read: (id: string) =>
    call<string>('media-luna/cache/read', { id }),
  /** 删除缓存文件 */
  delete: (id: string) =>
    call<void>('media-luna/cache/delete', { id }),
  /** 获取缓存统计信息 */
  stats: () =>
    call<CacheStats>('media-luna/cache/stats'),
  /** 清空所有缓存 */
  clear: () =>
    call<void>('media-luna/cache/clear'),
  /** 修复人物设定和预设的持久引用 */
  repairReferences: () =>
    call<{ protected: number, moved: number, reindexed: number, rewritten: number, redownloaded: number, unrecoverable: string[], message: string }>('media-luna/cache/repair-references'),
  /** 扫描临时缓存目录中的孤儿文件 */
  scanOrphans: () =>
    call<{ count: number, totalSize: number, files: string[], message: string }>('media-luna/cache/scan-orphans'),
  /** 测试存储连接 */
  test: () =>
    call<{ backend: string, url?: string, duration?: number, message: string }>('media-luna/cache/test')
}

// 设置面板 API
export const settingsApi = {
  /** 获取所有设置面板 */
  panels: () =>
    call<SettingsPanelInfo[]>('media-luna/settings/panels'),
  /** 获取单个设置面板 */
  get: (id: string) =>
    call<SettingsPanelInfo>('media-luna/settings/get', { id }),
  /** 更新设置面板配置（仅 custom 类型） */
  update: (id: string, config: Record<string, any>) =>
    call<void>('media-luna/settings/update', { id, config }),
  /** 手动触发远程预设同步（通过 preset 插件 API） */
  syncRemotePresets: () =>
    call<{ added: number, updated: number, removed: number }>('media-luna/presets/sync')
}

// 设置向导 API
export const setupApi = {
  /** 获取设置状态 */
  status: () =>
    call<{
      needsSetup: boolean
      storageConfigured: boolean
      userBound: boolean
      storageBackend: string
      boundUid: number | null
    }>('media-luna/setup/status'),
  /** 获取存储配置字段定义 */
  getStorageFields: () =>
    call<ConfigField[]>('media-luna/setup/storage/fields'),
  /** 获取当前存储配置 */
  getStorageConfig: () =>
    call<Record<string, any>>('media-luna/setup/storage/get'),
  /** 更新存储配置 */
  updateStorageConfig: (config: Record<string, any>) =>
    call<void>('media-luna/setup/storage/update', config),
  /** 生成验证码 */
  generateVerifyCode: (uid: number) =>
    call<{ code: string, expiresIn: number, uid: number }>('media-luna/setup/verify-code/generate', { uid }),
  /** 验证验证码 */
  verifyCode: (code: string, uid: number) =>
    call<{ uid: number }>('media-luna/setup/verify-code/verify', { code, uid }),
  /** 直接绑定 UID */
  bindUid: (uid: number) =>
    call<{ uid: number }>('media-luna/setup/bind-uid', { uid }),
  /** 获取可用用户列表 */
  getUsers: () =>
    call<Array<{ id: number, name: string, authority: number }>>('media-luna/setup/users'),
  /** 完成设置 */
  complete: () =>
    call<void>('media-luna/setup/complete')
}

// 插件 API
export const pluginApi = {
  /** 获取所有已加载插件 */
  list: () =>
    call<PluginInfo[]>('media-luna/plugins/list'),
  /** 获取单个插件信息 */
  get: (id: string) =>
    call<PluginInfo>('media-luna/plugins/get', { id }),
  /** 更新插件配置 */
  updateConfig: (pluginId: string, config: Record<string, any>) =>
    call<void>('media-luna/plugins/update-config', { pluginId, config }),
  /** 启用插件 */
  enable: (id: string) =>
    call<void>('media-luna/plugins/enable', { id }),
  /** 禁用插件 */
  disable: (id: string) =>
    call<void>('media-luna/plugins/disable', { id }),

  // ============ 外部插件管理 ============

  /** 获取已加载的外部插件列表 */
  externalList: () =>
    call<ExternalPluginInfo[]>('media-luna/plugins/external/list'),
  /** 添加外部插件 */
  externalAdd: (moduleName: string) =>
    call<void>('media-luna/plugins/external/add', { moduleName }),
  /** 移除外部插件 */
  externalRemove: (moduleName: string) =>
    call<void>('media-luna/plugins/external/remove', { moduleName })
}

// 版本 API
export const versionApi = {
  /** 检查版本更新 */
  check: () =>
    call<{
      current: string
      latest: string
      hasUpdate: boolean
      packageName: string
      npmUrl: string
    }>('media-luna/version/check')
}
