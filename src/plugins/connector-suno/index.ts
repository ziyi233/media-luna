// Suno AI 连接器插件

import { definePlugin } from '../../core'
import { SunoConnector } from './connector'

export default definePlugin({
  id: 'connector-suno',
  name: 'Suno AI 连接器',
  description: '适配第三方 Suno AI API 服务',
  version: '1.0.0',

  contributes: {
    connectors: [SunoConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Suno AI connector loaded')
  }
})

export { SunoConnector } from './connector'
