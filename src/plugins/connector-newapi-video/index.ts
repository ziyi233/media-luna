import { definePlugin } from '../../core'
import { NewAPIVideoConnector } from './connector'

export default definePlugin({
  id: 'connector-newapi-video',
  name: 'NewAPI Video 连接器',
  description: 'NewAPI 通用视频生成连接器',
  version: '1.0.0',

  connector: NewAPIVideoConnector,

  async onLoad(ctx) {
    ctx.logger.info('NewAPI Video connector loaded')
  }
})

export { NewAPIVideoConnector } from './connector'
