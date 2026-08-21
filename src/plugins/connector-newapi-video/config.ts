import type { CardDisplayField, ConnectorField } from '../../core'

export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API Base URL',
    type: 'text',
    required: true,
    default: 'https://api.example.com',
    placeholder: 'https://your-newapi.example.com',
    description: 'NewAPI 基址。无视频时优先拼接 /v1/videos/generations（404 时回退 /v1/video/generations）；有视频且开启自动 edits 时拼接 /v1/videos/edits'
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
    placeholder: '如 kling-v1、jimeng-video 等'
  },
  {
    key: 'mode',
    label: '模式',
    type: 'text',
    placeholder: '留空使用服务默认值，如 image2video、text2video'
  },
  {
    key: 'size',
    label: '尺寸',
    type: 'text',
    placeholder: '1280x720'
  },
  {
    key: 'width',
    label: '宽度',
    type: 'number',
    placeholder: '留空使用服务默认值'
  },
  {
    key: 'height',
    label: '高度',
    type: 'number',
    placeholder: '留空使用服务默认值'
  },
  {
    key: 'duration',
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
    key: 'negativePrompt',
    label: '负面提示词',
    type: 'textarea'
  },
  {
    key: 'enableImageInput',
    label: '允许图片输入',
    type: 'boolean',
    default: true,
    description: '启用后会将 storage-input 上传出的图片 URL 作为 image 参数发送'
  },
  {
    key: 'enableVideoInput',
    label: '允许视频输入',
    type: 'boolean',
    default: true,
    description: '启用后会将 storage-input 上传出的视频 URL 作为视频编辑输入。关闭后忽略视频，不会把视频当图片发送'
  },
  {
    key: 'autoUseEditsForVideoInput',
    label: '有视频自动切 edits',
    type: 'boolean',
    default: true,
    description: '默认开启。用户上传视频时走 /v1/videos/edits；无视频时走 /v1/videos/generations。不支持视频编辑的上游请关闭，避免误打 edits 接口'
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
  { source: 'connectorConfig', key: 'duration', label: '时长' }
]
