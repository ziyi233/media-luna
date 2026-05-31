// DALL-E 连接器插件

import { definePlugin } from '../../core'
import { DalleConnector } from './connector'

export default definePlugin({
  id: 'connector-dalle',
  name: 'DALL-E 连接器',
  description: 'DALL-E / OpenAI 图像生成连接器',
  version: '1.0.0',

  contributes: {
    connectors: [DalleConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('DALL-E connector loaded')
  }
})

export { DalleConnector } from './connector'
