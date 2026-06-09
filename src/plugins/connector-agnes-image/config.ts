import type { CardDisplayField, ConnectorField } from '../../core'

export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'https://apihub.agnes-ai.com/v1/images/generations',
    placeholder: 'https://apihub.agnes-ai.com/v1/images/generations',
    description: 'Agnes Image generations 接口地址'
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
    default: 'agnes-image-2.1-flash',
    placeholder: 'agnes-image-2.1-flash',
    description: '模型名称，如 agnes-image-2.1-flash'
  },
  {
    key: 'size',
    label: '图片尺寸',
    type: 'text',
    description: '输出尺寸，如 1024x768；也可配合 DALL-E 尺寸增强中间件动态改写'
  },
  {
    key: 'responseFormat',
    label: '响应格式',
    type: 'select',
    default: 'b64_json',
    options: [
      { label: 'Base64', value: 'b64_json' },
      { label: 'URL', value: 'url' }
    ],
    description: 'Agnes Image 输出格式，默认使用 b64_json 直接返回图片数据'
  },
  {
    key: 'enableImageInput',
    label: '允许图片输入',
    type: 'boolean',
    default: true,
    description: '启用后优先将当前输入图片转为 Data URI Base64 发送；无本地图片时再回退到已上传的 URL'
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
  { source: 'connectorConfig', key: 'size', label: '尺寸', format: 'size' }
]
