<template>
  <div class="generate-layout">
    <!-- 左侧配置区 -->
    <div class="config-panel">
      <div class="config-card pop-card pop-scrollbar">
        <div class="form-section">
          <div class="section-title">
            <span class="section-emoji">⚙️</span> 基础配置
          </div>

          <!-- 渠道选择触发器 -->
          <div class="form-item">
            <div class="label">生成渠道</div>
            <div
              class="selection-trigger"
              :class="{ active: pickerMode === 'channel', selected: !!selectedChannel }"
              @click="togglePickerMode('channel')"
            >
              <template v-if="selectedChannel">
                <div class="selection-info">
                  <img
                    v-if="getConnectorIconUrl(selectedChannel.connectorId)"
                    :src="getConnectorIconUrl(selectedChannel.connectorId)"
                    class="selection-icon"
                  />
                  <component v-else :is="icons.channels" class="selection-icon-fallback"></component>
                  <span class="selection-name">{{ selectedChannel.name }}</span>
                </div>
                <span class="clear-btn" @click.stop="clearChannel" title="清除">✕</span>
              </template>
              <template v-else>
                <component :is="icons.channels" class="placeholder-icon"></component>
                <span class="placeholder-text">点击选择渠道</span>
                <span class="arrow-icon">→</span>
              </template>
            </div>
          </div>

          <!-- 预设选择触发器 -->
          <div class="form-item">
            <div class="label">预设模板 <span class="optional">(可选)</span></div>
            <div
              class="selection-trigger"
              :class="{ active: pickerMode === 'preset', selected: !!selectedPreset }"
              @click="togglePickerMode('preset')"
            >
              <template v-if="selectedPreset">
                <div class="selection-info">
                  <img
                    v-if="selectedPreset.thumbnail"
                    :src="selectedPreset.thumbnail"
                    class="selection-thumb"
                  />
                  <component v-else :is="icons.presets" class="selection-icon-fallback"></component>
                  <span class="selection-name">{{ selectedPreset.name }}</span>
                </div>
                <span class="clear-btn" @click.stop="clearPreset" title="清除">✕</span>
              </template>
              <template v-else>
                <component :is="icons.presets" class="placeholder-icon"></component>
                <span class="placeholder-text">点击选择预设</span>
                <span class="arrow-icon">→</span>
              </template>
            </div>
          </div>
        </div>

        <div class="form-section flex-grow">
          <div class="section-title">
            <span class="section-emoji">✏️</span> 提示词
          </div>
          <textarea
            v-model="form.prompt"
            class="pop-textarea prompt-input"
            rows="8"
            placeholder="输入提示词，支持自然语言描述..."
          ></textarea>
        </div>

        <!-- 文件上传区域 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-emoji">🖼️</span> 参考图片
          </div>
          <div class="upload-area">
            <!-- 已上传的图片列表 -->
            <div class="upload-list" v-if="fileList.length > 0">
              <div v-for="(file, index) in fileList" :key="file.uid" class="upload-item">
                <img v-if="isImageFile(file)" :src="file.url" class="upload-thumb" />
                <video v-else-if="isVideoFile(file)" :src="file.url" class="upload-thumb" />
                <div v-else class="upload-thumb unknown-file">❓</div>
                <div class="upload-overlay" @click="removeFile(index)">
                  <span>🗑️</span>
                </div>
              </div>
            </div>
            <!-- 上传按钮 -->
            <div
              class="upload-trigger"
              @click="triggerUpload"
              @dragover.prevent
              @drop.prevent="handleDrop"
            >
              <input
                ref="fileInput"
                type="file"
                accept="image/*,video/*"
                multiple
                style="display: none"
                @change="handleFileSelect"
              />
              <span class="upload-icon">➕</span>
            </div>
            <div class="upload-tip">点击或拖拽上传参考图片</div>
          </div>
        </div>

        <div class="form-actions">
          <button
            class="pop-btn secondary clear-btn"
            @click="clearForm"
            title="清除除渠道外的所有数据"
          >
            🗑️ 清空
          </button>
          <button
            class="pop-btn primary generate-btn"
            @click="generate"
          >
            <span v-if="pendingCount > 0" class="pending-badge">{{ pendingCount }}</span>
            <span v-else>✨</span>
            开始生成
          </button>
        </div>
      </div>
    </div>

    <!-- 中间区域 -->
    <div class="preview-panel pop-scrollbar">
      <!-- 渠道选择列表 -->
      <div v-if="pickerMode === 'channel'" class="picker-view">
        <div class="picker-header">
          <div class="picker-title-row">
            <div class="picker-title">
              <span class="picker-emoji">🔗</span>
              <span>选择渠道</span>
              <span class="picker-count">{{ filteredChannels.length }}</span>
            </div>
            <button class="pop-btn small" @click="pickerMode = null">
              ✕
            </button>
          </div>
          <div class="picker-filters">
            <input
              v-model="channelSearch"
              type="text"
              class="pop-input picker-search"
              placeholder="🔍 搜索..."
            />
            <select
              v-model="channelConnectorFilter"
              class="pop-select picker-filter"
            >
              <option value="">全部连接器</option>
              <option
                v-for="conn in connectors"
                :key="conn.id"
                :value="conn.id"
              >{{ conn.name }}</option>
            </select>
          </div>
        </div>
        <div class="picker-grid">
          <div
            v-for="channel in filteredChannels"
            :key="channel.id"
            class="picker-card pop-card"
            :class="{ selected: form.channel === channel.id }"
            @click="selectChannel(channel)"
          >
            <div class="picker-card-icon">
              <img
                v-if="getConnectorIconUrl(channel.connectorId)"
                :src="getConnectorIconUrl(channel.connectorId)"
              />
              <span v-else>🔗</span>
            </div>
            <div class="picker-card-name">{{ channel.name }}</div>
            <span v-if="form.channel === channel.id" class="picker-card-check">✓</span>
          </div>
          <div v-if="filteredChannels.length === 0" class="picker-empty">
            <span class="empty-emoji">🔍</span>
            <span>没有找到匹配的渠道</span>
          </div>
        </div>
      </div>

      <!-- 预设选择列表 -->
      <div v-else-if="pickerMode === 'preset'" class="picker-view">
        <div class="picker-header">
          <div class="picker-title-row">
            <div class="picker-title">
              <span class="picker-emoji">📦</span>
              <span>选择预设</span>
              <span class="picker-count">{{ filteredPresetsCount }}</span>
            </div>
            <button class="pop-btn small" @click="pickerMode = null">
              ✕
            </button>
          </div>
          <div class="picker-filters">
            <input
              v-model="presetSearch"
              type="text"
              class="pop-input picker-search"
              placeholder="🔍 搜索..."
            />
            <select
              v-model="presetSourceFilter"
              class="pop-select picker-filter"
            >
              <option value="">全部来源</option>
              <option value="user">本地</option>
              <option value="api">远程</option>
            </select>
          </div>
        </div>
        <div class="preset-picker-content pop-scrollbar">
          <div class="preset-grid">
            <template v-for="preset in presets" :key="preset.id">
              <div
                v-if="matchPresetFilter(preset)"
                class="preset-picker-card pop-card"
                :class="{ selected: presetId === preset.id }"
                @click="selectPreset(preset)"
              >
                <!-- 缩略图 -->
                <div class="card-thumb" v-if="preset.thumbnail">
                  <img :src="preset.thumbnail" loading="lazy" />
                </div>
                <div class="card-thumb empty" v-else>
                  <span>🖼️</span>
                </div>
                <!-- 底部信息 -->
                <div class="card-info">
                  <div class="card-name">{{ preset.name }}</div>
                </div>
                <!-- 来源标记 -->
                <div class="card-source" :class="preset.source">
                  {{ preset.source === 'api' ? '远程' : '本地' }}
                </div>
                <!-- 选中标记 -->
                <span v-if="presetId === preset.id" class="card-check">✓</span>
              </div>
            </template>
          </div>
          <div v-if="filteredPresetsCount === 0" class="picker-empty">
            <span class="empty-emoji">🔍</span>
            <span>没有找到匹配的预设</span>
          </div>
        </div>
      </div>

      <!-- 生成中状态 -->
      <div v-else-if="pendingCount > 0" class="generating-state">
        <div class="generating-content pop-card">
          <div class="loader"></div>
          <div class="generating-info">
            <p class="generating-title">
              正在生成中...
              <span v-if="pendingCount > 1" class="task-count">({{ pendingCount }} 个任务)</span>
            </p>
            <p class="generating-timer">
              ⏱️ 已用时间: {{ formatElapsedTime(elapsedTime) }}
            </p>
            <p class="generating-hint" v-if="currentTaskId">任务 ID: {{ currentTaskId }}</p>
          </div>
        </div>
      </div>

      <!-- 有结果 -->
      <div v-else-if="result" class="result-container">
        <!-- 成功状态 -->
        <div v-if="result.success && result.output && result.output.length" class="success-result">
          <div class="output-grid">
            <div v-for="(asset, idx) in result.output" :key="idx" class="output-wrapper">
              <!-- 图片 -->
              <template v-if="asset.kind === 'image'">
                <img :src="asset.url" @click="openImagePreview(idx)" class="clickable-image" />
                <div class="output-actions">
                  <a :href="asset.url" target="_blank" class="action-btn" download>
                    ⬇️
                  </a>
                </div>
              </template>
              <!-- 视频 -->
              <template v-else-if="asset.kind === 'video'">
                <video :src="asset.url" controls class="output-video" />
              </template>
              <!-- 音频 -->
              <template v-else-if="asset.kind === 'audio'">
                <div class="audio-wrapper">
                  <AudioPlayer
                    :ref="el => setAudioRef(el, idx)"
                    :src="asset.url!"
                    :duration="asset.meta?.duration"
                    @play-state-change="onAudioPlayStateChange(idx, $event)"
                  />
                  <div class="output-actions audio-actions">
                    <a :href="asset.url" target="_blank" class="action-btn" download>
                      ⬇️
                    </a>
                  </div>
                </div>
              </template>
              <!-- 其他文件 -->
              <template v-else-if="asset.kind === 'file'">
                <a :href="asset.url" target="_blank" class="file-link">
                  📄 {{ asset.meta?.filename || '下载文件' }}
                </a>
              </template>
              <!-- 文本 -->
              <template v-else-if="asset.kind === 'text'">
                <div class="text-output">{{ asset.content }}</div>
              </template>
              <!-- 兜底：有 url 则显示链接 -->
              <template v-else-if="asset.url">
                <a :href="asset.url" target="_blank">{{ asset.url }}</a>
              </template>
            </div>
          </div>
          <div class="result-meta">
            <span class="meta-item success-badge">
              ✅ 生成成功
            </span>
            <span class="meta-item" v-if="result.duration">
              ⏱️ 耗时: {{ formatElapsedTime(result.duration) }}
            </span>
            <span class="meta-item" v-if="result.taskId">
              📋 任务 ID: {{ result.taskId }}
            </span>
          </div>
        </div>

        <!-- 失败状态 -->
        <div v-else class="error-result">
          <div class="error-content pop-card">
            <span class="error-icon">⚠️</span>
            <div class="error-info">
              <p class="error-title">生成失败</p>
              <p class="error-msg">{{ result.error || '未知错误' }}</p>
              <p class="error-meta" v-if="result.taskId">任务 ID: {{ result.taskId }}</p>
              <p class="error-meta" v-if="result.duration">耗时: {{ formatElapsedTime(result.duration) }}</p>
            </div>
          </div>
          <button class="pop-btn retry-btn" @click="generate">
            🔄 重新生成
          </button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <span class="empty-icon">🖼️</span>
        <p>在左侧配置并点击生成</p>
      </div>
    </div>

    <!-- 右侧历史画廊 -->
    <HistoryGallery ref="historyGalleryRef" @select="handleHistorySelect" />

    <!-- 图片预览弹窗 -->
    <ImageLightbox
      v-model:visible="lightboxVisible"
      :task-id="lightboxTaskId"
      :initial-index="lightboxIndex"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated } from 'vue'
