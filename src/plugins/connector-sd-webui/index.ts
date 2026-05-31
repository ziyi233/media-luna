// Stable Diffusion WebUI 连接器插件

import { definePlugin } from '../../core'
import { SDWebUIConnector } from './connector'

export default definePlugin({
  id: 'connector-sd-webui',
  name: 'SD WebUI 连接器',
  description: 'Stable Diffusion WebUI (AUTOMATIC1111) 连接器',
  version: '1.0.0',

  contributes: {
    connectors: [SDWebUIConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('SD WebUI connector loaded')
  }
})

export { SDWebUIConnector } from './connector'
