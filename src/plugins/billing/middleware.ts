// 计费中间件

import { Context } from 'koishi'
import type {
  MiddlewareDefinition,
  MiddlewareContext,
  MiddlewareRunStatus
} from '../../core'
import type { BillingConfig } from './config'
import { billingCardFields, defaultBillingConfig } from './config'

// Store keys for passing data between prepare and finalize phases
const STORE_KEY = 'billing:charged'
const STORE_AMOUNT_KEY = 'billing:amount'
const STORE_USER_KEY = 'billing:userId'
const STORE_CURRENCY_KEY = 'billing:currencyValue'

/**
 * 渲染消息模板
 * 支持变量: {cost}, {balance}, {label}, {error}
 */
function renderTemplate(
  template: string,
  vars: { cost?: number; balance?: number | null; label?: string; error?: string }
): string {
  let result = template
  if (vars.cost !== undefined) {
    result = result.replace(/\{cost\}/g, String(vars.cost))
  }
  if (vars.balance !== undefined && vars.balance !== null) {
    result = result.replace(/\{balance\}/g, String(vars.balance))
  } else {
    // 如果余额为 null，移除包含 {balance} 的部分（如 "，余额 {balance} {label}"）
    result = result.replace(/[，,]?\s*余额\s*\{balance\}\s*\{label\}/g, '')
  }
  if (vars.label !== undefined) {
    result = result.replace(/\{label\}/g, vars.label)
  }
  if (vars.error !== undefined) {
    result = result.replace(/\{error\}/g, vars.error)
  }
  return result
}

/**
 * 获取消息模板（带默认值回退）
 */
function getMessageTemplate(config: BillingConfig | null, key: keyof BillingConfig): string {
  const value = config?.[key]
  if (typeof value === 'string' && value.trim()) {
    return value
  }
  // 回退到默认值
  return (defaultBillingConfig as any)[key] || ''
}

/** 获取用户 ID（通过 Koishi binding 表查询） */
async function resolveUserId(
  ctx: Context,
  context: MiddlewareContext
): Promise<number | null> {
  // 优先使用 context.uid（来自生成请求）
  if (context.uid) {
    return context.uid
  }

  // 否则从 session 解析
  if (!context.session) return null

  try {
    const bindings = await ctx.database.get('binding', {
      platform: context.session.platform,
      pid: context.session.userId
    })
    return bindings[0]?.aid ?? null
  } catch {
    return null
  }
}

