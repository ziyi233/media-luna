// Google Vertex AI 连接器插件
// 使用 Vertex AI API 调用 Gemini 模型

import { definePlugin } from '../../core'
import { VertexAIConnector } from './connector'

export default definePlugin({
  id: 'connector-vertex-ai',
  name: 'Vertex AI 连接器',
  description: 'Google Vertex AI 图像生成连接器',
  version: '1.0.0',

  connector: VertexAIConnector,

  async onLoad(ctx) {
    ctx.logger.info('Vertex AI connector loaded')
  }
})

export { VertexAIConnector } from './connector'
