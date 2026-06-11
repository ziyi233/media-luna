import { definePlugin } from '../../core'
import { CustomFormImageConnector } from './connector'

export default definePlugin({
  id: 'connector-custom-form-image',
  name: '自定义表单图片连接器',
  description: '适配 application/x-www-form-urlencoded 的同步图片生成接口',
  version: '1.0.0',

  connector: CustomFormImageConnector,

  async onLoad(ctx) {
    ctx.logger.info('Custom form image connector loaded')
  }
})

export { CustomFormImageConnector } from './connector'
