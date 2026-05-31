// 审核绕过插件入口
// 通过前置提示词注入和 Unicode 编码绕过内容审核

import { definePlugin } from '../../core'
import { createCensorBypassMiddleware } from './middleware'
import {
  censorBypassConfigFields,
  defaultCensorBypassConfig,
  type CensorBypassConfig
} from './config'

export default definePlugin({
  id: 'prompt-censor-bypass',
  name: '审核绕过',
  description: '通过前置提示词注入和 Unicode 编码绕过内容审核',
  version: '1.0.0',

  configFields: censorBypassConfigFields,
  configDefaults: defaultCensorBypassConfig,

  contributes: {
    middlewares: [
      createCensorBypassMiddleware()
    ]
  },

  async onLoad(ctx) {
    ctx.logger.info('Censor bypass plugin loaded')
  }
})

// 导出类型
export type { CensorBypassConfig } from './config'
export { createCensorBypassMiddleware } from './middleware'
