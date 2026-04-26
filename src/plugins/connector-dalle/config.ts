// DALL-E 连接器配置

import type { ConnectorField, CardDisplayField } from '../../core'

/** DALL-E 配置字段 */
export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'https://api.openai.com/v1',
    placeholder: 'https://api.openai.com/v1',
    description: '填写 OpenAI/兼容服务的基址。连接器会根据当前模式自动拼接或切换到 /images/generations 或 /images/edits'
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
    default: 'dall-e-3',
    placeholder: 'dall-e-3',
    description: '模型名称，如 dall-e-3、dall-e-2 或其他兼容模型'
  },
  {
    key: 'apiMode',
    label: '接口模式',
    type: 'select',
    default: 'generations',
    options: [
      { label: 'generations (文生图/JSON)', value: 'generations' },
      { label: 'edits (图生图/FormData)', value: 'edits' }
    ],
    description: 'generations 使用 JSON 格式，edits 使用 multipart/form-data 上传图片'
  },
  {
    key: 'autoUseEditsForImageInput',
    label: '有图自动切 edits',
    type: 'boolean',
    default: false,
    description: '默认关闭。启用后，当用户上传参考图片时自动走 images/edits；无图片时走 images/generations'
  },
  {
    key: 'size',
    label: '图片尺寸',
    type: 'text',
    description: '常用尺寸：auto、1024x1024、1536x1024、1024x1536；旧模型也可能支持 1792x1024、1024x1792、512x512、256x256'
  },
  {
    key: 'quality',
    label: '质量',
    type: 'text',
    description: '常见值：auto、low、medium、high；旧 DALL·E 兼容服务也可能使用 standard、hd'
  },
  {
    key: 'style',
    label: '风格',
    type: 'text',
    description: 'vivid（生动）或 natural（自然），DALL-E 3 专用'
  },
  {
    key: 'n',
    label: '生成数量',
    type: 'number',
  },
  {
    key: 'background',
    label: '背景',
    type: 'select',
    default: '',
    options: [
      { label: '不设置', value: '' },
      { label: '自动 (auto)', value: 'auto' },
      { label: '不透明 (opaque)', value: 'opaque' },
      { label: '透明 (transparent)', value: 'transparent' }
    ],
    description: 'GPT Image 模型支持的背景行为，transparent 需模型与输出格式支持'
  },
  {
    key: 'outputFormat',
    label: '输出格式',
    type: 'select',
    default: '',
    options: [
      { label: '不设置', value: '' },
      { label: 'PNG', value: 'png' },
      { label: 'JPEG', value: 'jpeg' },
      { label: 'WebP', value: 'webp' }
    ],
    description: 'GPT Image 模型输出格式'
  },
  {
    key: 'outputCompression',
    label: '输出压缩率',
    type: 'number',
    description: 'JPEG/WebP 压缩率 0-100，仅在 outputFormat 为 jpeg/webp 时生效'
  },
  {
    key: 'moderation',
    label: '审核强度',
    type: 'select',
    default: '',
    options: [
      { label: '不设置', value: '' },
      { label: '自动 (auto)', value: 'auto' },
      { label: '低限制 (low)', value: 'low' }
    ],
    description: 'GPT Image 模型支持的 moderation 级别'
  },
  {
    key: 'inputFidelity',
    label: '输入保真度',
    type: 'select',
    default: '',
    options: [
      { label: '不设置', value: '' },
      { label: '高 (high)', value: 'high' },
      { label: '低 (low)', value: 'low' }
    ],
    description: 'edits 模式下控制对输入参考图的保真程度'
  },
  {
    key: 'user',
    label: '终端用户标识',
    type: 'text',
    placeholder: 'user-1234',
    description: '可选，传给 OpenAI 的 user 字段，用于滥用监控'
  },
  {
    key: 'enableImageInput',
    label: '允许图片输入',
    type: 'boolean',
    default: true,
    description: '是否允许发送参考图片。启用后会将用户上传的图片作为参考图发送给 API'
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
  { source: 'connectorConfig', key: 'size', label: '尺寸', format: 'size' }
]
