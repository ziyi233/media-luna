// 计费服务
// 提供余额查询和其他计费相关功能的公共 API

import { Context, Session } from 'koishi'
import type { BillingConfig } from './config'
import type { PluginContext } from '../../core'

/**
 * 计费服务
 * 提供余额查询、用户 ID 解析等功能
 */
export class BillingService {
  private _ctx: Context
  private _getConfig: () => BillingConfig

  constructor(pluginCtx: PluginContext) {
    this._ctx = pluginCtx.ctx
    this._getConfig = () => pluginCtx.getConfig<BillingConfig>()
  }

  /**
   * 获取用户余额
   * @param userId Koishi user.id (aid)
   * @param currencyValue 货币类型（可选，默认使用配置中的值）
   */
  async getBalance(userId: number, currencyValue?: string): Promise<number> {
    const config = this._getConfig()
    const currency = currencyValue ?? config.currencyValue ?? 'default'

    if (!config.tableName || !config.userIdField || !config.balanceField) {
      throw new Error('计费配置不完整')
    }

    const condition = this._buildQueryCondition(config, userId, currency)

    try {
      const rows = await this._ctx.database.get(config.tableName as any, condition)
      if (rows.length === 0) return 0
      return Number((rows[0] as any)[config.balanceField]) || 0
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      if (errMsg.includes('cannot resolve table')) {
        throw new Error(`表 "${config.tableName}" 未被声明`)
      }
      throw new Error(`查询余额失败: ${errMsg}`)
    }
  }

  /**
   * 从 Session 解析用户 ID
   * @param session Koishi Session
   */
  async resolveUserIdFromSession(session: Session): Promise<number | null> {
    try {
      const bindings = await this._ctx.database.get('binding', {
        platform: session.platform,
        pid: session.userId
      })
      return bindings[0]?.aid ?? null
    } catch {
      return null
    }
  }

  /**
   * 获取用户余额（通过 Session）
   * @param session Koishi Session
   * @param currencyValue 货币类型（可选）
   */
  async getBalanceBySession(session: Session, currencyValue?: string): Promise<{ balance: number; userId: number } | null> {
    const userId = await this.resolveUserIdFromSession(session)
    if (userId == null) return null

    const balance = await this.getBalance(userId, currencyValue)
    return { balance, userId }
  }

  /**
   * 获取配置
   */
  getConfig(): BillingConfig {
    return this._getConfig()
  }

  /**
   * 获取货币显示名称
   */
  getCurrencyLabel(): string {
    return this._getConfig().currencyLabel || '积分'
  }

  private _buildQueryCondition(
    config: BillingConfig,
    userId: number | string,
    currencyValue: string
  ): Record<string, any> {
    const condition: Record<string, any> = {
      [config.userIdField]: userId
    }

    if (config.currencyField) {
      condition[config.currencyField] = currencyValue
    }

    return condition
  }
}
