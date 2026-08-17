import type { CardDisplayField, ConnectorField } from '../../core'

export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API 基础地址',
    type: 'text',
    required: true,
    default: 'https://api.x.ai/v1',
    placeholder: 'https://api.x.ai/v1',
    description: '连接器会自动拼接 /images/generations 或 /images/edits'
  },
  {
    key: 'apiKey',
    label: 'API 密钥',
    type: 'password',
    required: true
  },
  {
    key: 'model',
    label: '模型',
    type: 'text',
    required: true,
    default: 'grok-imagine-image-2.0',
    placeholder: 'grok-imagine-image-2.0',
    description: '默认使用当前官方推荐的 Grok Imagine Image 2.0，也可填写其他兼容模型'
  },
  {
    key: 'aspectRatio',
    label: '宽高比',
    type: 'select',
    default: 'auto',
    options: [
      { label: '自动', value: 'auto' },
      { label: '1:1', value: '1:1' },
      { label: '16:9', value: '16:9' },
      { label: '9:16', value: '9:16' },
      { label: '4:3', value: '4:3' },
      { label: '3:4', value: '3:4' },
      { label: '3:2', value: '3:2' },
      { label: '2:3', value: '2:3' },
      { label: '2:1', value: '2:1' },
      { label: '1:2', value: '1:2' },
      { label: '19.5:9', value: '19.5:9' },
      { label: '9:19.5', value: '9:19.5' },
      { label: '20:9', value: '20:9' },
      { label: '9:20', value: '9:20' }
    ],
    description: '文生图使用此默认值；图片编辑默认继承第一张输入图比例，只有指令 -a 会覆盖'
  },
  {
    key: 'resolution',
    label: '分辨率',
    type: 'select',
    default: '1k',
    options: [
      { label: '1K', value: '1k' },
      { label: '2K', value: '2k' }
    ]
  },
  {
    key: 'quality',
    label: '生成质量',
    type: 'select',
    default: '',
    options: [
      { label: '跟随模型默认', value: '' },
      { label: '低', value: 'low' },
      { label: '中', value: 'medium' }
    ],
    description: '仅 Grok Imagine Image 2.0 文生图支持；图片编辑不会发送此配置'
  },
  {
    key: 'count',
    label: '生成数量',
    type: 'number',
    default: 1,
    description: '单次生成 1-10 张图片'
  },
  {
    key: 'responseFormat',
    label: '响应格式',
    type: 'select',
    default: 'url',
    options: [
      { label: '临时 URL', value: 'url' },
      { label: 'Base64', value: 'b64_json' }
    ],
    description: 'URL 为 xAI 临时地址，建议启用缓存插件及时转存'
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 600
  }
]

export const connectorCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'resolution', label: '分辨率' },
  { source: 'connectorConfig', key: 'aspectRatio', label: '宽高比' },
  { source: 'connectorConfig', key: 'count', label: '数量', format: 'number' }
]
