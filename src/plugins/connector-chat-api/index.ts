// Chat API 连接器插件

import { definePlugin } from '../../core'
import { ChatApiConnector } from './connector'

export default definePlugin({
  id: 'connector-chat-api',
  name: 'Chat API 连接器',
  description: 'OpenAI Chat Completions 兼容的多媒体提取连接器',
  version: '1.0.0',

  contributes: {
    connectors: [ChatApiConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Chat API connector loaded')
  }
})

export { ChatApiConnector } from './connector'
