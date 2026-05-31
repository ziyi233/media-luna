import { definePlugin } from '../../core'
import {
  dalleSizeEnhancerConfigFields,
  defaultDalleSizeEnhancerConfig,
  type DalleSizeEnhancerConfig
} from './config'
import { createDalleSizeEnhancerMiddleware } from './middleware'

export default definePlugin({
  id: 'dalle-size-enhancer',
  name: 'DALL-E 尺寸增强',
  description: '根据提示词中的分辨率/比例或首图宽高比改写 DALL-E size 参数',
  version: '1.0.0',

  configFields: dalleSizeEnhancerConfigFields,
  configDefaults: defaultDalleSizeEnhancerConfig,

  contributes: {
    middlewares: [
      createDalleSizeEnhancerMiddleware()
    ]
  },

  async onLoad(pluginCtx) {
    pluginCtx.logger.info('DALL-E size enhancer plugin loaded')
  }
})

export type { DalleSizeEnhancerConfig } from './config'
export { createDalleSizeEnhancerMiddleware } from './middleware'
