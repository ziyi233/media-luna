import { definePlugin } from '../../core'
import { XaiVideoConnector } from './connector'

export default definePlugin({
  id: 'connector-xai-video',
  name: 'xAI 视频连接器',
  description: '支持 Grok Imagine 文生视频、图生视频、参考图生成、视频编辑与续写。',
  version: '1.0.0',
  connector: XaiVideoConnector,

  async onLoad(ctx) {
    ctx.logger.info('xAI 视频连接器已加载')
  }
})

export { XaiVideoConnector } from './connector'
export type { XaiVideoMode, XaiVideoRequest } from './connector'