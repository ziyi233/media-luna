// NovelAI 连接器配置
//
// 字段与默认值的事实来源（官方 OpenAPI 只描述类型、不含 V5 语义）：
//   - 官方规范化文档：https://image.novelai.net/docs/doc.json
//   - 官方文档站：https://docs.novelai.net/en/image/
//   - 社区实测：dev.to/ilan_kim 的 V5 请求体与 Anlas 实测
//   - 社区实现：koishi-plugin-hhs-huatu（Koishi 侧，纯 JSON 请求）、Aaalice_NAI_Launcher（V5 能力表）
// 关键结论：V5 用 params_version=4 且必须发 v4_prompt/v4_negative_prompt（缺一则 500）；
// V5 目前未提供氛围参考（Vibe Transfer）与角色参考（Precise Reference），故按模型能力门控。

import type { ConnectorField, CardDisplayField } from '../../core'

/** 参考图用途 */
export type ReferenceMode = 'vibe' | 'character' | 'off'

/**
 * 生成前确认策略：
 * `on` = 模式 1（默认），先估价、回复确认才生成；`off` = 模式 2，直接生成。
 * 估价来源按端点能力决定，与站点无关：官方端点用本地 Anlas 公式，
 * 其它端点若实现计费扩展端点就读真值，否则只报参数不报价。
 */
export type ConfirmMode = 'on' | 'off'

/** 模型能力档案：同时驱动默认值、能力门控与 Anlas 估算 */
export interface NovelAIModelProfile {
  /** NAI 模型 id */
  id: string
  /** 选择器显示名 */
  label: string
  /** 官方参数协议版本：V5 = 4，V4 系 = 3 */
  paramsVersion: number
  /** 默认步数 */
  steps: number
  /** 默认 CFG（官方称 Prompt Guidance） */
  scale: number
  /** 默认质量词，拼在用户提示词之前 */
  qualityPrompt: string
  /** 是否支持氛围参考 */
  vibe: boolean
  /** 是否支持角色参考 */
  characterReference: boolean
  /** 多角色上限 */
  maxCharacters: number
  /** Anlas 倍率（V5 = 1.5） */
  anlasMultiplier: number
  /** 步数成本系数（Medium Effort = 1 / 1.06521739） */
  stepCostFactor: number
  /** 是否支持 cfg_rescale（Medium Effort 不支持） */
  cfgRescale: boolean
  /** 是否支持 straight_alpha（V5 的透明通道；V4 系中转会拒收） */
  straightAlpha: boolean
  /** 固定参数（Medium Effort 强制） */
  fixed?: { steps: number, sampler: string }
}

/** 默认模型 */
export const DEFAULT_MODEL_ID = 'nai-diffusion-5-full'

/** 官方图像接口地址 */
export const OFFICIAL_API_URL = 'https://image.novelai.net'

/** 默认分辨率（官方九档的第一档：小图竖幅） */
export const DEFAULT_RESOLUTION = '512x768'

/** 默认尺寸（同上） */
export const DEFAULT_SIZE = { width: 512, height: 768 }

