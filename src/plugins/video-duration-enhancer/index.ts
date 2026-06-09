import { definePlugin } from '../../core'
import {
  defaultVideoDurationEnhancerConfig,
  videoDurationEnhancerConfigFields,
  type VideoDurationEnhancerConfig
} from './config'
import { createVideoDurationEnhancerMiddleware } from './middleware'

export default definePlugin({
  id: 'video-duration-enhancer',
  name: '视频时长增强',
  description: '解析提示词中的视频时长标记，并为视频连接器与按秒计费提供参数',
  version: '1.0.0',

  configFields: videoDurationEnhancerConfigFields,
  configDefaults: defaultVideoDurationEnhancerConfig,

  middlewares: [
    createVideoDurationEnhancerMiddleware()
  ],

  async onLoad(pluginCtx) {
    pluginCtx.logger.info('Video duration enhancer plugin loaded')
  }
})

export type { VideoDurationEnhancerConfig } from './config'
export { createVideoDurationEnhancerMiddleware } from './middleware'
