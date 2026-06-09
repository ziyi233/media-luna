import { definePlugin } from '../../core'
import { AgnesVideoConnector } from './connector'

export default definePlugin({
  id: 'connector-agnes-video',
  name: 'Agnes Video 连接器',
  description: 'Agnes Video V2.0 异步视频生成连接器',
  version: '1.0.0',

  connector: AgnesVideoConnector,

  async onLoad(ctx) {
    ctx.logger.info('Agnes Video connector loaded')
  }
})

export { AgnesVideoConnector } from './connector'
