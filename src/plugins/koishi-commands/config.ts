// Koishi 聊天指令配置

import type { ConfigField } from '../../types'

/** Koishi 聊天指令插件配置 */
export interface KoishiCommandsConfig {
  /** 是否启用指令注册 */
  enabled: boolean
  /** 我的记录默认显示数量 */
  myTasksDefaultCount: number
  /** 收集模式超时时间（秒） */
  collectTimeout: number
  /** 直接触发所需的最小图片数量 */
  directTriggerImageCount: number
  /** 是否启用链接模式（特定标签渠道输出链接而不是发图） */
  linkModeEnabled: boolean
  /** 触发链接模式的渠道标签（逗号分隔，如 nsfw,r18） */
  linkModeTags: string
  /** 是否输出文本内容 */
  outputTextContent: boolean
  /** 是否使用 NapCat/OneBot 的 get_file API 获取视频链接（修复 QQ 视频本地路径问题） */
  useNapCatFileApi: boolean
}

/** 默认配置 */
export const defaultKoishiCommandsConfig: KoishiCommandsConfig = {
  enabled: true,
  myTasksDefaultCount: 5,
  collectTimeout: 120,
  directTriggerImageCount: 2,
  linkModeEnabled: false,
  linkModeTags: 'nsfw',
  outputTextContent: false,
  useNapCatFileApi: false
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
    key: 'myTasksDefaultCount',
    label: '默认显示数量',
    type: 'number',
    default: 5,
    description: '我的记录指令默认显示的任务数量'
  },
  {
    key: 'collectTimeout',
    label: '收集超时（秒）',
    type: 'number',
    default: 120,
    description: '收集模式下等待用户输入的超时时间'
  },
  {
    key: 'directTriggerImageCount',
    label: '直接触发图片数',
    type: 'number',
    default: 2,
    description: '图片数量达到此值时直接触发生成，否则进入收集模式'
  },
  {
    key: 'linkModeEnabled',
    label: '链接模式',
    type: 'boolean',
    default: false,
    description: '启用后，带有指定标签的渠道将输出链接而不是直接发图'
  },
  {
    key: 'linkModeTags',
    label: '链接模式标签',
    type: 'text',
    default: 'nsfw',
    description: '触发链接模式的渠道标签，多个标签用逗号分隔（如 nsfw,r18）'
  },
  {
    key: 'outputTextContent',
    label: '输出文本内容',
    type: 'boolean',
    default: false,
    description: '是否输出 API 返回的文本内容（如思考过程、模型回复等）'
  },
  {
    key: 'useNapCatFileApi',
    label: '使用 NapCat 文件 API',
    type: 'boolean',
    default: false,
    description: '针对 QQ 平台（NapCat/OneBot）：尝试调用 internal.get_file 获取视频真实链接。仅在视频无法正常获取时开启。'
  }
]