import { ChannelConfig, PresetData, GenerationResult, ClientFileData, ConnectorDefinition } from '../types'
import { channelApi, presetApi, generateApi, taskApi, connectorApi } from '../api'
import { icons } from '../icons'
import HistoryGallery from './HistoryGallery.vue'
import ImageLightbox from './ImageLightbox.vue'
import AudioPlayer from './AudioPlayer.vue'

/** 本地文件项 */
interface LocalFile {
  uid: number
  url: string
  mimeType?: string
  raw: File | null  // null 表示从 URL 加载的图片
}

const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(?:$|[?#])/i
const VIDEO_EXT_REGEX = /\.(mp4|webm|mov|m4v|avi|mkv)(?:$|[?#])/i

function inferMimeTypeByUrl(url: string): string | undefined {
  if (IMAGE_EXT_REGEX.test(url)) return 'image/*'
  if (VIDEO_EXT_REGEX.test(url)) return 'video/*'
  return undefined
}

function isImageFile(file: LocalFile): boolean {
  const mimeType = file.raw?.type || file.mimeType || inferMimeTypeByUrl(file.url)
  return !!mimeType && mimeType.startsWith('image/')
}

function isVideoFile(file: LocalFile): boolean {
  const mimeType = file.raw?.type || file.mimeType || inferMimeTypeByUrl(file.url)
  return !!mimeType && mimeType.startsWith('video/')
}

// 选择模式状态
type PickerMode = 'channel' | 'preset' | null
const pickerMode = ref<PickerMode>(null)

// 数据
const channels = ref<ChannelConfig[]>([])
const presets = ref<PresetData[]>([])
const connectors = ref<ConnectorDefinition[]>([])
const pendingCount = ref(0)  // 进行中的任务数量
const result = ref<GenerationResult | null>(null)
const fileList = ref<LocalFile[]>([])
const uploadedFiles = ref<ClientFileData[]>([])
const fileInput = ref<HTMLInputElement>()
const historyGalleryRef = ref<InstanceType<typeof HistoryGallery>>()
let fileUid = 0

// 搜索和筛选
const channelSearch = ref('')
const channelConnectorFilter = ref('')
const presetSearch = ref('')
const presetSourceFilter = ref('')

// 计时器相关
const elapsedTime = ref(0)
const currentTaskId = ref<number | null>(null)
let timerInterval: ReturnType<typeof setInterval> | null = null
let startTime = 0

const form = ref({
  channel: undefined as number | undefined,
  prompt: '',
  parameters: {}
})

const presetId = ref<number | undefined>(undefined)

// 计算属性：选中的渠道
const selectedChannel = computed(() => {
  if (!form.value.channel) return null
  return channels.value.find(c => c.id === form.value.channel) || null
})

// 计算属性：选中的预设
const selectedPreset = computed(() => {
  if (!presetId.value) return null
  return presets.value.find(p => p.id === presetId.value) || null
})

// 计算属性：筛选后的渠道
const filteredChannels = computed(() => {
  let filtered = channels.value
  // 连接器筛选
  if (channelConnectorFilter.value) {
    filtered = filtered.filter(c => c.connectorId === channelConnectorFilter.value)
  }
  // 关键词搜索
  if (channelSearch.value.trim()) {
    const keyword = channelSearch.value.toLowerCase().trim()
    filtered = filtered.filter(c => c.name.toLowerCase().includes(keyword))
  }
  return filtered
})

/** 检查预设是否匹配筛选条件 */
const matchPresetFilter = (preset: PresetData): boolean => {
  // 来源筛选
  if (presetSourceFilter.value && preset.source !== presetSourceFilter.value) {
    return false
  }
  // 搜索
  if (presetSearch.value.trim()) {
    const keyword = presetSearch.value.toLowerCase().trim()
    if (!preset.name.toLowerCase().includes(keyword)) {
      if (!(preset.tags || []).some(t => t.toLowerCase().includes(keyword))) {
        return false
      }
    }
  }
  return true
}

// 计算属性：筛选后的预设数量
const filteredPresetsCount = computed(() => {
  return presets.value.filter(p => matchPresetFilter(p)).length
})

/** 获取连接器图标 URL */
const getConnectorIconUrl = (connectorId: string): string => {
  const connector = connectors.value.find(c => c.id === connectorId)
  if (!connector?.icon) return ''

  if (connector.icon === 'chatluna' || connector.icon === 'edge-tts') {
    return new URL(`../assets/connector-icons/${connector.icon}.png`, import.meta.url).href
  }
  return new URL(`../assets/connector-icons/${connector.icon}.svg`, import.meta.url).href
}

/** 获取连接器名称 */
const getConnectorName = (connectorId: string): string => {
  const connector = connectors.value.find(c => c.id === connectorId)
  return connector?.name || connectorId
}

/** 切换选择模式 */
const togglePickerMode = (mode: PickerMode) => {
  if (pickerMode.value === mode) {
    pickerMode.value = null
  } else {
    pickerMode.value = mode
    // 清空搜索
    if (mode === 'channel') channelSearch.value = ''
    if (mode === 'preset') {
      presetSearch.value = ''
      presetSourceFilter.value = ''
    }
  }
}

/** 选择渠道 */
const selectChannel = (channel: ChannelConfig) => {
  form.value.channel = channel.id
  pickerMode.value = null
}

/** 选择预设 */
const selectPreset = (preset: PresetData) => {
  presetId.value = preset.id
  pickerMode.value = null
}

/** 清除渠道选择 */
const clearChannel = () => {
  form.value.channel = undefined
}

/** 清除预设选择 */
const clearPreset = () => {
  presetId.value = undefined
}

// Lightbox 状态
const lightboxVisible = ref(false)
const lightboxTaskId = ref<number | null>(null)
const lightboxIndex = ref(0)

// 格式化耗时
const formatElapsedTime = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = (seconds % 60).toFixed(0)
  return `${minutes}m ${remainingSeconds}s`
}

// 媒体时长缓存 (key: url, value: duration in seconds)
const mediaDurations = ref<Record<string, number>>({})

/** 处理媒体加载元数据事件，获取时长 */
const handleMediaMetadata = (e: Event, url: string) => {
  const media = e.target as HTMLAudioElement | HTMLVideoElement
  if (media.duration && isFinite(media.duration)) {
    mediaDurations.value[url] = media.duration
  }
}

/** 获取媒体时长显示 */
const getMediaDuration = (url: string) => {
  const duration = mediaDurations.value[url]
  return duration ? formatMediaDuration(duration) : ''
}

/** 格式化媒体时长（秒 -> mm:ss） */
const formatMediaDuration = (seconds: number) => {
  if (!seconds || seconds <= 0) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `0:${secs.toString().padStart(2, '0')}`
}

// ========== 音频播放控制 ==========
const audioPlayerRefs = ref<Record<number, InstanceType<typeof AudioPlayer> | null>>({})

/** 设置音频播放器引用 */
const setAudioRef = (el: any, idx: number) => {
  audioPlayerRefs.value[idx] = el
}

/** 音频播放状态改变 - 暂停其他播放器 */
const onAudioPlayStateChange = (idx: number, playing: boolean) => {
  if (playing) {
    // 暂停其他音频
    Object.entries(audioPlayerRefs.value).forEach(([key, player]) => {
      if (Number(key) !== idx && player) {
        player.pause()
      }
    })
  }
}

// 开始计时
const startTimer = () => {
  startTime = Date.now()
  elapsedTime.value = 0
  timerInterval = setInterval(() => {
    elapsedTime.value = Date.now() - startTime
  }, 100)
}

// 停止计时
const stopTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

// 打开图片预览
const openImagePreview = (index: number) => {
  if (result.value?.taskId) {
    lightboxTaskId.value = result.value.taskId
    lightboxIndex.value = index
    lightboxVisible.value = true
  }
}

const fetchData = async () => {
  try {
    const [channelsData, presetsData, connectorsData] = await Promise.all([
      channelApi.listEnabled(),
      presetApi.list(),
      connectorApi.list()
    ])
    channels.value = channelsData
    presets.value = presetsData
    connectors.value = connectorsData
  } catch (e) {
    console.error(e)
  }
}

// 文件转 base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // 提取 base64 部分 (去掉 data:xxx;base64, 前缀)
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 触发文件选择
const triggerUpload = () => {
  fileInput.value?.click()
}

// 处理文件选择
const handleFileSelect = async (e: Event) => {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  await addFiles(Array.from(input.files))
  input.value = '' // 清空以便再次选择同一文件
}

// 处理拖拽
const handleDrop = async (e: DragEvent) => {
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  await addFiles(Array.from(files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')))
}

// 添加文件
const addFiles = async (files: File[]) => {
  for (const file of files) {
    const url = URL.createObjectURL(file)
    fileList.value.push({
      uid: ++fileUid,
      url,
      mimeType: file.type,
      raw: file
    })

    try {
      const base64 = await fileToBase64(file)
      const isVideo = file.type.startsWith('video/')
      uploadedFiles.value.push({
        type: isVideo ? 'video' : 'image',
        base64,
        mimeType: file.type,
        filename: file.name
      })
    } catch (e) {
      console.error('Failed to read file:', file.name, e)
    }
  }
}

// 移除文件
const removeFile = (index: number) => {
  const file = fileList.value[index]
  if (file) {
    // 只有本地文件才需要 revoke
    if (file.raw) {
      URL.revokeObjectURL(file.url)
    }
    fileList.value.splice(index, 1)
    // uploadedFiles 可能因为异步加载导致索引不一致，需要同步清空并重建
    // 简单处理：直接按索引删除（假设同步）
    if (uploadedFiles.value.length > index) {
      uploadedFiles.value.splice(index, 1)
    }
  }
}

// 尝试通过 taskId 获取结果
const fetchTaskResult = async (taskId: number): Promise<GenerationResult | null> => {
  try {
    const task = await taskApi.get(taskId)

    if (task.status === 'success' && task.responseSnapshot && task.responseSnapshot.length > 0) {
      return {
        success: true,
        output: task.responseSnapshot,
        taskId: task.id,
        duration: task.duration || undefined
      }
    } else if (task.status === 'failed') {
      const errorInfo = (task.middlewareLogs as any)?._error
      return {
        success: false,
        error: errorInfo?.message || '生成失败',
        taskId: task.id,
        duration: task.duration || undefined
      }
    }
    return null
  } catch {
    return null
  }
}

const generate = async () => {
  if (!form.value.channel) {
    alert('请选择渠道')
    return
  }

  // 增加进行中任务计数
  pendingCount.value++

  // 只在第一个任务时清空结果和启动计时器
  if (pendingCount.value === 1) {
    result.value = null
    currentTaskId.value = null
    startTimer()
  }

  try {
    const params: any = {
      channelId: form.value.channel,
      prompt: form.value.prompt || '',
      parameters: { ...form.value.parameters }
    }

    // 添加文件
    if (uploadedFiles.value.length > 0) {
      params.files = uploadedFiles.value
    }

    if (presetId.value) {
      const preset = presets.value.find(p => p.id === presetId.value)
      if (preset) {
        params.parameters.preset = preset.name
      }
    }

    // 提交任务后立即刷新历史列表（延迟一点确保任务已入库）
    setTimeout(() => {
      historyGalleryRef.value?.refresh()
    }, 300)

    const res = await generateApi.generate(params)

    // 任务完成后再次刷新历史列表
    historyGalleryRef.value?.refresh()

    // 更新 taskId
    if (res.taskId) {
      currentTaskId.value = res.taskId
    }

    // 如果成功，直接使用结果
    if (res.success) {
      result.value = res
    } else {
      // API 返回失败，但可能任务实际成功了，尝试通过 taskId 获取
      if (res.taskId) {
        // 等待一小段时间让后端完成处理
        await new Promise(resolve => setTimeout(resolve, 500))
        const taskResult = await fetchTaskResult(res.taskId)
        if (taskResult && taskResult.success) {
          result.value = taskResult
        } else {
          result.value = res
        }
      } else {
        result.value = res
      }
    }
  } catch (e: any) {
    // 请求异常（现已使用 10 分钟超时，基本不会触发）
    result.value = { success: false, error: e.message || '请求失败' }
  } finally {
    // 减少进行中任务计数
    pendingCount.value--
    // 所有任务完成后停止计时器
    if (pendingCount.value === 0) {
      stopTimer()
    }
  }
}

// 处理历史记录选择（点击历史任务时填充配置）
const handleHistorySelect = async (task: { id: number; prompt: string }) => {
  // 先填充基本提示词
  if (task.prompt) {
    form.value.prompt = task.prompt
  }

  // 获取完整任务数据以填充预设和参考图
  try {
    const fullTask = await taskApi.get(task.id)
    if (!fullTask) return

    // 填充预设（从 middlewareLogs 中获取）
    const logs = fullTask.middlewareLogs as any
    const presetLog = logs?.preset
    if (presetLog?.presetId) {
      // 尝试找到对应的预设
      const preset = presets.value.find(p => p.id === presetLog.presetId || p.name === presetLog.presetName)
      if (preset) {
        presetId.value = preset.id
      }
    } else {
      // 没有预设则清除
      presetId.value = undefined
    }

    // 填充参考图（从 storage-input 中获取）
    const storageInput = logs?.['storage-input']
    if (storageInput?.logs?.length > 0) {
      // 清除现有文件
      fileList.value.forEach(f => {
        if (f.raw) URL.revokeObjectURL(f.url)
      })
      fileList.value = []
      uploadedFiles.value = []

      // 加载历史参考图 - 直接使用 URL，后端会处理下载
      for (const log of storageInput.logs) {
        if (log.url) {
          // 添加到显示列表
          fileList.value.push({
            uid: ++fileUid,
            url: log.url,
            mimeType: inferMimeTypeByUrl(log.url),
            raw: null // URL 模式，无原始文件
          })

          // 直接添加 URL 到提交列表，后端会下载处理
          uploadedFiles.value.push({
            type: 'image',
            url: log.url,
            filename: log.filename || 'reference.png'
          })
        }
      }
    } else {
      // 没有参考图则清除
      fileList.value.forEach(f => {
        if (f.raw) URL.revokeObjectURL(f.url)
      })
      fileList.value = []
      uploadedFiles.value = []
    }
  } catch (e) {
    console.error('Failed to fetch task details:', e)
  }
}

// 清空表单（除渠道外）
const clearForm = () => {
  form.value.prompt = ''
  form.value.parameters = {}
  presetId.value = undefined
  // 清除文件
  fileList.value.forEach(f => {
    if (f.raw) URL.revokeObjectURL(f.url)
  })
  fileList.value = []
  uploadedFiles.value = []
  // 清除结果
  result.value = null
}

onMounted(() => {
  fetchData()
})

// keep-alive 激活时刷新数据
onActivated(() => {
  fetchData()
})

onUnmounted(() => {
  stopTimer()
})
</script>

<style lang="scss">
@use '../styles/theme.scss';
</style>

<style scoped lang="scss">
.generate-layout {
  display: flex;
  gap: 1.25rem;
  height: calc(100% - 12px);
  min-height: 0;
  padding: 0.25rem;
  padding-bottom: 0;
  overflow: hidden; /* 页面不滚动 */
}

/* ========== 左侧配置区 ========== */
.config-panel {
  width: 320px;
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;
}

.config-card {
  padding: 1.5rem;
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.config-card:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.config-card::-webkit-scrollbar {
  width: 6px;
}

.config-card::-webkit-scrollbar-track {
  background: transparent;
}

.config-card::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.config-card:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

.form-section {
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 2px dashed var(--ml-border-color);
}

.form-section:last-of-type {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.form-section.flex-grow {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.form-section.flex-grow .prompt-input {
  flex-grow: 1;
  min-height: 120px;
}

.section-title {
  font-weight: 800;
  margin-bottom: 0.75rem;
  color: var(--ml-text);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-emoji {
  font-size: 1rem;
}

.form-item {
  margin-bottom: 1rem;
}

.form-item:last-child {
  margin-bottom: 0;
}

.label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ml-text-secondary);
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.label .optional {
  font-size: 0.7rem;
  opacity: 0.7;
  font-weight: 500;
}

/* ========== 选择触发器样式 ========== */
.selection-trigger {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 0.875rem;
  background: var(--ml-surface);
  border: var(--ml-border);
  border-radius: var(--ml-radius);
  cursor: pointer;
  transition: all 0.2s;
  min-height: 48px;
  position: relative;
}

.selection-trigger:hover {
  transform: translateY(-2px);
  box-shadow: var(--ml-shadow);
}

.selection-trigger.active {
  border-color: var(--ml-primary-dark);
  background: var(--ml-primary-light);
}

.selection-trigger.selected {
  background: var(--ml-primary-light);
  border-color: var(--ml-primary-dark);
}

.selection-info {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex: 1;
  min-width: 0;
}

.selection-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: contain;
  flex-shrink: 0;
  background-color: var(--ml-bg);
  padding: 2px;
  border: 2px solid var(--ml-border-color);
}

.selection-thumb {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid var(--ml-border-color);
}

.selection-icon-fallback {
  width: 28px;
  height: 28px;
  padding: 4px;
  box-sizing: border-box;
  color: var(--ml-primary-dark);
  background-color: var(--ml-primary-light);
  border-radius: 6px;
  flex-shrink: 0;
}

.selection-name {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--ml-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.placeholder-icon {
  color: var(--ml-text-muted);
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.placeholder-text {
  flex: 1;
  font-size: 0.85rem;
  color: var(--ml-text-muted);
}

.arrow-icon {
  color: var(--ml-text-muted);
  font-size: 0.9rem;
  transition: transform 0.2s;
}

.selection-trigger:hover .arrow-icon {
  transform: translateX(3px);
  color: var(--ml-primary-dark);
}

.clear-btn {
  padding: 6px;
  color: var(--ml-text-muted);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  font-size: 0.8rem;
  font-weight: 700;
}

.clear-btn:hover {
  color: var(--ml-error);
}

/* ========== 选择器视图样式 ========== */
.picker-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.picker-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 1rem;
  border-bottom: 2px dashed var(--ml-border-color);
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.picker-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.picker-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--ml-text);
}

.picker-emoji {
  font-size: 1.2rem;
}

.picker-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 8px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ml-text);
  background-color: var(--ml-primary);
  border: 2px solid var(--ml-border-color);
  border-radius: 12px;
}

.picker-filters {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.picker-search {
  flex: 1;
  min-width: 0;
}

.picker-filter {
  width: 130px;
  flex-shrink: 0;
}

/* 渠道选择卡片网格 */
.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.875rem;
  flex: 1;
  align-content: start;
  overflow-y: auto;
  padding: 0.25rem;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.picker-grid:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.picker-grid::-webkit-scrollbar {
  width: 6px;
}

.picker-grid::-webkit-scrollbar-track {
  background: transparent;
}

.picker-grid::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.picker-grid:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

.picker-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.625rem;
  padding: 1rem 0.75rem;
  cursor: pointer;
  position: relative;
}

.picker-card.selected {
  background: var(--ml-primary-light);
  border-color: var(--ml-primary-dark);
}

.picker-card-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--ml-bg);
  border: 2px solid var(--ml-border-color);
  border-radius: 12px;
  font-size: 1.5rem;
}

.picker-card-icon img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.picker-card-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ml-text);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.picker-card-check {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 22px;
  height: 22px;
  background-color: var(--ml-success);
  border: 2px solid var(--ml-border-color);
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
}

.picker-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem;
  color: var(--ml-text-muted);
}

.empty-emoji {
  font-size: 2.5rem;
  opacity: 0.5;
}

/* ========== 预设选择器样式 ========== */
.preset-picker-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.5rem;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.preset-picker-content:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.preset-picker-content::-webkit-scrollbar {
  width: 6px;
}

.preset-picker-content::-webkit-scrollbar-track {
  background: transparent;
}

.preset-picker-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.preset-picker-content:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1rem;
}