/** 构建查询条件 */
function buildQueryCondition(
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

/** 查询用户余额 */
async function getBalance(
  ctx: Context,
  config: BillingConfig,
  userId: number | string,
  currencyValue: string
): Promise<number> {
  const logger = ctx.logger('media-luna')
  try {
    const condition = buildQueryCondition(config, userId, currencyValue)
    logger.info('[billing] getBalance query: table=%s, condition=%o', config.tableName, condition)

    const rows = await ctx.database.get(config.tableName as any, condition)
    logger.info('[billing] getBalance result: rows=%o', rows)

    if (rows.length === 0) return 0
    return Number((rows[0] as any)[config.balanceField]) || 0
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    logger.error('[billing] getBalance error: %s', errMsg)
    if (errMsg.includes('cannot resolve table')) {
      throw new Error(`表 "${config.tableName}" 未被声明。请确保已安装并启用声明该表的插件（如 koishi-plugin-monetary）`)
    }
    throw new Error(`查询余额失败: ${errMsg}`)
  }
}

/** 更新用户余额 */
async function updateBalance(
  ctx: Context,
  config: BillingConfig,
  userId: number | string,
  delta: number,
  currencyValue: string
): Promise<void> {
  try {
    const condition = buildQueryCondition(config, userId, currencyValue)
    const balanceField = config.balanceField

    await ctx.database.set(config.tableName as any, condition, (row: any) => ({
      [balanceField]: { $add: [row[balanceField], delta] }
    }))
  } catch (e) {
    throw new Error(`更新余额失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * 创建预扣费中间件
 * 在 lifecycle-prepare 阶段检查余额并扣费
 */
export function createBillingPrepareMiddleware(): MiddlewareDefinition {
  return {
    name: 'billing-prepare',
    displayName: '预扣费',
    description: '在生成前检查余额并扣费',
    category: 'billing',
    phase: 'lifecycle-prepare',
    configGroup: 'billing',
    cardFields: billingCardFields,

    async execute(context: MiddlewareContext, next): Promise<MiddlewareRunStatus> {
      const config = await context.getMiddlewareConfig<BillingConfig>('billing')
      const logger = context.ctx.logger('media-luna')

      // 调试日志：打印读取到的配置
      logger.info('[billing-prepare] config: %o', {
        tableName: config?.tableName,
        userIdField: config?.userIdField,
        balanceField: config?.balanceField,
        currencyField: config?.currencyField,
        currencyValue: config?.currencyValue,
        currencyLabel: config?.currencyLabel,
        cost: config?.cost
      })

      // 获取费用（已由 getMiddlewareConfig 合并渠道覆盖）
      const cost = config?.cost ?? 0

      // cost = 0 表示免费渠道，跳过计费检查
      if (cost <= 0) {
        context.setMiddlewareLog('billing-prepare', { skipped: true, reason: 'free channel', cost })
        return next()
      }

      // 以下为严格模式：cost > 0 时必须满足所有条件才能继续

      // 检查数据库配置是否完整
      if (!config?.tableName || !config?.userIdField || !config?.balanceField) {
        const missing = []
        if (!config?.tableName) missing.push('tableName')
        if (!config?.userIdField) missing.push('userIdField')
        if (!config?.balanceField) missing.push('balanceField')
        context.setMiddlewareLog('billing-prepare', {
          error: true,
          reason: 'database config missing',
          missing
        })
        throw new Error(`计费配置不完整，缺少: ${missing.join(', ')}`)
      }

      // 解析用户 ID
      const userId = await resolveUserId(context.ctx, context)
      if (!userId) {
        context.setMiddlewareLog('billing-prepare', { error: true, reason: 'no user id' })
        throw new Error('无法识别用户身份，请先绑定账号')
      }

      // 获取货币类型（已由 getMiddlewareConfig 合并渠道覆盖）
      const currencyValue = config.currencyValue ?? 'default'
      const currencyLabel = config.currencyLabel || '积分'

      try {
        // 查询余额
        const balance = await getBalance(context.ctx, config, userId, currencyValue)

        // 检查余额是否充足
        if (balance < cost) {
          // 使用配置的余额不足提示模板
          const insufficientMsg = renderTemplate(
            getMessageTemplate(config, 'msgInsufficientBalance'),
            { cost, balance, label: currencyLabel }
          )
          context.setMiddlewareLog('billing-prepare', {
            error: true,
            reason: 'insufficient balance',
            balance,
            required: cost,
            currency: currencyValue
          })
          throw new Error(insufficientMsg)
        }

        // 扣费
        await updateBalance(context.ctx, config, userId, -cost, currencyValue)

        // 记录扣费信息到 store，供 finalize 阶段使用
        context.store.set(STORE_KEY, true)
        context.store.set(STORE_AMOUNT_KEY, cost)
        context.store.set(STORE_USER_KEY, userId)
        context.store.set(STORE_CURRENCY_KEY, currencyValue)

        // 添加用户提示（生成前）- 使用配置的预扣费提示模板
        const newBalance = balance - cost
        const preChargeMsg = renderTemplate(
          getMessageTemplate(config, 'msgPreCharge'),
          { cost, balance: newBalance, label: currencyLabel }
        )
        context.addUserHint(preChargeMsg, 'before')

        context.setMiddlewareLog('billing-prepare', {
          charged: cost,
          userId,
          currency: currencyValue,
          balanceBefore: balance,
          balanceAfter: newBalance
        })

        return next()
      } catch (error) {
        context.setMiddlewareLog('billing-prepare', {
          error: true,
          message: error instanceof Error ? error.message : 'Unknown error'
        })
        throw error
      }
    }
  }
}

/**
 * 创建计费结算中间件
 * 在 lifecycle-finalize 阶段处理失败退款
 */
export function createBillingFinalizeMiddleware(): MiddlewareDefinition {
  return {
    name: 'billing-finalize',
    displayName: '计费结算',
    description: '生成失败时自动退款',
    category: 'billing',
    phase: 'lifecycle-finalize',
    configGroup: 'billing',

    async execute(context: MiddlewareContext, next): Promise<MiddlewareRunStatus> {
      const config = await context.getMiddlewareConfig<BillingConfig>('billing')
      const currencyLabel = config?.currencyLabel || '积分'

      // 检查是否已扣费
      const wasCharged = context.store.get(STORE_KEY)
      if (!wasCharged) {
        return next()
      }

      const chargedAmount = context.store.get(STORE_AMOUNT_KEY) as number
      const storedUserId = context.store.get(STORE_USER_KEY) as number
      const currencyValue = context.store.get(STORE_CURRENCY_KEY) as string

      // 判断生成是否成功
      const isSuccess = context.output && context.output.length > 0

      if (isSuccess) {
        // 生成成功，确认扣费
        // 查询当前余额
        let currentBalance: number | null = null
        try {
          currentBalance = await getBalance(context.ctx, config!, storedUserId, currencyValue)
        } catch (e) {
          // 查询失败不影响主流程
        }

        // 使用配置的成功提示模板
        const successMsg = renderTemplate(
          getMessageTemplate(config, 'msgSuccess'),
          { cost: chargedAmount, balance: currentBalance, label: currencyLabel }
        )
        context.addUserHint(successMsg, 'after')

        context.setMiddlewareLog('billing-finalize', {
          confirmed: chargedAmount,
          userId: storedUserId,
          currency: currencyValue,
          currentBalance
        })
      } else if (config?.refundOnFail !== false) {
        // 生成失败且启用了失败退款，执行退款
        try {
          await updateBalance(context.ctx, config!, storedUserId, chargedAmount, currencyValue)

          // 查询退款后余额
          let currentBalance: number | null = null
          try {
            currentBalance = await getBalance(context.ctx, config!, storedUserId, currencyValue)
          } catch (e) {
            // 查询失败不影响主流程
          }

          // 使用配置的退款提示模板
          const refundedMsg = renderTemplate(
            getMessageTemplate(config, 'msgRefunded'),
            { cost: chargedAmount, balance: currentBalance, label: currencyLabel }
          )
          context.addUserHint(refundedMsg, 'after')

          context.setMiddlewareLog('billing-finalize', {
            refunded: chargedAmount,
            reason: 'generation failed',
            userId: storedUserId,
            currency: currencyValue,
            currentBalance
          })
        } catch (error) {
          // 使用配置的退款失败提示模板
          const refundFailedMsg = renderTemplate(
            getMessageTemplate(config, 'msgRefundFailed'),
            { error: error instanceof Error ? error.message : '未知错误' }
          )
          context.addUserHint(refundFailedMsg, 'after')

          context.setMiddlewareLog('billing-finalize', {
            refundFailed: true,
            amount: chargedAmount,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      } else {
        // 生成失败但未启用退款 - 使用配置的不退款提示模板
        const noRefundMsg = renderTemplate(
          getMessageTemplate(config, 'msgNoRefund'),
          { cost: chargedAmount, label: currencyLabel }
        )
        context.addUserHint(noRefundMsg, 'after')

        context.setMiddlewareLog('billing-finalize', {
          noRefund: true,
          reason: 'refundOnFail disabled',
          charged: chargedAmount,
          userId: storedUserId,
          currency: currencyValue
        })
      }

      return next()
    }
  }
}
