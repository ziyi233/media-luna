// Runway 连接器插件

import { definePlugin } from '../../core'
import { RunwayConnector } from './connector'

export default definePlugin({
  id: 'connector-runway',
  name: 'Runway 连接器',
  description: '适配 Runway Gen-2/Gen-3 视频生成',
  version: '1.0.0',

  contributes: {
    connectors: [RunwayConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Runway connector loaded')
  }
})

export { RunwayConnector } from './connector'
