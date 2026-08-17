import { definePlugin } from '../../core'
import { XaiImageConnector } from './connector'

export default definePlugin({
  id: 'connector-xai-image',
  name: 'xAI 图片连接器',
  description: '支持 Grok Imagine 文生图、单图编辑和多图编辑。',
  version: '1.0.0',
  connector: XaiImageConnector,

  async onLoad(ctx) {
    ctx.logger.info('xAI 图片连接器已加载')
  }
})

export { XaiImageConnector } from './connector'
export type { XaiImageMode, XaiImageRequest } from './connector'
