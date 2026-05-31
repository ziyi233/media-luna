// Midjourney 连接器插件

import { definePlugin } from '../../core'
import { MidjourneyConnector } from './connector'

export default definePlugin({
  id: 'connector-midjourney',
  name: 'Midjourney 连接器',
  description: '适配通用 Midjourney API Proxy 服务',
  version: '1.0.0',

  contributes: {
    connectors: [MidjourneyConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Midjourney connector loaded')
  }
})

export { MidjourneyConnector } from './connector'