/** 可选模型与各自默认值 */
export const NOVELAI_MODELS: NovelAIModelProfile[] = [
  {
    id: 'nai-diffusion-5-full',
    label: 'V5 Full',
    paramsVersion: 4,
    steps: 28,
    scale: 4,
    qualityPrompt: 'very aesthetic, masterpiece, no text',
    vibe: false,
    characterReference: false,
    maxCharacters: 22,
    anlasMultiplier: 1.5,
    stepCostFactor: 1,
    cfgRescale: true,
    straightAlpha: true
  },
  {
    id: 'nai-diffusion-5-full-medium',
    label: 'V5 Full (Medium Effort)',
    paramsVersion: 4,
    steps: 14,
    scale: 4,
    qualityPrompt: 'very aesthetic, masterpiece, no text',
    vibe: false,
    characterReference: false,
    maxCharacters: 22,
    anlasMultiplier: 1.5,
    stepCostFactor: 1 / 1.06521739,
    cfgRescale: false,
    straightAlpha: true,
    fixed: { steps: 14, sampler: 'k_euler_ancestral' }
  },
  {
    id: 'nai-diffusion-5-curated',
    label: 'V5 Curated',
    paramsVersion: 4,
    steps: 28,
    scale: 4,
    qualityPrompt: 'very aesthetic, masterpiece, no text',
    vibe: false,
    characterReference: false,
    maxCharacters: 22,
    anlasMultiplier: 1.5,
    stepCostFactor: 1,
    cfgRescale: true,
    straightAlpha: true
  },
  {
    id: 'nai-diffusion-4-5-full',
    label: 'V4.5 Full',
    paramsVersion: 3,
    steps: 23,
    scale: 5,
    qualityPrompt: 'location, very aesthetic, masterpiece, no text',
    vibe: true,
    characterReference: true,
    maxCharacters: 6,
    anlasMultiplier: 1,
    stepCostFactor: 1,
    cfgRescale: true,
    straightAlpha: false
  },
  {
    id: 'nai-diffusion-4-5-curated',
    label: 'V4.5 Curated',
    paramsVersion: 3,
    steps: 23,
    scale: 5,
    qualityPrompt: 'location, masterpiece, no text, -0.8::feet::, rating:general',
    vibe: true,
    characterReference: true,
    maxCharacters: 6,
    anlasMultiplier: 1,
    stepCostFactor: 1,
    cfgRescale: true,
    straightAlpha: false
  },
  {
    id: 'nai-diffusion-4-full',
    label: 'V4 Full',
    paramsVersion: 3,
    steps: 23,
    scale: 5.5,
    qualityPrompt: 'no text, best quality, very aesthetic, absurdres',
    vibe: true,
    characterReference: false,
    maxCharacters: 6,
    anlasMultiplier: 1,
    stepCostFactor: 1,
    cfgRescale: true,
    straightAlpha: false
  },
  {
    id: 'nai-diffusion-4-curated',
    label: 'V4 Curated',
    paramsVersion: 3,
    steps: 23,
    scale: 5.5,
    qualityPrompt: 'rating:general, amazing quality, very aesthetic, absurdres',
    vibe: true,
    characterReference: false,
    maxCharacters: 6,
    anlasMultiplier: 1,
    stepCostFactor: 1,
    cfgRescale: true,
    straightAlpha: false
  }
]

/** 采样器（V5 感知实现共有的 7 个；V4 起不支持 DDIM，会回退 k_euler_ancestral） */
export const SAMPLERS = [
  'k_euler_ancestral',
  'k_euler',
  'k_dpmpp_2m',
  'k_dpmpp_2m_sde',
  'k_dpmpp_2s_ancestral',
  'k_dpmpp_sde',
  'ddim_v3'
]

/** 默认采样器 */
export const DEFAULT_SAMPLER = 'k_euler_ancestral'

/**
 * 采样器序号与社区简称 → NAI 参数。
 * 数字方便手机上盲敲；`ea/2msde/…` 与 NAI 教程一致；空串表示回到模型默认。
 */
export const SAMPLER_ALIASES = new Map<string, string>([
  ['1', 'k_euler_ancestral'],
  ['ea', 'k_euler_ancestral'],
  ['2', 'k_euler'],
  ['euler', 'k_euler'],
  ['3', 'k_dpmpp_2m'],
  ['2m', 'k_dpmpp_2m'],
  ['4', 'k_dpmpp_2m_sde'],
  ['2msde', 'k_dpmpp_2m_sde'],
  ['5', 'k_dpmpp_2s_ancestral'],
  ['2sa', 'k_dpmpp_2s_ancestral'],
  ['6', 'k_dpmpp_sde'],
  ['sde', 'k_dpmpp_sde'],
  ['7', 'ddim_v3'],
  ['ddim', 'ddim_v3'],
  ['default', ''],
  ['默认', '']
])

/** 把别名/序号规范化成 NAI 采样器 id；无法识别返回 undefined，空串表示回到默认 */
export function normalizeSampler(raw: string): string | undefined {
  const key = raw.toLowerCase()
  if (SAMPLER_ALIASES.has(key)) return SAMPLER_ALIASES.get(key)
  if (SAMPLER_ALIASES.has(raw)) return SAMPLER_ALIASES.get(raw)
  return SAMPLERS.find(sampler => sampler.toLowerCase() === key)
}

/** 噪声调度器（native 仅 legacy 结构可用，V4 起一律 karras，故不提供） */
export const NOISE_SCHEDULES = ['karras', 'exponential', 'polyexponential']

