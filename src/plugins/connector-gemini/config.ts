// Gemini 连接器配置

import type { ConnectorField, CardDisplayField } from '../../core'

/** Gemini 配置字段 */
export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'https://generativelanguage.googleapis.com',
    placeholder: 'https://generativelanguage.googleapis.com',
    description: 'API 基础地址，用于反向代理或自定义端点'
  },
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    description: 'Google AI Studio API Key'
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
    type: 'combobox',
    placeholder: '选择预设尺寸或输入自定义值（如 0.5K）',
    options: [
      { label: '512x512 (0.5K)', value: '0.5K' },
      { label: '1024x1024 (1K)', value: '1K' },
      { label: '2048x2048 (2K)', value: '2K' },
      { label: '4096x4096 (4K)', value: '4K' }
    ],
    description: '生成图像的分辨率（可从预设选择或输入自定义值）'
  },
  {
    key: 'outputMimeType',
    label: '输出格式',
    type: 'select',
    options: [
      { label: '不设置（默认 JPEG）', value: '' },
      { label: 'JPEG', value: 'image/jpeg' },
      { label: 'PNG', value: 'image/png' }
    ],
    description: '生成图片的输出格式（部分 API 端点可能不支持此参数）'
  },
  {
    key: 'forceImageOutput',
    label: '强制图片输出',
    type: 'boolean',
    default: false,
    description: '启用后添加 responseModalities: ["IMAGE"]，强制仅输出图片（不返回文本）'
  },
  {
    key: 'enableGoogleSearch',
    label: '启用谷歌搜索',
    type: 'boolean',
    default: false,
    description: '启用后模型可使用 Google 搜索获取实时信息'
  },
  {
    key: 'enableGoogleImageSearch',
    label: '启用谷歌图片搜索接地',
    type: 'boolean',
    default: false,
    description: '启用后在 Google Search 工具中增加 imageSearch，可使用图片搜索结果作为视觉上下文（建议配合 Flash Image 模型）'
  },
  {
    key: 'exposeGroundingSources',
    label: '输出接地来源信息',
    type: 'boolean',
    default: false,
    description: '启用后将 groundingMetadata 中的来源网页链接与搜索查询以文本形式追加到输出（默认关闭）'
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
    description: '控制模型思考的深度，medium 和 minimal 仅支持 Flash 模型'
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
    description: '高分辨率请求时，API 会返回思考过程的临时图片，启用后自动过滤这些图片，只保留最终结果'
  },
  {
    key: 'textOnlyAsSuccess',
    label: '纯文字视为成功',
    type: 'boolean',
    default: false,
    description: '当模型只返回文字（无图片）时，是否视为生成成功。关闭则会报错（不扣费），开启则正常返回文字内容（扣费）'
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
    description: '内容安全过滤级别，不设置则使用API默认值'
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
    description: '控制是否允许生成人物图片，不设置则使用API默认值'
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
