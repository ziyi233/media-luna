// 计费插件入口

import { definePlugin } from '../../core'
import { createBillingPrepareMiddleware, createBillingFinalizeMiddleware } from './middleware'
import { billingConfigFields, defaultBillingConfig } from './config'
import { BillingService } from './service'

export default definePlugin({
  id: 'billing',
  name: '计费管理',
  description: '用户余额扣费和退款支持',
  version: '1.0.0',

  contributes: {
    middlewares: [
      createBillingPrepareMiddleware(),
      createBillingFinalizeMiddleware()
    ],
    services: [
      {
        name: 'billing',
        factory: (pluginCtx) => new BillingService(pluginCtx)
      }
    ]
  },

  configFields: billingConfigFields,
  configDefaults: defaultBillingConfig,

  async onLoad(pluginCtx) {
    pluginCtx.logger.info('Billing plugin loaded')
  }
})

// 导出类型和服务
export type { BillingConfig } from './config'
export { BillingService } from './service'