/** UC 预设：旧整数字段、V5 字符串字段与 tag 提示三套编号并存（社区实测） */
export const UC_PRESETS: Record<string, { label: string, legacy: number, hint: number }> = {
  heavy: { label: 'Heavy', legacy: 0, hint: 2 },
  light: { label: 'Light', legacy: 1, hint: 3 },
  humanFocus: { label: 'Human Focus', legacy: 2, hint: 4 },
  none: { label: 'None', legacy: 3, hint: 0 },
  furryFocus: { label: 'Furry Focus', legacy: 7, hint: 5 }
}

/**
 * 可选尺寸：与 NovelAI 官方客户端一致的三档九种（小/普通/大 × 竖幅/横幅/方形）。
 * 顺序即下拉顺序，第一项（小图竖幅）是默认值。
 */
export const SIZE_PRESETS: ReadonlyArray<{ size: string, label: string }> = [
  { size: '512x768', label: '小图竖幅 512×768' },
  { size: '768x512', label: '小图横幅 768×512' },
  { size: '640x640', label: '小图方形 640×640' },
  { size: '832x1216', label: '普通竖幅 832×1216' },
  { size: '1216x832', label: '普通横幅 1216×832' },
  { size: '1024x1024', label: '普通方形 1024×1024' },
  { size: '1024x1536', label: '大图竖幅 1024×1536' },
  { size: '1536x1024', label: '大图横幅 1536×1024' },
  { size: '1472x1472', label: '大图方形 1472×1472' }
]

/**
 * 尺寸词表：比例、中文短词与官方档位名（像素串另由 parseSizeText 处理）。
 * 命令正文的免前缀词、`-z` 的取值、渠道配置都走这一份，避免三处各写一套。
 * 比例是近似值（NAI 只接受 64 的倍数），取该比例的普通档；官方下拉里没有的档位（3:4 等）仍可在这里用。
 */
export const SIZE_WORDS: Record<string, string | undefined> = {
  '1:1': '1024x1024',
  '2:3': '832x1216',
  '3:2': '1216x832',
  '3:4': '960x1280',
  '4:3': '1280x960',
  '9:16': '768x1344',
  '16:9': '1344x768',
  竖: '832x1216',
  竖屏: '832x1216',
  竖图: '832x1216',
  横: '1216x832',
  横屏: '1216x832',
  横图: '1216x832',
  方: '1024x1024',
  方图: '1024x1024',
  方形: '1024x1024',
  大竖: '1024x1536',
  大竖屏: '1024x1536',
  大横: '1536x1024',
  大横屏: '1536x1024',
  小图竖幅: '512x768',
  小图横幅: '768x512',
  小图方形: '640x640',
  普通竖幅: '832x1216',
  普通横幅: '1216x832',
  普通方形: '1024x1024',
  大图竖幅: '1024x1536',
  大图横幅: '1536x1024',
  大图方形: '1472x1472'
}

