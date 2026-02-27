// ChatLuna 插件配置

import type { ConfigField, CardField } from '../../core/types'
import { promptEnhanceConfigFields, defaultPromptEnhanceConfig, type ChatLunaPromptEnhanceConfig } from './middleware'

// ============ 类型定义 ============

/**
 * 返回模式
 * - sync: 等待生成完全完成后返回
 * - async: prepare 阶段完成后返回（已创建任务、预扣费完成），后台继续生成
 */
export type ReturnMode = 'sync' | 'async'

/** 工具配置 */
export interface ToolConfig {
  /** 工具名称（英文，无空格） */
  name: string
  /** 工具描述（供 AI 理解用途） */
  description: string
  /** 是否启用 */
  enabled: boolean
  /** 返回模式：sync=等待生成完成，async=prepare完成后返回（后台生成） */
  returnMode: ReturnMode
  /** 内置渠道名（如果设置，AI 无法选择渠道） */
  builtinChannel?: string
  /** 内置预设名（如果设置，AI 无法选择预设） */
  builtinPreset?: string
}

/** 预设工具配置 */
export interface PresetToolConfig {
  /** 是否启用预设查看工具 */
  enabled: boolean
  /** 工具名称 */
  name: string
  /** 工具描述（支持 {presets} 变量） */
  description: string
}

/** 任务查询工具配置 */
export interface TaskQueryToolConfig {
  /** 是否启用内部任务查询工具 */
  enabled: boolean
  /** 工具名称 */
  name: string
  /** 默认等待超时（毫秒） */
  defaultWaitMs: number
  /** 最大允许等待超时（毫秒） */
  maxWaitMs: number
  /** 轮询间隔（毫秒） */
  pollIntervalMs: number
}

/** 插件配置 */
export interface ChatLunaPluginConfig {
  /** 是否启用工具注册 */
  enableTools: boolean
  /** 工具列表 */
  tools: ToolConfig[]
  /** 预设查看工具配置 */
  presetTool: PresetToolConfig
  /** 任务查询工具配置 */
  taskQueryTool: TaskQueryToolConfig
  /** 是否启用变量注册 */
  enableVariables: boolean
  /** 提示词润色配置 */
  promptEnhance: ChatLunaPromptEnhanceConfig
}

// ============ 连接器配置字段（渠道级） ============

export const connectorFields: ConfigField[] = [
  {
    key: 'platform',
    label: '适配器',
    type: 'select-remote',
    required: false,
    optionsSource: 'media-luna/chatluna/platforms',
    placeholder: '可选，用于筛选模型',
    description: '选择 ChatLuna 适配器来筛选模型列表'
  },
  {
    key: 'model',
    label: '模型',
    type: 'select-remote',
    required: true,
    optionsSource: 'media-luna/chatluna/models',
    dependsOn: 'platform',
    placeholder: '选择模型',
    description: '选择 ChatLuna 模型（格式: 适配器/模型名）'
  }
]

// ============ 卡片展示字段 ============

export const connectorCardFields: CardField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' }
]

// ============ 插件配置字段（显示在插件配置面板） ============

