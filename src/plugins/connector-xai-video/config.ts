import type { CardDisplayField, ConnectorField } from '../../core'

export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API 基础地址',
    type: 'text',
    required: true,
    default: 'https://api.x.ai/v1',
    placeholder: 'https://api.x.ai/v1'
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
    default: 'grok-imagine-video',
    description: '例如 grok-imagine-video；也可按当前 xAI 文档填写新版模型'
  },
  {
    key: 'mode',
    label: '默认模式',
    type: 'select',
    default: 'auto',
    options: [
      { label: '自动判断', value: 'auto' },
      { label: '文生视频', value: 'text' },
      { label: '图生视频', value: 'image' },
      { label: '参考图生成', value: 'reference' },
      { label: '视频编辑', value: 'edit' },
      { label: '视频续写', value: 'extend' }
    ],
    description: '自动模式不会猜测视频输入的用途；编辑或续写视频时请使用 --mode edit 或 --mode extend'
  },
  {
    key: 'duration',
    label: '时长（秒）',
    type: 'number',
    default: 6
  },
  {
    key: 'aspectRatio',
    label: '宽高比',
    type: 'select',
    default: '16:9',
    options: [
      { label: '16:9', value: '16:9' },
      { label: '9:16', value: '9:16' },
      { label: '1:1', value: '1:1' },
      { label: '4:3', value: '4:3' },
      { label: '3:4', value: '3:4' },
      { label: '3:2', value: '3:2' },
      { label: '2:3', value: '2:3' }
    ],
    description: '单图生成未显式指定宽高比时会沿用输入图片比例'
  },
  {
    key: 'resolution',
    label: '分辨率',
    type: 'select',
    default: '480p',
    options: [
      { label: '480p', value: '480p' },
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' }
    ]
  },
  {
    key: 'pollInterval',
    label: '轮询间隔（毫秒）',
    type: 'number',
    default: 5000
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 900
  }
]

export const connectorCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'mode', label: '模式' },
  { source: 'connectorConfig', key: 'duration', label: '时长' },
  { source: 'connectorConfig', key: 'resolution', label: '分辨率' }
]