.preset-picker-card {
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.preset-picker-card.selected {
  background: var(--ml-primary-light);
  border-color: var(--ml-primary-dark);
}

.preset-picker-card .card-thumb {
  width: 100%;
  position: relative;
  overflow: hidden;
  background: var(--ml-bg-alt);
  border-bottom: 2px solid var(--ml-border-color);
}

.preset-picker-card .card-thumb img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform 0.3s;
}

.preset-picker-card:hover .card-thumb img {
  transform: scale(1.05);
}

.preset-picker-card .card-thumb.empty {
  aspect-ratio: 4/3;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  opacity: 0.4;
}

.preset-picker-card .card-info {
  padding: 0.625rem;
}

.preset-picker-card .card-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ml-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-picker-card .card-source {
  position: absolute;
  top: 0.375rem;
  left: 0.375rem;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  border: 2px solid var(--ml-border-color);
}

.preset-picker-card .card-source.api {
  background: var(--ml-primary);
  color: var(--ml-text);
}

.preset-picker-card .card-source.user {
  background: var(--ml-warning);
  color: var(--ml-text);
}

.preset-picker-card .card-check {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  width: 22px;
  height: 22px;
  background-color: var(--ml-success);
  border: 2px solid var(--ml-border-color);
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
}

/* ========== 生成按钮 ========== */
.form-actions {
  margin-top: auto;
  padding-top: 1.25rem;
  display: flex;
  gap: 0.75rem;
}

