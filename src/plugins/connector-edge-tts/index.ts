// Edge TTS 连接器插件入口
// 使用微软 Edge 在线语音合成服务，免费且高质量

import { definePlugin } from '../../core'
import { EdgeTTSConnector } from './connector'

export default definePlugin({
  id: 'connector-edge-tts',
  name: 'Edge TTS 连接器',
  description: '微软 Edge 在线语音合成服务，免费使用，支持多语言和多种音色',
  version: '1.0.0',

  contributes: {
    connectors: [EdgeTTSConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Edge TTS connector loaded')
  }
})

export { EdgeTTSConnector } from './connector'
