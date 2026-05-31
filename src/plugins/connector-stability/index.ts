// Stability AI 连接器插件

import { definePlugin } from '../../core'
import { StabilityConnector } from './connector'

export default definePlugin({
  id: 'connector-stability',
  name: 'Stability AI 连接器',
  description: 'Stability AI 官方连接器 (SD3/Core)',
  version: '1.0.0',

  contributes: {
    connectors: [StabilityConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Stability AI connector loaded')
  }
})

export { StabilityConnector } from './connector'
