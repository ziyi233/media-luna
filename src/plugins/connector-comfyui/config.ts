// ComfyUI 连接器配置

import type { ConnectorField, CardDisplayField } from '../../core'

/** ComfyUI 配置字段 */
export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API URL',
    type: 'text',
    required: true,
    default: 'http://127.0.0.1:8188',
    placeholder: 'http://127.0.0.1:8188',
    description: 'ComfyUI 服务地址（不含末尾斜杠）'
  },
  {
    key: 'isSecureConnection',
    label: '使用安全连接',
    type: 'boolean',
    default: false,
    description: '启用后使用 HTTPS/WSS 连接（适用于反向代理等场景）'
  },
  {
    key: 'workflow',
    label: '默认工作流 (JSON)',
    type: 'textarea',
    description: '工作流 JSON（从 ComfyUI 导出的 API 格式）。使用 {{prompt}} 作为提示词占位符',
    default: ''
  },
  {
    key: 'promptNodeId',
    label: 'Prompt 节点 ID（可选）',
    type: 'text',
    default: '',
    description: '如不使用 {{prompt}} 占位符，指定 CLIPTextEncode 节点 ID'
  },
  {
    key: 'imageCount',
    label: '接受图片数量',
    type: 'number',
    default: 1,
    description: '该工作流接受的图片数量 (0-3)'
  },
  {
    key: 'imageNodeId1',
    label: '图片1 输入节点 ID（可选）',
    type: 'text',
    default: '',
    description: '第一张图片的 LoadImage 节点 ID'
  },
  {
    key: 'imageNodeId2',
    label: '图片2 输入节点 ID（可选）',
    type: 'text',
    default: '',
    description: '第二张图片的 LoadImage 节点 ID'
  },
  {
    key: 'imageNodeId3',
    label: '图片3 输入节点 ID（可选）',
    type: 'text',
    default: '',
    description: '第三张图片的 LoadImage 节点 ID'
  },
  {
    key: 'avoidCache',
    label: '避免缓存',
    type: 'boolean',
    default: true,
    description: '自动随机化所有 seed/noise_seed 参数，避免重复结果'
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 300,
    description: '工作流执行超时时间'
  }
]

/** 卡片展示字段 */
export const connectorCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'apiUrl', label: '节点' }
]
