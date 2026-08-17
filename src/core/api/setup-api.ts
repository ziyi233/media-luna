// 设置向导 API
// 提供首次使用时的配置向导功能

import { Context, Logger } from 'koishi'
import type { WebuiAuthService } from '../../plugins/webui-auth'
import type { CachePluginConfig } from '../../plugins/cache'
import { getUidFromAuth } from './api-utils'

const logger = new Logger('media-luna/setup-api')

/** 设置状态响应 */
interface SetupStatus {
  /** 是否需要设置向导 */
  needsSetup: boolean
  /** 存储是否已配置 */
  storageConfigured: boolean
  /** 用户是否已绑定 */
  userBound: boolean
  /** 当前存储后端 */
  storageBackend: string
  /** 当前绑定的 uid */
  boundUid: number | null
}

/** 验证码信息 */
interface VerifyCodeInfo {
  code: string
  expiresIn: number
  uid: number
}

/**
 * 注册设置向导 API
 */
export function registerSetupApi(ctx: Context): void {
  const console = ctx.console as any

  // 获取设置状态
  console.addListener('media-luna/setup/status', async function (this: any) {
    try {
      // 检查 mediaLuna 服务是否就绪
      if (!ctx.mediaLuna?.pluginLoader) {
        return { success: false, error: 'MediaLuna service not ready' }
      }

      // 获取存储配置
      const cacheConfig = ctx.mediaLuna.pluginLoader.getPluginConfig('cache') as CachePluginConfig | undefined
      const storageBackend = cacheConfig?.backend || 'local'
      const storageConfigured = storageBackend !== 'none'

      // 获取用户绑定状态
      // 优先检查 @koishijs/plugin-auth
      let boundUid: number | null = null
      let userBound = false

      // 检查当前请求的 auth
      if (this?.auth?.id != null) {
        boundUid = this.auth.id
        userBound = true
      } else {
        // 检查 webui-auth 插件
        try {
          const authService = ctx.mediaLuna.getService<WebuiAuthService>('webui-auth')
          if (authService) {
            boundUid = authService.getUid()
            userBound = boundUid !== null
          }
        } catch {
          // 服务不可用
        }
      }

      const status: SetupStatus = {
        needsSetup: !storageConfigured || !userBound,
        storageConfigured,
        userBound,
        storageBackend,
        boundUid
      }

      return { success: true, data: status }
    } catch (error) {
      logger.error('Failed to get setup status:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取存储配置字段定义
  console.addListener('media-luna/setup/storage/fields', async () => {
    try {
      if (!ctx.mediaLuna?.getPluginInfos) {
        return { success: false, error: 'MediaLuna service not ready' }
      }
      // 从 cache 插件获取配置字段定义
      const pluginInfo = ctx.mediaLuna.getPluginInfos().find(p => p.id === 'cache')
      if (!pluginInfo) {
        return { success: false, error: 'Cache plugin not found' }
      }
      return { success: true, data: pluginInfo.configFields || [] }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取当前存储配置
  console.addListener('media-luna/setup/storage/get', async () => {
    try {
      if (!ctx.mediaLuna?.pluginLoader) {
        return { success: false, error: 'MediaLuna service not ready' }
      }
      const config = ctx.mediaLuna.pluginLoader.getPluginConfig('cache') as CachePluginConfig | undefined
      return { success: true, data: config || {} }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 更新存储配置
  console.addListener('media-luna/setup/storage/update', async (options: Record<string, any>) => {
    try {
      if (!ctx.mediaLuna?.pluginLoader) {
        return { success: false, error: 'MediaLuna service not ready' }
      }

      // 验证必要字段
      if (!options.backend) {
        return { success: false, error: 'Storage backend is required' }
      }

      // 根据后端类型验证配置
      if (options.backend === 's3') {
        if (!options.s3Endpoint || !options.s3AccessKeyId || !options.s3SecretAccessKey || !options.s3Bucket) {
          return { success: false, error: 'S3 configuration is incomplete' }
        }
      } else if (options.backend === 'webdav') {
        if (!options.webdavEndpoint || !options.webdavUsername || !options.webdavPassword) {
          return { success: false, error: 'WebDAV configuration is incomplete' }
        }
      }

      // 更新插件配置
      ctx.mediaLuna.pluginLoader.updatePluginConfig('cache', options)

      logger.info('Storage configuration updated: backend=%s', options.backend)
      return { success: true }
    } catch (error) {
      logger.error('Failed to update storage config:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 生成验证码（WebUI 发起绑定）
  console.addListener('media-luna/setup/verify-code/generate', async ({ uid }: { uid: number }) => {
    try {
      if (!ctx.mediaLuna?.getService || !ctx.mediaLuna?.pluginLoader) {
        return { success: false, error: 'MediaLuna service not ready' }
      }

      if (!Number.isInteger(uid) || uid < 0) {
        return { success: false, error: 'Valid uid is required' }
      }

      const authService = ctx.mediaLuna.getService<WebuiAuthService>('webui-auth')
      if (!authService) {
        return { success: false, error: 'WebUI auth service not available' }
      }

      // 生成验证码
      const code = authService.createBindCode(uid)
      const config = ctx.mediaLuna.pluginLoader.getPluginConfig('webui-auth') as { codeExpiry?: number } | undefined
      const expiresIn = config?.codeExpiry || 300

      const info: VerifyCodeInfo = {
        code,
        expiresIn,
        uid
      }

      return { success: true, data: info }
    } catch (error) {
      logger.error('Failed to generate verify code:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 验证验证码（用户在聊天平台输入后确认）
  console.addListener('media-luna/setup/verify-code/verify', async ({ code, uid }: { code: string, uid: number }) => {
    try {
      if (!ctx.mediaLuna?.getService) {
        return { success: false, error: 'MediaLuna service not ready' }
      }

      const authService = ctx.mediaLuna.getService<WebuiAuthService>('webui-auth')
      if (!authService) {
        return { success: false, error: 'WebUI auth service not available' }
      }

      const result = authService.verifyCodeAndBind(code, uid)
      if (result.success) {
        logger.info('User bound via setup wizard: uid=%d', uid)
      }
      return result.success
        ? { success: true, data: { uid } }
        : { success: false, error: result.error }
    } catch (error) {
      logger.error('Failed to verify code:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 直接绑定 UID（跳过验证码，管理员操作）
  console.addListener('media-luna/setup/bind-uid', async ({ uid }: { uid: number }) => {
    try {
      if (!ctx.mediaLuna?.getService) {
        return { success: false, error: 'MediaLuna service not ready' }
      }

      if (!Number.isInteger(uid) || uid < 0) {
        return { success: false, error: 'Valid uid is required' }
      }

      const authService = ctx.mediaLuna.getService<WebuiAuthService>('webui-auth')
      if (!authService) {
        return { success: false, error: 'WebUI auth service not available' }
      }

      authService.setUid(uid)
      logger.info('User bound directly via setup wizard: uid=%d', uid)

      return { success: true, data: { uid } }
    } catch (error) {
      logger.error('Failed to bind uid:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 获取可用的 Koishi 用户列表（用于直接绑定）
  console.addListener('media-luna/setup/users', async () => {
    try {
      // 从数据库获取用户列表
      const users = await ctx.database.get('user', {}, ['id', 'name', 'authority'])
      return {
        success: true,
        data: users.map(u => ({
          id: u.id,
          name: u.name || `用户 ${u.id}`,
          authority: u.authority || 0
        }))
      }
    } catch (error) {
      logger.error('Failed to get users:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 完成设置（标记设置完成）
  console.addListener('media-luna/setup/complete', async () => {
    try {
      // 这里可以保存一个标记表示设置已完成
      // 目前通过检查存储和用户绑定状态来判断
      logger.info('Setup wizard completed')
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}
