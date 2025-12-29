// 火山引擎 TTS 连接器插件入口
// 使用火山引擎豆包语音合成服务

import { definePlugin } from '../../core'
import { VolcengineTTSConnector } from './connector'

export default definePlugin({
  id: 'connector-volcengine-tts',
  name: '火山引擎 TTS 连接器',
  description: '火山引擎豆包语音合成服务，支持多音色、多情感',
  version: '1.0.0',

  connector: VolcengineTTSConnector,

  async onLoad(ctx) {
    ctx.logger.info('Volcengine TTS connector loaded')
  }
})

export { VolcengineTTSConnector } from './connector'