.form-actions .clear-btn {
  flex-shrink: 0;
  height: 50px;
  padding: 0 1rem;
}

.generate-btn {
  flex: 1;
  height: 50px;
  font-size: 1rem;
}

.pending-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--ml-surface);
  border: 2px solid var(--ml-border-color);
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--ml-text);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.btn-loading {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--ml-border-color);
  border-top-color: var(--ml-primary-dark);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 0.5rem;
}

/* ========== 预览面板 ========== */
.preview-panel {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  max-height: 100%;
  background: var(--ml-surface);
  border-radius: var(--ml-radius);
  border: var(--ml-border);
  box-shadow: var(--ml-shadow);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
  overflow-y: auto;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.result-panel:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.result-panel::-webkit-scrollbar {
  width: 6px;
}

.result-panel::-webkit-scrollbar-track {
  background: transparent;
}

.result-panel::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.result-panel:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

/* 空状态 */
.empty-state {
  text-align: center;
  color: var(--ml-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.4;
}

.empty-state p {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}

/* 生成中状态 */
.generating-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
}

.generating-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem;
}

.loader {
  border: 4px solid var(--ml-bg-alt);
  border-top: 4px solid var(--ml-primary-dark);
  border-radius: 50%;
  width: 48px;
  height: 48px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.generating-info {
  text-align: center;
}

.generating-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--ml-text);
  margin: 0 0 0.75rem 0;
}

