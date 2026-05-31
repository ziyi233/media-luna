// 豆包/火山引擎 Seedream 连接器插件

import { definePlugin } from '../../core'
import { DoubaoConnector } from './connector'

export default definePlugin({
  id: 'connector-doubao',
  name: '豆包连接器',
  description: '豆包/火山引擎 Seedream 图像生成连接器',
  version: '1.0.0',

  contributes: {
    connectors: [DoubaoConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Doubao connector loaded')
  }
})

export { DoubaoConnector } from './connector'
