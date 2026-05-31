// Peinture (派奇智图) 连接器插件

import { definePlugin } from '../../core'
import { PeintureConnector } from './connector'

export default definePlugin({
  id: 'connector-peinture',
  name: 'Peinture 派奇智图连接器',
  description: 'Peinture 图像生成连接器（Linux.do 社区开源项目）',
  version: '1.0.0',

  contributes: {
    connectors: [PeintureConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Peinture connector loaded')
  }
})

export { PeintureConnector } from './connector'