.generating-title .task-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ml-text-muted);
  margin-left: 0.5rem;
}

.generating-timer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--ml-primary-dark);
  margin: 0 0 0.5rem 0;
}

.generating-hint {
  font-size: 0.85rem;
  color: var(--ml-text-muted);
  margin: 0;
}

/* 结果容器 */
.result-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.success-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-height: 100%;
}

.output-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  justify-content: center;
  align-items: center;
}

.output-wrapper {
  position: relative;
  border-radius: var(--ml-radius);
  overflow: hidden;
  border: var(--ml-border);
  background-color: var(--ml-surface);
  transition: all 0.2s;
  box-shadow: var(--ml-shadow-sm);
}

.output-wrapper:hover {
  transform: translateY(-4px);
  box-shadow: var(--ml-shadow);
}

.output-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.output-wrapper img.clickable-image {
  cursor: zoom-in;
}

.output-wrapper video,
.output-wrapper audio {
  width: 100%;
  display: block;
}

/* 音频包装器 */
.audio-wrapper {
  position: relative;
  min-width: 280px;
  max-width: 400px;
}

.audio-wrapper:hover .audio-actions {
  opacity: 1;
  pointer-events: auto;
}

.output-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.5rem;
  background: rgba(0,0,0,0.6);
  display: flex;
  justify-content: flex-end;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.output-wrapper:hover .output-actions {
  opacity: 1;
  pointer-events: auto;
}