export const chatlunaConfigFields: ConfigField[] = [
  {
    key: 'enableTools',
    label: '启用工具注册',
    type: 'boolean',
    default: false,
    description: '在 ChatLuna 中注册 Media Luna 工具（供 AI 调用画图）'
  },
  {
    key: 'enableVariables',
    label: '启用变量注册',
    type: 'boolean',
    default: false,
    description: '注册预设变量，可在 ChatLuna 预设中使用 {{medialuna_channels()}}、{{medialuna_presets()}} 等'
  },
  {
    key: 'presetTool.enabled',
    label: '启用预设查看工具',
    type: 'boolean',
    default: true,
    description: '注册预设查看工具，让 AI 可以查看可用预设列表',
    showWhen: { field: 'enableTools', value: true }
  },
  {
    key: 'presetTool.name',
    label: '预设工具名称',
    type: 'text',
    default: 'list_presets',
    placeholder: 'list_presets',
    description: '预设查看工具的名称',
    showWhen: { field: 'enableTools', value: true }
  },
  {
    key: 'presetTool.description',
    label: '预设工具描述',
    type: 'textarea',
    default: 'List available presets for image generation. Available presets: {presets}',
    placeholder: '支持 {presets} 变量',
    description: '工具描述，{presets} 会被替换为所有预设名',
    showWhen: { field: 'enableTools', value: true }
  },
  {
    key: 'taskQueryTool.enabled',
    label: '启用任务查询工具',
    type: 'boolean',
    default: true,
    description: '注册任务查询工具（供 task 模式工具按 taskId 查询状态和结果）',
    showWhen: { field: 'enableTools', value: true }
  },
  {
    key: 'taskQueryTool.name',
    label: '任务查询工具名称',
    type: 'text',
    default: 'medialuna_query_tasks',
    placeholder: 'medialuna_query_tasks',
    description: '内部任务查询工具的名称（sync/task 模式会在描述里引用）',
    showWhen: { field: 'taskQueryTool.enabled', value: true }
  },
  {
    key: 'taskQueryTool.defaultWaitMs',
    label: '默认等待超时(ms)',
    type: 'number',
    default: 300000,
    description: '任务查询工具默认等待时间（0=单次快照）。默认 300000（5 分钟）',
    showWhen: { field: 'taskQueryTool.enabled', value: true }
  },
  {
    key: 'taskQueryTool.maxWaitMs',
    label: '最大等待超时(ms)',
    type: 'number',
    default: 300000,
    description: '任务查询工具允许的最大等待时间，避免过长阻塞',
    showWhen: { field: 'taskQueryTool.enabled', value: true }
  },
  {
    key: 'taskQueryTool.pollIntervalMs',
    label: '轮询间隔(ms)',
    type: 'number',
    default: 400,
    description: '任务查询轮询间隔，越小实时性越好但数据库压力更高',
    showWhen: { field: 'taskQueryTool.enabled', value: true }
  },
  {
    key: 'tools',
    label: '画图工具列表',
    type: 'table',
    default: [],
    description: '注册到 ChatLuna 的画图工具列表',
    showWhen: { field: 'enableTools', value: true },
    columns: [
      {
        key: 'enabled',
        label: '启用',
        type: 'boolean',
        width: '60px'
      },
      {
        key: 'name',
        label: '工具名称',
        type: 'text',
        required: true,
        placeholder: 'draw_image',
        width: '120px'
      },
      {
        key: 'description',
        label: '描述',
        type: 'text',
        required: true,
        placeholder: '供 AI 理解工具用途'
      },
      {
        key: 'returnMode',
        label: '返回模式',
        type: 'select',
        options: [
          { label: '任务模式（立即返回 taskId，需查询）', value: 'sync' },
          { label: '异步（后台生成）', value: 'async' }
        ],
        width: '140px'
      },
      {
        key: 'builtinChannel',
        label: '内置渠道',
        type: 'text',
        placeholder: '留空=AI选择',
        width: '120px'
      },
      {
        key: 'builtinPreset',
        label: '内置预设',
        type: 'text',
        placeholder: '留空=AI选择',
        width: '120px'
      }
    ],
    tableConfig: {
      maxRows: 20,
      titleColumn: 'name',
      subtitleColumn: 'description'
    }
  },
  // 提示词润色配置字段（带前缀）
  ...promptEnhanceConfigFields.map(field => ({
    ...field,
    key: `promptEnhance.${field.key}`,
    showWhen: field.showWhen
      ? { field: `promptEnhance.${field.showWhen.field}`, value: field.showWhen.value }
      : undefined,
    dependsOn: (field as any).dependsOn
      ? `promptEnhance.${(field as any).dependsOn}`
      : undefined
  }))
]

// ============ 默认配置 ============

/** 默认画图工具 */
export const defaultToolConfig: ToolConfig = {
  name: 'draw',
  description: 'Generate images based on text prompts. Supports various styles and presets.',
  enabled: true,
  returnMode: 'async'
}

export const defaultConfig: ChatLunaPluginConfig = {
  enableTools: false,
  tools: [defaultToolConfig],
  presetTool: {
    enabled: true,
    name: 'list_presets',
    description: 'List available presets for image generation. Available presets: {presets}'
  },
  taskQueryTool: {
    enabled: true,
    name: 'medialuna_query_tasks',
    defaultWaitMs: 300000,
    maxWaitMs: 300000,
    pollIntervalMs: 400
  },
  enableVariables: false,
  promptEnhance: defaultPromptEnhanceConfig
}
