import { definePlugin } from '../../core'
import { AgnesImageConnector } from './connector'

export default definePlugin({
  id: 'connector-agnes-image',
  name: 'Agnes Image 连接器',
  description: 'Agnes Image 2.1 Flash 图像生成连接器',
  version: '1.0.0',

  connector: AgnesImageConnector,

  async onLoad(ctx) {
    ctx.logger.info('Agnes Image connector loaded')
  }
})

export { AgnesImageConnector } from './connector'
