import { definePlugin } from '../../core'
import { OpenAIVideoConnector } from './connector'

export default definePlugin({
  id: 'connector-openai-video',
  name: 'OpenAI Video 连接器',
  description: 'OpenAI/Sora-compatible 视频生成连接器',
  version: '1.0.0',

  connector: OpenAIVideoConnector,

  async onLoad(ctx) {
    ctx.logger.info('OpenAI Video connector loaded')
  }
})

export { OpenAIVideoConnector } from './connector'
