// Azure TTS 连接器插件入口
// 通过微软翻译器 App 接口免费使用 Azure 语音服务

import { definePlugin } from '../../core'
import { AzureTTSConnector } from './connector'

export default definePlugin({
  id: 'connector-azure-tts',
  name: 'Azure TTS 连接器',
  description: '微软 Azure 语音合成服务，免费使用，支持多语言和语音风格',
  version: '1.0.0',

  connector: AzureTTSConnector,

  async onLoad(ctx) {
    ctx.logger.info('Azure TTS connector loaded')
  }
})

export { AzureTTSConnector } from './connector'
