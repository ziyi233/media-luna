// Vertex AI 连接器配置

import type { ConnectorField, CardDisplayField } from '../../core'

/** Vertex AI 配置字段 */
export const connectorFields: ConnectorField[] = [
  {
    key: 'apiEndpoint',
    label: 'API Endpoint',
    type: 'text',
    required: true,
    default: 'aiplatform.googleapis.com',
    placeholder: 'aiplatform.googleapis.com',
    description: 'Vertex AI API 端点'
  },
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    description: 'Google Cloud API Key（需绑定服务账号）'
  },
  {
    key: 'model',
    label: '模型',
    type: 'text',
    required: true,
    default: 'gemini-3-pro-image-preview',
    placeholder: 'gemini-3-pro-image-preview',
    description: '模型名称，如 gemini-3-pro-image-preview'
  },
  {
    key: 'numberOfImages',
    label: '生成数量',
    type: 'number',
    description: '生成图片的数量'
  },
  {
    key: 'aspectRatio',
    label: '宽高比',
    type: 'text',
    description: '支持：1:1, 3:4, 4:3, 9:16, 16:9'
  },
  {
    key: 'imageSize',
    label: '图片尺寸',
    type: 'select',
    options: [
      { label: '不设置', value: '' },
      { label: '1024x1024 (1K)', value: '1K' },
      { label: '2048x2048 (2K)', value: '2K' },
      { label: '4096x4096 (4K)', value: '4K' }
    ],
    description: '生成图像的分辨率'
  },
  {
    key: 'outputMimeType',
    label: '输出格式',
    type: 'select',
    options: [
      { label: '不设置', value: '' },
      { label: 'JPEG', value: 'image/jpeg' },
      { label: 'PNG', value: 'image/png' }
    ],
    description: '生成图片的输出格式'
  },
  {
    key: 'forceImageOutput',
    label: '强制图片输出',
    type: 'boolean',
    default: true,
    description: '启用后添加 responseModalities: ["TEXT", "IMAGE"] 参数'
  },
  {
    key: 'enableGoogleSearch',
    label: '启用谷歌搜索',
    type: 'boolean',
    default: false,
    description: '启用后模型可使用 Google 搜索获取实时信息'
  },
  {
    key: 'thinkingLevel',
    label: '思考程度',
    type: 'select',
    options: [
      { label: '不设置', value: '' },
      { label: '高 (high)', value: 'high' },
      { label: '中 (medium) - 仅 Flash', value: 'medium' },
      { label: '低 (low)', value: 'low' },
      { label: '最小 (minimal) - 仅 Flash', value: 'minimal' }
    ],
    description: '控制模型思考的深度'
  },
  {
    key: 'includeThoughts',
    label: '返回思考过程',
    type: 'boolean',
    default: false,
    description: '是否在响应中包含模型的思考过程'
  },
  {
    key: 'filterThoughtImages',
    label: '过滤思考图片',
    type: 'boolean',
    default: true,
    description: '自动过滤思考过程的临时图片，只保留最终结果'
  },
  {
    key: 'textOnlyAsSuccess',
    label: '纯文字视为成功',
    type: 'boolean',
    default: false,
    description: '当模型只返回文字（无图片）时，是否视为生成成功'
  },
  {
    key: 'safetyLevel',
    label: '安全过滤级别',
    type: 'select',
    options: [
      { label: '不设置', value: '' },
      { label: '关闭 (OFF)', value: 'OFF' },
      { label: '仅高风险 (BLOCK_ONLY_HIGH)', value: 'BLOCK_ONLY_HIGH' },
      { label: '中等及以上 (BLOCK_MEDIUM_AND_ABOVE)', value: 'BLOCK_MEDIUM_AND_ABOVE' },
      { label: '低风险及以上 (BLOCK_LOW_AND_ABOVE)', value: 'BLOCK_LOW_AND_ABOVE' }
    ],
    description: '内容安全过滤级别'
  },
  {
    key: 'personGeneration',
    label: '人物生成',
    type: 'select',
    options: [
      { label: '不设置', value: '' },
      { label: '允许所有 (ALLOW_ALL)', value: 'ALLOW_ALL' },
      { label: '仅成人 (ALLOW_ADULT)', value: 'ALLOW_ADULT' },
      { label: '不允许 (DONT_ALLOW)', value: 'DONT_ALLOW' }
    ],
    description: '控制是否允许生成人物图片'
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 600
  }
]

/** 卡片展示字段 */
export const connectorCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'aspectRatio', label: '比例' }
]
