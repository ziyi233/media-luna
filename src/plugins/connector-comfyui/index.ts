// ComfyUI 连接器插件

import { definePlugin } from '../../core'
import { ComfyUIConnector } from './connector'

export default definePlugin({
  id: 'connector-comfyui',
  name: 'ComfyUI 连接器',
  description: '适配 ComfyUI 工作流',
  version: '1.0.0',

  contributes: {
    connectors: [ComfyUIConnector]
  },

  async onLoad(ctx) {
    ctx.logger.info('ComfyUI connector loaded')
  }
})

export { ComfyUIConnector } from './connector'
