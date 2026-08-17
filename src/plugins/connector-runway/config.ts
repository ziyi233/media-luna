// Runway 连接器配置

import type { ConnectorField, CardDisplayField } from '../../core'

/** Runway 配置字段 */
export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'https://api.dev.runwayml.com/v1',
    placeholder: 'https://api.dev.runwayml.com/v1',
    description: 'Runway API 基础地址'
  },
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true
  },
  {
    key: 'apiVersion',
    label: 'API Version',
    type: 'text',
    default: '2024-11-06'
  },
  {
    key: 'mode',
    label: '默认模式',
    type: 'select',
    default: 'auto',
    options: [
      { label: '自动', value: 'auto' },
      { label: '文生视频', value: 'text' },
      { label: '图生视频', value: 'image' }
    ]
  },
  {
    key: 'model',
    label: '模型',
    type: 'text',
    required: true,
    default: 'gen4.5',
    placeholder: 'gen4.5',
    description: '模型名称'
  },
  {
    key: 'duration',
    label: '时长 (秒)',
    type: 'number',
    default: 5,
    description: '生成视频的时长'
  },
  {
    key: 'aspectRatio',
    label: '宽高比',
    type: 'select',
    options: [
      { label: '16:9', value: '16:9' },
      { label: '9:16', value: '9:16' },
      { label: '1:1', value: '1:1' }
    ]
  },
  {
    key: 'seed',
    label: '种子',
    type: 'number',
    placeholder: '留空随机'
  },
  {
    key: 'pollInterval',
    label: 'Poll interval (ms)',
    type: 'number',
    default: 5000
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 600 // 视频生成很慢
  }
]

/** 卡片展示字段 */
export const connectorCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'duration', label: '时长' }
]
