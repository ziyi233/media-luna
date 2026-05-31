// 测试连接器插件

import { definePlugin } from '../../core'
import { TestConnector } from './connector'

export default definePlugin({
  id: 'connector-test',
  name: '测试连接器',
  description: '内置测试连接器，将输入的文字和图片渲染成一张图片输出，无需配置外部 API',
  version: '1.0.0',

  contributes: {
    connectors: [TestConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Test connector loaded')
  }
})

export { TestConnector } from './connector'
