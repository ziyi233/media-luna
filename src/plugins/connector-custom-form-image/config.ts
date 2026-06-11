import type { CardDisplayField, ConnectorField } from '../../core'

export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    placeholder: 'https://your-server.example.com/generate',
    description: '表单提交接口地址，不预置默认值'
  },
  {
    key: 'userAgent',
    label: 'User-Agent',
    type: 'text',
    placeholder: '留空使用默认浏览器样式 UA',
    description: '可选。某些站点会检查浏览器请求头'
  },
  {
    key: 'acceptLanguage',
    label: 'Accept-Language',
    type: 'text',
    default: 'zh-CN,zh;q=0.9,en-US;q=0.6,en;q=0.5',
    placeholder: 'zh-CN,zh;q=0.9,en-US;q=0.6,en;q=0.5'
  },
  {
    key: 'promptFieldName',
    label: '提示词字段名',
    type: 'text',
    default: 'prompt',
    placeholder: 'prompt'
  },
  {
    key: 'negativePromptFieldName',
    label: '负面提示词字段名',
    type: 'text',
    default: 'negative_prompt',
    placeholder: 'negative_prompt'
  },
  {
    key: 'resolutionFieldName',
    label: '分辨率字段名',
    type: 'text',
    default: 'resolution',
    placeholder: 'resolution'
  },
  {
    key: 'resolution',
    label: '分辨率',
    type: 'text',
    placeholder: '832x1216'
  },
  {
    key: 'negativePrompt',
    label: '默认负面提示词',
    type: 'textarea',
    placeholder: 'blurry, lowres'
  },
  {
    key: 'extraFormFields',
    label: '额外表单字段(JSON)',
    type: 'textarea',
    placeholder: '{"foo":"bar"}',
    description: '可选。附加到 x-www-form-urlencoded 请求中的固定字段'
  },
  {
    key: 'responseImageField',
    label: '返回图片字段',
    type: 'text',
    default: 'image',
    placeholder: 'image',
    description: '响应里存放图片 URL/路径的字段名'
  },
  {
    key: 'responseFilenameField',
    label: '返回文件名字段',
    type: 'text',
    default: 'filename',
    placeholder: 'filename'
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 180
  },
  {
    key: 'extraHeaders',
    label: '额外请求头(JSON)',
    type: 'textarea',
    placeholder: '{"X-Foo":"bar"}',
    description: '可选。附加到请求头中的字段，用于兼容特殊站点'
  }
]

export const connectorCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'apiUrl', label: '接口' },
  { source: 'connectorConfig', key: 'resolution', label: '分辨率', format: 'size' }
]
