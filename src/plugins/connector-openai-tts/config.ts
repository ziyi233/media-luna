// OpenAI TTS 连接器配置

import type { ConnectorField, CardDisplayField } from '../../core'

/** OpenAI TTS 音色选项 */
export const voiceOptions = [
  { value: 'alloy', label: 'Alloy', group: '标准音色' },
  { value: 'echo', label: 'Echo', group: '标准音色' },
  { value: 'fable', label: 'Fable', group: '标准音色' },
  { value: 'onyx', label: 'Onyx', group: '标准音色' },
  { value: 'nova', label: 'Nova', group: '标准音色' },
  { value: 'shimmer', label: 'Shimmer', group: '标准音色' }
]

/** OpenAI TTS 模型选项 */
export const modelOptions = [
  { value: 'tts-1', label: 'TTS-1 (标准)' },
  { value: 'tts-1-hd', label: 'TTS-1-HD (高清)' }
]

/** OpenAI TTS 输出格式选项 */
export const formatOptions = [
  { value: 'mp3', label: 'MP3' },
  { value: 'opus', label: 'Opus' },
  { value: 'aac', label: 'AAC' },
  { value: 'flac', label: 'FLAC' },
  { value: 'wav', label: 'WAV' },
  { value: 'pcm', label: 'PCM' }
]

/** OpenAI TTS 配置字段 */
export const connectorFields: ConnectorField[] = [
  {
    key: 'baseUrl',
    label: 'API Base URL',
    type: 'text',
    required: false,
    default: 'https://api.openai.com/v1',
    placeholder: 'https://api.openai.com/v1',
    description: 'OpenAI API 基础地址，支持兼容接口'
  },
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    placeholder: 'sk-xxx',
    description: 'OpenAI API 密钥'
  },
  {
    key: 'model',
    label: '模型',
    type: 'select',
    required: false,
    default: 'tts-1',
    options: modelOptions,
    description: 'TTS 模型，HD 版本音质更高但延迟稍长'
  },
  {
    key: 'voice',
    label: '音色',
    type: 'select',
    required: false,
    default: 'alloy',
    options: voiceOptions,
    description: '语音音色'
  },
  {
    key: 'speed',
    label: '语速',
    type: 'combobox',
    required: false,
    default: '1.0',
    placeholder: '1.0',
    options: [
      { value: '0.5', label: '0.5x (慢)' },
      { value: '0.75', label: '0.75x' },
      { value: '1.0', label: '1.0x (正常)' },
      { value: '1.25', label: '1.25x' },
      { value: '1.5', label: '1.5x (快)' },
      { value: '2.0', label: '2.0x (极快)' }
    ],
    description: '语速倍率 (0.25 - 4.0)，可手动输入'
  },
  {
    key: 'responseFormat',
    label: '输出格式',
    type: 'select',
    required: false,
    default: 'mp3',
    options: formatOptions,
    description: '音频输出格式'
  }
]

/** 卡片展示字段 */
export const connectorCardFields: CardDisplayField[] = [
  { source: 'connectorConfig', key: 'model', label: '模型' },
  { source: 'connectorConfig', key: 'voice', label: '音色' }
]
