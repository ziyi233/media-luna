// Koishi 指令配置

import type { ConfigField } from '../../types'

/** Koishi 指令插件配置 */
export interface KoishiCommandsConfig {
  /** 是否启用指令注册 */
  enabled: boolean
  /** 预设列表指令名称 */
  presetsCommand: string
  /** 预设详情指令名称 */
  presetCommand: string
  /** 严格标签匹配：预设标签必须匹配渠道标签才能使用 */
  strictTagMatch: boolean
  /** 确认超时时间（秒） */
  confirmTimeout: number
}

/** 默认配置 */
export const defaultKoishiCommandsConfig: KoishiCommandsConfig = {
  enabled: true,
  presetsCommand: 'presets',
  presetCommand: 'preset',
  strictTagMatch: true,
  confirmTimeout: 30
}

/** 配置字段定义 */
export const koishiCommandsConfigFields: ConfigField[] = [
  {
    key: 'enabled',
    label: '启用指令',
    type: 'boolean',
    default: true,
    description: '是否启用 Koishi 聊天指令（渠道名.预设名）'
  },
  {
    key: 'presetsCommand',
    label: '预设列表指令',
    type: 'text',
    default: 'presets',
    description: '查看预设列表的指令名称'
  },
  {
    key: 'presetCommand',
    label: '预设详情指令',
    type: 'text',
    default: 'preset',
    description: '查看预设详情的指令名称'
  },
  {
    key: 'strictTagMatch',
    label: '严格标签匹配',
    type: 'boolean',
    default: true,
    description: '启用后，预设标签必须匹配渠道标签才能使用，否则需要用户确认'
  },
  {
    key: 'confirmTimeout',
    label: '确认超时（秒）',
    type: 'number',
    default: 30,
    description: '用户确认操作的超时时间'
  }
]
