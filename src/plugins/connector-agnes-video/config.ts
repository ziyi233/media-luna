import type { CardDisplayField, ConnectorField } from '../../core'

export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'https://apihub.agnes-ai.com/v1/videos',
    placeholder: 'https://apihub.agnes-ai.com/v1/videos',
    description: 'Agnes Video 创建任务接口地址'
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
    default: 'agnes-video-v2.0',
    placeholder: 'agnes-video-v2.0'
  },
  {
    key: 'mode',
    label: '生成模式',
    type: 'select',
    default: '',
    options: [
      { label: '自动', value: '' },
      { label: '图生视频 (ti2vid)', value: 'ti2vid' },
      { label: '关键帧 (keyframes)', value: 'keyframes' }
    ],
    description: '单图可使用 ti2vid，多图关键帧可使用 keyframes；留空则按输入图数量自动选择'
  },
  {
    key: 'width',
    label: '宽度',
    type: 'number',
    default: 1152
  },
  {
    key: 'height',
    label: '高度',
    type: 'number',
    default: 768
  },
  {
    key: 'numFrames',
    label: '帧数',
    type: 'number',
    default: 121,
    description: '必须小于等于 441，且满足 8n + 1，例如 81、121、161、241、441'
  },
  {
    key: 'frameRate',
    label: '帧率',
    type: 'number',
    default: 24,
    description: '支持范围 1-60'
  },
  {
    key: 'numInferenceSteps',
    label: '推理步数',
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
    description: '启用后优先将当前输入图片转为 Data URI Base64 用于图生视频/多图/关键帧；无本地图片时再回退到已上传的 URL'
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
  { source: 'connectorConfig', key: 'width', label: '宽度' },
  { source: 'connectorConfig', key: 'height', label: '高度' },
  { source: 'connectorConfig', key: 'numFrames', label: '帧数' }
]