/** 查尺寸词：大小写不敏感，并剥掉粘贴常见的首尾引号/括号/标点 */
export function lookupSizeWord(raw: string): string | undefined {
  const trimmed = String(raw ?? '')
    .trim()
    .replace(/^["'“”‘’([（【]+/, '')
    .replace(/["'“”‘’)\]）】,，。;；、]+$/, '')
  if (!trimmed) return undefined
  return SIZE_WORDS[trimmed] ?? SIZE_WORDS[trimmed.toLowerCase()]
}

/** 尺寸必须为 64 的倍数 */
export const SIZE_STEP = 64

/** 单边尺寸上下限 */
export const MIN_SIDE = 64
export const MAX_SIDE = 2048

/** NAI 侧像素上限，超过会被服务端拒绝 */
export const MAX_PIXELS = 3211264

/** Opus 免费带：单图 + 面积 ≤ 1048576 + 步数 ≤ 28 */
export const OPUS_FREE_MAX_PIXELS = 1048576
export const OPUS_FREE_MAX_STEPS = 28

/** Anlas 公式系数（官方前端抽取，实测两点吻合） */
export const ANLAS_AREA_COEFFICIENT = 2.951823174884865e-6
export const ANLAS_STEP_AREA_COEFFICIENT = 5.753298233447344e-7

/** 单张 Anlas 上限，超过即无法估价 */
export const MAX_ANLAS_PER_SAMPLE = 140

/** 氛围参考编码：每张 2 Anlas，超过 4 张每张再 +2 */
export const VIBE_ENCODE_COST = 2
export const VIBE_FREE_COUNT = 4

/** 单次请求最多几张氛围参考 */
export const MAX_VIBE_IMAGES = 16

/** 单次请求最多几张角色参考 */
export const MAX_CHARACTER_REFERENCE_IMAGES = 6

/** 角色参考每张 +5 Anlas */
export const CHARACTER_REFERENCE_COST = 5

/** 渠道配置字段 */
export const connectorFields: ConnectorField[] = [
  {
    key: 'apiUrl',
    label: 'API 地址',
    type: 'text',
    required: true,
    default: OFFICIAL_API_URL,
    placeholder: OFFICIAL_API_URL,
    description: '图像生成端点。任何 NovelAI 兼容服务都可以填在这里；若该端点实现 GET /api/connection 与 POST /api/billing，会读取真实余额与整单报价'
  },
  {
    key: 'apiToken',
    label: 'API Token',
    type: 'password',
    required: true,
    description: '官方填 pst- 开头的 Persistent Token；兼容端点填它签发的 Key。不要在日志或截图里传播'
  },
  {
    key: 'model',
    label: '模型',
    type: 'select',
    default: DEFAULT_MODEL_ID,
    options: NOVELAI_MODELS.map(m => ({ label: m.label, value: m.id })),
    description: '切换模型会改变默认步数/CFG/质量词，并决定是否支持氛围参考与角色参考'
  },
  {
    key: 'resolution',
    label: '分辨率',
    type: 'select',
    default: DEFAULT_RESOLUTION,
    options: [
      ...SIZE_PRESETS.map(preset => ({ label: preset.label, value: preset.size })),
      { label: '自定义（见下方尺寸）', value: 'custom' }
    ],
    description: '与 NovelAI 官方客户端一致的九档（小/普通/大 × 竖幅/横幅/方形），默认第一档小图竖幅。宽度与高度都必须是 64 的倍数（超限会自动缩放）。聊天里也可直接写档位名、比例（1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 9:16 / 16:9）或像素（1024x1536），或写成参数 -z（-z 2:3 / -z 大图横幅 / -z 1088x1920）'
  },
  {
    key: 'transparent',
    label: '透明通道',
    type: 'boolean',
    default: false,
    description: '仅 V5 系（Full / Medium / Curated）支持：出图为透明背景 PNG。V4 系模型不收该字段，选了也不会下发；聊天里可用「透明 / 不透明」临时切换'
  },
  {
    key: 'confirmBefore',
    label: '生成前确认',
    type: 'select',
    default: 'on',
    options: [
      { label: '模式 1 · 先估价再确认（回复「确认」/「y」才出图）', value: 'on' },
      { label: '模式 2 · 直接生成（出图后只报消耗）', value: 'off' }
    ],
    description: '模式 1 会在出图前先回一条估价并等 60 秒：官方端点用本地 Anlas 公式（官方 API 没有询价端点），实现了计费扩展端点的兼容服务读真实报价与余额，其它端点只回参数不报价；回复其它内容或超时视为放弃、不消耗。确认只拦聊天命令，WebUI 与控制台不受影响，会话不支持等待回复时直接放行'
  },
  {
    key: 'customSize',
    label: '自定义尺寸',
    type: 'text',
    placeholder: '1088x1920',
    showWhen: { field: 'resolution', value: 'custom' },
    description: '格式 宽x高，例如 1088x1920'
  },
  {
    key: 'promptPrefixMode',
    label: '提示词前缀',
    type: 'select',
    default: 'off',
    options: [
      { label: '不注入（默认）', value: 'off' },
      { label: '模型推荐质量词', value: 'recommended' },
      { label: '自定义', value: 'custom' }
    ],
    description: '拼在用户提示词之前的内容。默认不注入：主词与角色词共享 512 token 预算，自带质量词的配方会被多出来的前缀挤爆'
  },
  {
    key: 'promptPrefix',
    label: '自定义前缀内容',
    type: 'textarea',
    showWhen: { field: 'promptPrefixMode', value: 'custom' },
    placeholder: 'quality tags, very aesthetic, masterpiece',
    description: '仅「自定义」时生效，原样拼在用户提示词之前'
  },
  {
    key: 'negativePrompt',
    label: '负面提示词',
    type: 'textarea',
    description: '除 UC 预设外的额外负面词，会同时写入 v4_negative_prompt'
  },
  {
    key: 'ucPreset',
    label: 'UC 预设',
    type: 'select',
    default: 'heavy',
    options: Object.entries(UC_PRESETS).map(([value, meta]) => ({ label: meta.label, value })),
    description: '服务端负面词预设。同时按旧整数、V5 字符串与 tag 提示三套字段下发'
  },
  {
    key: 'steps',
    label: '步数',
    type: 'number',
    placeholder: '0 = 跟随模型默认',
    description: '0 表示跟随模型默认（V5 为 28）。Opus 免费带要求 ≤ 28'
  },
  {
    key: 'scale',
    label: 'CFG',
    type: 'number',
    placeholder: '0 = 跟随模型默认',
    description: '官方称 Prompt Guidance。0 表示跟随模型默认（V5 为 4）'
  },
  {
    key: 'sampler',
    label: '采样器',
    type: 'select',
    default: '',
    options: [{ label: '跟随模型默认', value: '' }, ...SAMPLERS.map(s => ({ label: s, value: s }))],
    description: 'V5 Medium Effort 固定 k_euler_ancestral，不受此项影响'
  },
  {
    key: 'noiseSchedule',
    label: '噪声调度器',
    type: 'select',
    default: 'karras',
    options: NOISE_SCHEDULES.map(s => ({ label: s, value: s }))
  },
  {
    key: 'cfgRescale',
    label: 'CFG Rescale',
    type: 'number',
    default: 0,
    description: 'V5 Medium Effort 不支持该参数，会被跳过'
  },
  {
    key: 'seed',
    label: '种子',
    type: 'number',
    placeholder: '留空随机',
    description: '留空或 -1 为随机（与其他连接器一致）。实际种子写在回执与任务详情里；聊天里可用「种子 12345」临时指定，但不能「记住」'
  },
  {
    key: 'referenceMode',
    label: '参考图模式',
    type: 'select',
    default: 'vibe',
    options: [
      { label: '氛围参考（Vibe Transfer）', value: 'vibe' },
      { label: '角色参考（仅 V4.5）', value: 'character' },
      { label: '不使用参考图', value: 'off' }
    ],
    description: '随消息发送的图片按此模式使用。模型不支持时会直接报错，不会静默丢弃图片'
  },
  {
    key: 'referenceStrength',
    label: '参考强度',
    type: 'number',
    default: 0.6,
    description: '0~1，氛围参考与角色参考共用'
  },
  {
    key: 'referenceFidelity',
    label: '角色参考保真度',
    type: 'number',
    default: 1,
    showWhen: { field: 'referenceMode', value: 'character' },
    description: '0~1，原样写入 director_reference_secondary_strength_values'
  },
  {
    key: 'characters',
    label: '角色位置',
    type: 'table',
    default: [],
    description: '多角色提示词与位置控制。位置填 A1~E5 网格或 0.25,0.7 连续坐标；留空表示不启用坐标（角色词对整图生效，等价于 NAI 元数据的 use_coords:false）',
    columns: [
      { key: 'prompt', label: '角色提示词', type: 'text', required: true, placeholder: 'girl, purple eyes' },
      { key: 'position', label: '位置', type: 'text', placeholder: 'A1 / 0.25,0.7', width: '140px' },
      { key: 'uc', label: '角色负面词', type: 'text', placeholder: '可留空', width: '200px' }
    ],
    tableConfig: {
      enableImport: true,
      enableExport: true,
      enableBatchDelete: true,
      enableSelection: true
    }
  },
  {
    key: 'showAnlasCost',
    label: '显示生效值与消耗',
    type: 'boolean',
    default: true,
    description: '生成前回显生效值及其来源（本条/预设/记住/渠道）与预计 Anlas，生成后回报实际种子'
  },
  {
    key: 'timeout',
    label: '超时时间（秒）',
    type: 'number',
    default: 300,
    description: 'NovelAI 出图通常 10~40 秒，排队时更久'
  }
]

/** 渠道卡片展示字段 */
export const connectorCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'resolution', label: '分辨率' },
  { source: 'connectorConfig', key: 'steps', label: '步数' },
  { source: 'connectorConfig', key: 'scale', label: 'CFG' }
]

/** 按模型 id 取能力档案，未知 id 退化为 V5 Full */
export function getModelProfile(modelId: string): NovelAIModelProfile {
  return NOVELAI_MODELS.find(m => m.id === modelId)
    ?? NOVELAI_MODELS.find(m => m.id === DEFAULT_MODEL_ID)!
}
