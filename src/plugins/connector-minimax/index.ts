// MiniMax T2A 连接器插件

import { definePlugin } from '../../core'
import { MiniMaxConnector } from './connector'

export default definePlugin({
  id: 'connector-minimax',
  name: 'MiniMax T2A 连接器',
  description: 'MiniMax 文本转语音连接器，支持多种音色和情感控制',
  version: '1.0.0',

  contributes: {
    connectors: [MiniMaxConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('MiniMax T2A connector loaded')
  }
})

export { MiniMaxConnector } from './connector'
