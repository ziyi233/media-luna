// API 工具函数
// 提供 API 开发的辅助函数

import { Context, Logger } from 'koishi'
import type { WebuiAuthService } from '../../plugins/webui-auth'

const logger = new Logger('media-luna/api')

/**
 * 获取当前用户 uid
 * 优先级：1. @koishijs/plugin-auth 的 session  2. webui-auth 插件配置
 *
 * @param ctx Koishi Context
 * @param authSession 来自 this.auth 的认证信息
 * @returns uid 或 null
 */
export function getUidFromAuth(ctx: Context, authSession: any): number | null {
  // 优先使用 @koishijs/plugin-auth 的登录用户
  if (authSession?.id != null) {
    return authSession.id
  }

  // 其次使用 webui-auth 插件配置的 uid
  try {
    const authService = ctx.mediaLuna?.getService<WebuiAuthService>('webui-auth')
    if (authService) {
      return authService.getUid()
    }
  } catch {
    // 服务不可用，忽略
  }

  return null
}

/**
 * 创建标准错误响应
 */
export function apiError(error: unknown): { success: false; error: string } {
  const message = error instanceof Error ? error.message : 'Unknown error'
  return { success: false, error: message }
}

/**
 * 创建标准成功响应
 */
export function apiSuccess<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

/**
 * API 处理包装器 - 自动处理错误
 */
export function wrapApiHandler<TParams, TResult>(
  handler: (params: TParams) => Promise<TResult>
): (params: TParams) => Promise<{ success: true; data: TResult } | { success: false; error: string }> {
  return async (params: TParams) => {
    try {
      const result = await handler(params)
      return apiSuccess(result)
    } catch (error) {
      logger.error('API error:', error)
      return apiError(error)
    }
  }
}

/**
 * 需要认证的 API 处理包装器
 * 自动检查 uid，如果未登录则返回错误
 */
export function wrapAuthApiHandler<TParams, TResult>(
  ctx: Context,
  handler: (params: TParams, uid: number) => Promise<TResult>
): (this: any, params: TParams) => Promise<{ success: true; data: TResult } | { success: false; error: string }> {
  return async function (this: any, params: TParams) {
    try {
      const uid = getUidFromAuth(ctx, this?.auth)
      if (uid == null) {
        return { success: false, error: 'Not logged in or not bound' }
      }
      const result = await handler(params, uid)
      return apiSuccess(result)
    } catch (error) {
      logger.error('API error:', error)
      return apiError(error)
    }
  }
}
