import type { ConfigField } from '../../core/types'

export interface VideoDurationEnhancerConfig {
  matchChannelTags: string
  minSeconds: number
  maxSeconds: number
  removeDurationFromPrompt: boolean
  writeSecondsParameter: boolean
  writeDurationParameter: boolean
}

export const defaultVideoDurationEnhancerConfig: VideoDurationEnhancerConfig = {
  matchChannelTags: 'text2video,img2video',
  minSeconds: 1,
  maxSeconds: 0,
  removeDurationFromPrompt: true,
  writeSecondsParameter: true,
  writeDurationParameter: true
}

export const videoDurationEnhancerConfigFields: ConfigField[] = [
  {
    key: 'matchChannelTags',
    label: '匹配渠道标签',
    type: 'text',
    default: 'text2video,img2video',
    description: '只有渠道包含这些标签时才解析时长，多个标签用逗号分隔；留空则对所有渠道生效'
  },
  {
    key: 'minSeconds',
    label: '最小时长（秒）',
    type: 'number',
    default: 1,
    description: '解析出的时长不会低于该值'
  },
  {
    key: 'maxSeconds',
    label: '最大时长（秒）',
    type: 'number',
    default: 0,
    description: '大于 0 时限制最大时长；填 0 表示不限制'
  },
  {
    key: 'removeDurationFromPrompt',
    label: '移除提示词时长标记',
    type: 'boolean',
    default: true,
    description: '解析到 5s、5S、5秒 等标记后，从 prompt 中移除该片段'
  },
  {
    key: 'writeSecondsParameter',
    label: '写入 seconds 参数',
    type: 'boolean',
    default: true,
    description: '将解析出的时长写入 parameters.seconds，供 OpenAI/Sora 类连接器使用'
  },
  {
    key: 'writeDurationParameter',
    label: '写入 duration 参数',
    type: 'boolean',
    default: true,
    description: '将解析出的时长写入 parameters.duration，供 NewAPI 等连接器使用'
  }
]
