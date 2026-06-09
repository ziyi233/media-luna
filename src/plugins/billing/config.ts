// 计费插件配置字段定义

import type { ConfigField, CardField } from '../../core'

/** 计费配置 */
export interface BillingConfig {
  // 数据库配置
  tableName: string
  userIdField: string
  balanceField: string
  currencyField: string

  // 计费行为配置
  refundOnFail: boolean
  currencyLabel: string
  billingUnit: 'request' | 'second'

  // 渠道级配置（可在渠道中覆盖）
  cost: number
  currencyValue: string

  // 提示信息模板（支持变量替换）
  msgPreCharge: string      // 预扣费成功
  msgInsufficientBalance: string  // 余额不足
  msgSuccess: string        // 生成成功
  msgRefunded: string       // 生成失败已退款
  msgRefundFailed: string   // 退款失败
  msgNoRefund: string       // 生成失败不退款
}

/** 计费配置字段 */
export const billingConfigFields: ConfigField[] = [
  // 数据库配置
  {
    key: 'tableName',
    label: '数据库表名',
    type: 'text',
    default: 'monetary',
    placeholder: 'monetary',
    description: '存储用户余额的数据库表名'
  },
  {
    key: 'userIdField',
    label: '用户 ID 字段',
    type: 'text',
    default: 'uid',
    placeholder: 'uid',
    description: '表中用于查询的用户 ID 字段名（对应 Koishi binding 表的 aid）'
  },
  {
    key: 'balanceField',
    label: '余额字段',
    type: 'text',
    default: 'value',
    placeholder: 'value',
    description: '表中存储余额数值的字段名'
  },
  {
    key: 'currencyField',
    label: '货币类型字段',
    type: 'text',
    default: 'currency',
    placeholder: 'currency',
    description: '表中货币类型的字段名（留空表示不区分货币类型）'
  },
  {
    key: 'currencyLabel',
    label: '货币显示名称',
    type: 'text',
    default: '积分',
    placeholder: '积分',
    description: '余额的货币单位名称（用于提示信息）'
  },
  {
    key: 'refundOnFail',
    label: '失败自动退款',
    type: 'boolean',
    default: true,
    description: '生成失败时自动退还已扣费用'
  },
  {
    key: 'billingUnit',
    label: '计费单位',
    type: 'select',
    default: 'request',
    options: [
      { label: '按次', value: 'request' },
      { label: '按秒', value: 'second' }
    ],
    description: '按秒计费时，费用 = 单价 × 视频时长；视频时长由 video-duration-enhancer 写入'
  },

  // 渠道级配置（可在渠道配置中覆盖）
  {
    key: 'cost',
    label: '费用',
    type: 'number',
    default: 0,
    description: '按次计费时为每次费用；按秒计费时为每秒单价（0 表示免费）'
  },
  {
    key: 'currencyValue',
    label: '货币类型',
    type: 'text',
    default: 'default',
    placeholder: 'default',
    description: '使用的货币类型值'
  },

  // 提示信息模板
  {
    key: 'msgPreCharge',
    label: '预扣费提示',
    type: 'text',
    default: '已预扣 {cost} {label}{billingDetail}，余额 {balance} {label}',
    placeholder: '已预扣 {cost} {label}{billingDetail}，余额 {balance} {label}',
    description: '预扣费成功时的提示。变量: {cost}费用, {baseCost}单价, {seconds}秒数, {billingDetail}计费详情, {balance}余额, {label}货币名称'
  },
  {
    key: 'msgInsufficientBalance',
    label: '余额不足提示',
    type: 'text',
    default: '余额不足：需要 {cost} {label}{billingDetail}，当前余额 {balance} {label}',
    placeholder: '余额不足：需要 {cost} {label}{billingDetail}，当前余额 {balance} {label}',
    description: '余额不足时的提示。变量: {cost}费用, {baseCost}单价, {seconds}秒数, {billingDetail}计费详情, {balance}余额, {label}货币名称'
  },
  {
    key: 'msgSuccess',
    label: '成功提示',
    type: 'text',
    default: '生成成功，消费 {cost} {label}{billingDetail}，余额 {balance} {label}',
    placeholder: '生成成功，消费 {cost} {label}{billingDetail}，余额 {balance} {label}',
    description: '生成成功时的提示。变量: {cost}费用, {baseCost}单价, {seconds}秒数, {billingDetail}计费详情, {balance}余额, {label}货币名称'
  },
  {
    key: 'msgRefunded',
    label: '退款提示',
    type: 'text',
    default: '生成失败，已退还 {cost} {label}{billingDetail}，余额 {balance} {label}',
    placeholder: '生成失败，已退还 {cost} {label}{billingDetail}，余额 {balance} {label}',
    description: '生成失败退款时的提示。变量: {cost}费用, {baseCost}单价, {seconds}秒数, {billingDetail}计费详情, {balance}余额, {label}货币名称'
  },
  {
    key: 'msgRefundFailed',
    label: '退款失败提示',
    type: 'text',
    default: '生成失败，退款失败：{error}',
    placeholder: '生成失败，退款失败：{error}',
    description: '退款失败时的提示。变量: {error}错误信息'
  },
  {
    key: 'msgNoRefund',
    label: '不退款提示',
    type: 'text',
    default: '生成失败，已扣费 {cost} {label}{billingDetail}（不退款）',
    placeholder: '生成失败，已扣费 {cost} {label}{billingDetail}（不退款）',
    description: '生成失败但不退款时的提示。变量: {cost}费用, {baseCost}单价, {seconds}秒数, {billingDetail}计费详情, {label}货币名称'
  }
]

/** 计费卡片展示字段 */
export const billingCardFields: CardField[] = [
  {
    source: 'pluginOverride',
    configGroup: 'billing',
    key: 'billingUnit',
    label: '计费单位',
    format: 'text'
  },
  {
    source: 'pluginOverride',
    configGroup: 'billing',
    key: 'cost',
    label: '费用',
    format: 'number',
    suffix: '/次'
  },
  {
    source: 'pluginOverride',
    configGroup: 'billing',
    key: 'currencyValue',
    label: '货币',
    format: 'text'
  }
]

/** 默认计费配置 */
export const defaultBillingConfig: BillingConfig = {
  tableName: 'monetary',
  userIdField: 'uid',
  balanceField: 'value',
  currencyField: 'currency',
  refundOnFail: true,
  currencyLabel: '积分',
  billingUnit: 'request',
  cost: 0,
  currencyValue: 'default',
  // 提示信息模板
  msgPreCharge: '已预扣 {cost} {label}{billingDetail}，余额 {balance} {label}',
  msgInsufficientBalance: '余额不足：需要 {cost} {label}{billingDetail}，当前余额 {balance} {label}',
  msgSuccess: '生成成功，消费 {cost} {label}{billingDetail}，余额 {balance} {label}',
  msgRefunded: '生成失败，已退还 {cost} {label}{billingDetail}，余额 {balance} {label}',
  msgRefundFailed: '生成失败，退款失败：{error}',
  msgNoRefund: '生成失败，已扣费 {cost} {label}{billingDetail}（不退款）'
}
