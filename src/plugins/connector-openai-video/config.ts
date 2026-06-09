import type { CardDisplayField, ConnectorField } from '../../core'

export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API Base URL',
    type: 'text',
    required: true,
    default: 'https://api.openai.com/v1',
    placeholder: 'https://api.openai.com/v1',
    description: 'OpenAI /v1 基址，连接器会自动拼接 /videos、/videos/{id} 和 /content'
  },
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true
  },
  {
    key: 'model',
    label: '模型',
    type: 'text',
    required: true,
    default: 'sora-2',
    placeholder: 'sora-2'
  },
  {
    key: 'size',
    label: '尺寸',
    type: 'text',
    placeholder: '1280x720',
    description: 'OpenAI-compatible 视频尺寸参数，留空使用服务默认值'
  },
  {
    key: 'seconds',
    label: '时长（秒）',
    type: 'number',
    placeholder: '留空使用服务默认值'
  },
  {
    key: 'fps',
    label: '帧率',
    type: 'number',
    placeholder: '留空使用服务默认值'
  },
  {
    key: 'seed',
    label: '种子',
    type: 'number',
    placeholder: '留空随机'
  },
  {
    key: 'enableImageInput',
    label: '允许图片输入',
    type: 'boolean',
    default: true,
    description: '启用后会将 storage-input 上传出的第一张图片 URL 作为输入图发送'
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
  { source: 'connectorConfig', key: 'size', label: '尺寸', format: 'size' },
  { source: 'connectorConfig', key: 'seconds', label: '时长' }
]
