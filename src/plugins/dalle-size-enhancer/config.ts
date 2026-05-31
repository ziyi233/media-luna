import type { ConfigField } from '../../core/types'

export interface DalleSizeEnhancerConfig {
  matchChannelTags: string
  maxWidth: number
  maxHeight: number
  minWidth: number
  minHeight: number
  roundTo: number
  maxAspectRatio: number
  minTotalPixels: number
  maxTotalPixels: number
  removeSizeFromPrompt: boolean
  autoFromFirstImage: boolean
}

export const defaultDalleSizeEnhancerConfig: DalleSizeEnhancerConfig = {
  matchChannelTags: 'text2img,img2img',
  maxWidth: 1536,
  maxHeight: 1536,
  minWidth: 64,
  minHeight: 64,
  roundTo: 1,
  maxAspectRatio: 0,
  minTotalPixels: 0,
  maxTotalPixels: 0,
  removeSizeFromPrompt: true,
  autoFromFirstImage: false
}

export const dalleSizeEnhancerConfigFields: ConfigField[] = [
  {
    key: 'matchChannelTags',
    label: '匹配渠道标签',
    type: 'text',
    default: 'text2img,img2img',
    description: '只有渠道包含这些标签时才会增强 size，多个标签用逗号分隔；留空则对所有渠道生效'
  },
  {
    key: 'maxWidth',
    label: '最大宽度',
    type: 'number',
    default: 1536,
    description: '解析比例或图片尺寸时使用的最大宽度像素'
  },
  {
    key: 'maxHeight',
    label: '最大高度',
    type: 'number',
    default: 1536,
    description: '解析比例或图片尺寸时使用的最大高度像素'
  },
  {
    key: 'minWidth',
    label: '最小宽度',
    type: 'number',
    default: 64,
    description: '解析出的宽度不会低于该值'
  },
  {
    key: 'minHeight',
    label: '最小高度',
    type: 'number',
    default: 64,
    description: '解析出的高度不会低于该值'
  },
  {
    key: 'roundTo',
    label: '尺寸取整步进',
    type: 'number',
    default: 1,
    description: '将尺寸取整到指定倍数；填 1 表示不做步进约束，GPT Image 需要 16 的倍数时可填 16'
  },
  {
    key: 'maxAspectRatio',
    label: '最大长短边比例',
    type: 'number',
    default: 0,
    description: '可选约束。大于 0 时限制长边/短边比例，例如 GPT Image 可填 3；填 0 表示不限制'
  },
  {
    key: 'minTotalPixels',
    label: '最小总像素',
    type: 'number',
    default: 0,
    description: '可选约束。大于 0 时，总像素不会低于该值；填 0 表示不限制'
  },
  {
    key: 'maxTotalPixels',
    label: '最大总像素',
    type: 'number',
    default: 0,
    description: '可选约束。大于 0 时，总像素不会高于该值；填 0 表示不限制'
  },
  {
    key: 'removeSizeFromPrompt',
    label: '移除提示词尺寸标记',
    type: 'boolean',
    default: true,
    description: '解析到 16:9、1080x1080 等尺寸标记后，从 prompt 中移除该片段'
  },
  {
    key: 'autoFromFirstImage',
    label: '无尺寸时按首图推导',
    type: 'boolean',
    default: false,
    description: '用户未指定尺寸时，读取第一张输入图的宽高比，并按最大宽高等比生成 size'
  }
]
