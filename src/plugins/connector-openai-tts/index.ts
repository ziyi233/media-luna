// OpenAI TTS 连接器插件入口
// 使用 OpenAI 语音合成 API，支持多种音色和兼容接口

import { definePlugin } from '../../core'
import { OpenAITTSConnector } from './connector'

export default definePlugin({
  id: 'connector-openai-tts',
  name: 'OpenAI TTS 连接器',
  description: 'OpenAI 语音合成服务，支持多种音色和高清模式，兼容 OpenAI API 格式的第三方服务',
  version: '1.0.0',

  connector: OpenAITTSConnector,

  async onLoad(ctx) {
    ctx.logger.info('OpenAI TTS connector loaded')
  }
})

export { OpenAITTSConnector } from './connector'