.output-actions.audio-actions {
  opacity: 0;
  position: absolute;
  top: 8px;
  right: 8px;
  bottom: auto;
  left: auto;
  padding: 0;
  background: transparent;
}

.action-btn {
  color: white;
  padding: 6px;
  cursor: pointer;
  font-size: 1rem;
  text-decoration: none;
}

.result-meta {
  margin-top: 1.5rem;
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  color: var(--ml-text-secondary);
  font-size: 0.9rem;
  font-weight: 600;
  border-top: 2px dashed var(--ml-border-color);
  padding-top: 1rem;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.success-badge {
  color: var(--ml-success);
}

/* 错误状态 */
.error-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1.5rem;
}

.error-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  border-color: var(--ml-error) !important;
}

.error-icon {
  font-size: 3rem;
}

.error-info {
  text-align: center;
}

.error-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--ml-error);
  margin: 0 0 0.5rem 0;
}

.error-msg {
  color: var(--ml-text);
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  max-width: 400px;
  word-break: break-word;
}

.error-meta {
  font-size: 0.85rem;
  color: var(--ml-text-muted);
  margin: 0;
}

.retry-btn {
  margin-top: 0.5rem;
}

/* ========== 上传区域 ========== */
.upload-area {
  margin-top: 0.5rem;
}

