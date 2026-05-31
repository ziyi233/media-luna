// Google Gemini 连接器插件
// 基于原生 HTTP 请求实现，支持 gemini-3-pro-image-preview 等新模型

import { definePlugin } from '../../core'
import { GeminiConnector } from './connector'

export default definePlugin({
  id: 'connector-gemini',
  name: 'Gemini 连接器',
  description: 'Google Gemini 3 图像生成连接器',
  version: '1.0.0',

  contributes: {
    connectors: [GeminiConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('Gemini connector loaded')
  }
})

export { GeminiConnector } from './connector'
