// Flux 连接器插件

import { definePlugin } from '../../core'
import { FluxConnector } from './connector'

export default definePlugin({
  id: 'connector-flux',
  name: 'Flux 连接器',
  description: 'Flux 图像生成连接器（支持 Replicate API）',
  version: '1.0.0',

  contributes: {
    connectors: [FluxConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Flux connector loaded')
  }
})

export { FluxConnector } from './connector'