.upload-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.625rem;
  margin-bottom: 0.625rem;
}

.upload-item {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--ml-border-color);
  background-color: var(--ml-bg);
  transition: all 0.2s;
}

.upload-item:hover {
  transform: scale(1.05);
}

.upload-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-overlay {
  position: absolute;
  inset: 0;
  background: rgba(220, 38, 38, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  cursor: pointer;
  color: white;
  font-size: 1.2rem;
}

.upload-item:hover .upload-overlay {
  opacity: 1;
}

.upload-trigger {
  width: 60px;
  height: 60px;
  border: 3px dashed var(--ml-border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--ml-bg);
}

.upload-trigger:hover {
  border-color: var(--ml-primary-dark);
  background-color: var(--ml-primary-light);
  transform: scale(1.05);
}

.upload-icon {
  font-size: 1.5rem;
  transition: transform 0.2s;
}

.upload-trigger:hover .upload-icon {
  transform: scale(1.2);
}

.upload-tip {
  font-size: 0.75rem;
  color: var(--ml-text-muted);
  margin-top: 0.5rem;
}

/* 文本输出 */
.text-output {
  padding: 1rem;
  background-color: var(--ml-bg);
  border: var(--ml-border);
  border-radius: var(--ml-radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.6;
}

/* 文件链接 */
.file-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background-color: var(--ml-bg);
  border: var(--ml-border);
  border-radius: var(--ml-radius-sm);
  color: var(--ml-primary-dark);
  text-decoration: none;
  font-weight: 700;
  transition: all 0.2s;
}

.file-link:hover {
  background-color: var(--ml-primary-light);
  transform: translateY(-2px);
}

.upload-thumb {
  object-fit: cover;
}
</style>
