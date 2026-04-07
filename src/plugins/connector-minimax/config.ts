// MiniMax T2A 连接器配置

import type { ConnectorField, CardDisplayField } from '../../core'

/** 中文音色预设 */
const chineseVoiceOptions = [
  // 基础中文音色
  { value: 'male-qn-qingse', label: '青涩青年音色', group: '基础男声' },
  { value: 'male-qn-jingying', label: '精英青年音色', group: '基础男声' },
  { value: 'male-qn-badao', label: '霸道青年音色', group: '基础男声' },
  { value: 'male-qn-daxuesheng', label: '青年大学生音色', group: '基础男声' },
  { value: 'female-shaonv', label: '少女音色', group: '基础女声' },
  { value: 'female-yujie', label: '御姐音色', group: '基础女声' },
  { value: 'female-chengshu', label: '成熟女性音色', group: '基础女声' },
  { value: 'female-tianmei', label: '甜美女性音色', group: '基础女声' },

  // Beta 音色
  { value: 'male-qn-qingse-jingpin', label: '青涩青年音色-beta', group: 'Beta 男声' },
  { value: 'male-qn-jingying-jingpin', label: '精英青年音色-beta', group: 'Beta 男声' },
  { value: 'male-qn-badao-jingpin', label: '霸道青年音色-beta', group: 'Beta 男声' },
  { value: 'male-qn-daxuesheng-jingpin', label: '青年大学生音色-beta', group: 'Beta 男声' },
  { value: 'female-shaonv-jingpin', label: '少女音色-beta', group: 'Beta 女声' },
  { value: 'female-yujie-jingpin', label: '御姐音色-beta', group: 'Beta 女声' },
  { value: 'female-chengshu-jingpin', label: '成熟女性音色-beta', group: 'Beta 女声' },
  { value: 'female-tianmei-jingpin', label: '甜美女性音色-beta', group: 'Beta 女声' },

  // 童声
  { value: 'clever_boy', label: '聪明男童', group: '童声' },
  { value: 'cute_boy', label: '可爱男童', group: '童声' },
  { value: 'lovely_girl', label: '萌萌女童', group: '童声' },
  { value: 'cartoon_pig', label: '卡通猪小琪', group: '童声' },

  // 角色音色
  { value: 'bingjiao_didi', label: '病娇弟弟', group: '角色男声' },
  { value: 'junlang_nanyou', label: '俊朗男友', group: '角色男声' },
  { value: 'chunzhen_xuedi', label: '纯真学弟', group: '角色男声' },
  { value: 'lengdan_xiongzhang', label: '冷淡学长', group: '角色男声' },
  { value: 'badao_shaoye', label: '霸道少爷', group: '角色男声' },
  { value: 'tianxin_xiaoling', label: '甜心小玲', group: '角色女声' },
  { value: 'qiaopi_mengmei', label: '俏皮萌妹', group: '角色女声' },
  { value: 'wumei_yujie', label: '妩媚御姐', group: '角色女声' },
  { value: 'diadia_xuemei', label: '嗲嗲学妹', group: '角色女声' },
  { value: 'danya_xuejie', label: '淡雅学姐', group: '角色女声' },

  // 专业音色（中文）
  { value: 'Chinese (Mandarin)_Reliable_Executive', label: '沉稳高管', group: '专业音色' },
  { value: 'Chinese (Mandarin)_News_Anchor', label: '新闻女声', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Mature_Woman', label: '傲娇御姐', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Unrestrained_Young_Man', label: '不羁青年', group: '专业音色' },
  { value: 'Arrogant_Miss', label: '嚣张小姐', group: '专业音色' },
  { value: 'Robot_Armor', label: '机械战甲', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Kind-hearted_Antie', label: '热心大婶', group: '专业音色' },
  { value: 'Chinese (Mandarin)_HK_Flight_Attendant', label: '港普空姐', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Humorous_Elder', label: '搞笑大爷', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Gentleman', label: '温润男声', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Warm_Bestie', label: '温暖闺蜜', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Male_Announcer', label: '播报男声', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Sweet_Lady', label: '甜美女声', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Southern_Young_Man', label: '南方小哥', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Wise_Women', label: '阅历姐姐', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Gentle_Youth', label: '温润青年', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Warm_Girl', label: '温暖少女', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Kind-hearted_Elder', label: '花甲奶奶', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Cute_Spirit', label: '憨憨萌兽', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Radio_Host', label: '电台男主播', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Lyrical_Voice', label: '抒情男声', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Straightforward_Boy', label: '率真弟弟', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Sincere_Adult', label: '真诚青年', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Gentle_Senior', label: '温柔学姐', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Stubborn_Friend', label: '嘴硬竹马', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Crisp_Girl', label: '清脆少女', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Pure-hearted_Boy', label: '清澈邻家弟弟', group: '专业音色' },
  { value: 'Chinese (Mandarin)_Soft_Girl', label: '软软女孩', group: '专业音色' },

  // 粤语音色
  { value: 'Cantonese_ProfessionalHost（F)', label: '专业女主持', group: '粤语音色' },
  { value: 'Cantonese_GentleLady', label: '温柔女声', group: '粤语音色' },
  { value: 'Cantonese_ProfessionalHost（M)', label: '专业男主持', group: '粤语音色' },
  { value: 'Cantonese_PlayfulMan', label: '活泼男声', group: '粤语音色' },
  { value: 'Cantonese_CuteGirl', label: '可爱女孩', group: '粤语音色' },
  { value: 'Cantonese_KindWoman', label: '善良女声', group: '粤语音色' },

  // 英语音色（常用）
  { value: 'English_Trustworthy_Man', label: 'Trustworthy Man', group: '英语音色' },
  { value: 'English_Graceful_Lady', label: 'Graceful Lady', group: '英语音色' },
  { value: 'English_Aussie_Bloke', label: 'Aussie Bloke', group: '英语音色' },
  { value: 'English_Whispering_girl', label: 'Whispering girl', group: '英语音色' },
  { value: 'English_Gentle-voiced_man', label: 'Gentle-voiced man', group: '英语音色' },

  // 日语音色（常用）
  { value: 'Japanese_GentleButler', label: 'Gentle Butler', group: '日语音色' },
  { value: 'Japanese_KindLady', label: 'Kind Lady', group: '日语音色' },
  { value: 'Japanese_CalmLady', label: 'Calm Lady', group: '日语音色' },
  { value: 'Japanese_OptimisticYouth', label: 'Optimistic Youth', group: '日语音色' },
  { value: 'Japanese_GracefulMaiden', label: 'Graceful Maiden', group: '日语音色' },
]

/** MiniMax T2A 配置字段 */
export const connectorFields: ConnectorField[] = [
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    description: 'MiniMax API Key'
  },
  {
    key: 'endpoint',
    label: 'API 端点',
    type: 'text',
    required: false,
    default: 'https://api.minimaxi.com/v1/t2a_v2',
    placeholder: 'https://api.minimaxi.com/v1/t2a_v2',
    description: '默认使用 minimaxi.com，也可使用 minimax.io'
  },
  {
    key: 'model',
    label: '模型',
    type: 'select',
    required: false,
    default: 'speech-2.6-hd',
    options: [
      { value: 'speech-2.8-hd', label: 'speech-2.8-hd (最新)' },
      { value: 'speech-2.8-turbo', label: 'speech-2.8-turbo (最新快速)' },
      { value: 'speech-2.6-hd', label: 'speech-2.6-hd (推荐)' },
      { value: 'speech-2.6-turbo', label: 'speech-2.6-turbo (快速)' },
      { value: 'speech-02-hd', label: 'speech-02-hd' },
      { value: 'speech-02-turbo', label: 'speech-02-turbo' }
    ],
    description: '语音合成模型'
  },
  {
    key: 'voiceId',
    label: '音色 ID',
    type: 'combobox',
    required: false,
    default: 'female-tianmei',
    placeholder: '选择预设音色或输入自定义 ID',
    options: chineseVoiceOptions,
    description: '可从预设中选择或直接输入音色 ID（如克隆音色 ID）'
  },
  {
    key: 'speed',
    label: '语速',
    type: 'number',
    default: 1.0,
    description: '语速，范围 0.5-2，默认 1.0'
  },
  {
    key: 'volume',
    label: '音量',
    type: 'number',
    default: 1.0,
    description: '音量，范围 0-10，默认 1.0'
  },
  {
    key: 'pitch',
    label: '音调',
    type: 'number',
    default: 0,
    description: '音调调整，范围 -12 到 12，默认 0'
  },
  {
    key: 'languageBoost',
    label: '语言增强',
    type: 'select',
    default: 'auto',
    options: [
      { value: 'auto', label: '自动检测' },
      { value: 'Chinese', label: '中文' },
      { value: 'Chinese,Yue', label: '粤语' },
      { value: 'English', label: '英语' },
      { value: 'Japanese', label: '日语' },
      { value: 'Korean', label: '韩语' },
      { value: 'French', label: '法语' },
      { value: 'German', label: '德语' },
      { value: 'Spanish', label: '西班牙语' },
      { value: 'Russian', label: '俄语' },
      { value: 'Arabic', label: '阿拉伯语' }
    ],
    description: '增强特定语言的识别'
  },
  {
    key: 'audioFormat',
    label: '音频格式',
    type: 'select',
    default: 'mp3',
    options: [
      { value: 'mp3', label: 'MP3' },
      { value: 'wav', label: 'WAV' },
      { value: 'flac', label: 'FLAC' },
      { value: 'pcm', label: 'PCM' }
    ],
    description: '输出音频格式'
  },
  {
    key: 'sampleRate',
    label: '采样率',
    type: 'select',
    default: 32000,
    options: [
      { value: 8000, label: '8000 Hz' },
      { value: 16000, label: '16000 Hz' },
      { value: 22050, label: '22050 Hz' },
      { value: 24000, label: '24000 Hz' },
      { value: 32000, label: '32000 Hz' },
      { value: 44100, label: '44100 Hz' }
    ],
    description: '音频采样率'
  },
  {
    key: 'emotion',
    label: '情感控制',
    type: 'select',
    default: '',
    options: [
      { value: '', label: '自动' },
      { value: 'happy', label: '开心' },
      { value: 'sad', label: '悲伤' },
      { value: 'angry', label: '愤怒' },
      { value: 'fearful', label: '恐惧' },
      { value: 'disgusted', label: '厌恶' },
      { value: 'surprised', label: '惊讶' },
      { value: 'calm', label: '平静' },
      { value: 'fluent', label: '流畅 (2.6+)' },
      { value: 'whisper', label: '耳语 (2.6+)' }
    ],
    description: '情感控制，默认自动选择'
  }
]

/** 卡片展示字段 */
export const connectorCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'voiceId', label: '音色' }
]
