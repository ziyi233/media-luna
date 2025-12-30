<template>
  <div class="generate-layout">
        <!-- 左侧配置区 -->
        <div class="config-panel">
          <k-card class="config-card ml-scrollbar">
            <div class="form-section">
              <div class="section-title">
                <k-icon name="settings"></k-icon> 基础配置
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
                    <k-icon name="times" class="clear-btn" @click.stop="clearChannel" title="清除"></k-icon>
                  </template>
                  <template v-else>
                    <component :is="icons.channels" class="placeholder-icon"></component>
                    <span class="placeholder-text">点击选择渠道</span>
                    <k-icon name="chevron-right" class="arrow-icon"></k-icon>
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
                    <k-icon name="times" class="clear-btn" @click.stop="clearPreset" title="清除"></k-icon>
                  </template>
                  <template v-else>
                    <component :is="icons.presets" class="placeholder-icon"></component>
                    <span class="placeholder-text">点击选择预设</span>
                    <k-icon name="chevron-right" class="arrow-icon"></k-icon>
                  </template>
                </div>
              </div>
            </div>

            <div class="form-section flex-grow">
              <div class="section-title">
                 <k-icon name="edit"></k-icon> 提示词
              </div>
              <el-input
                v-model="form.prompt"
                type="textarea"
                :rows="8"
                placeholder="输入提示词，支持自然语言描述..."
                resize="none"
                class="prompt-input"
              ></el-input>
            </div>

            <!-- 文件上传区域 -->
            <div class="form-section">
              <div class="section-title">
                <k-icon name="image"></k-icon> 参考图片
              </div>
              <div class="upload-area">
                <!-- 已上传的图片列表 -->
                <div class="upload-list" v-if="fileList.length > 0">
                  <div v-for="(file, index) in fileList" :key="file.uid" class="upload-item">
                    <img :src="file.url" class="upload-thumb" />
                    <div class="upload-overlay" @click="removeFile(index)">
                      <k-icon name="delete"></k-icon>
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
                    accept="image/*"
                    multiple
                    style="display: none"
                    @change="handleFileSelect"
                  />
                  <k-icon name="add" class="upload-icon"></k-icon>
                </div>
                <div class="upload-tip">点击或拖拽上传参考图片</div>
              </div>
            </div>

            <div class="form-actions">
              <k-button solid type="primary" :loading="generating" @click="generate" class="generate-btn">
                <template #icon><k-icon name="magic"></k-icon></template>
                开始生成
              </k-button>
            </div>
          </k-card>
        </div>

        <!-- 中间区域 -->
        <div class="preview-panel ml-scrollbar">
          <!-- 渠道选择列表 -->
          <div v-if="pickerMode === 'channel'" class="picker-view">
            <div class="picker-header">
              <div class="picker-title-row">
                <div class="picker-title">
                  <k-icon name="link"></k-icon>
                  <span>选择渠道</span>
                  <span class="picker-count">{{ filteredChannels.length }}</span>
                </div>
                <k-button size="mini" @click="pickerMode = null" class="picker-close-btn">
                  <template #icon><k-icon name="times"></k-icon></template>
                </k-button>
              </div>
              <div class="picker-filters">
                <el-input
                  v-model="channelSearch"
                  placeholder="搜索..."
                  size="small"
                  clearable
                  class="picker-search"
                >
                  <template #prefix><k-icon name="search"></k-icon></template>
                </el-input>
                <el-select
                  v-model="channelConnectorFilter"
                  placeholder="全部连接器"
                  clearable
                  size="small"
                  class="picker-filter"
                >
                  <el-option
                    v-for="conn in connectors"
                    :key="conn.id"
                    :label="conn.name"
                    :value="conn.id"
                  />
                </el-select>
              </div>
            </div>
            <div class="picker-grid">
              <div
                v-for="channel in filteredChannels"
                :key="channel.id"
                class="picker-card"
                :class="{ selected: form.channel === channel.id }"
                @click="selectChannel(channel)"
              >
                <div class="picker-card-icon">
                  <img
                    v-if="getConnectorIconUrl(channel.connectorId)"
                    :src="getConnectorIconUrl(channel.connectorId)"
                  />
                  <k-icon v-else name="link"></k-icon>
                </div>
                <div class="picker-card-name">{{ channel.name }}</div>
                <k-icon v-if="form.channel === channel.id" name="check" class="picker-card-check"></k-icon>
              </div>
              <div v-if="filteredChannels.length === 0" class="picker-empty">
                <k-icon name="search"></k-icon>
                <span>没有找到匹配的渠道</span>
              </div>
            </div>
          </div>

          <!-- 预设选择列表 -->
          <div v-else-if="pickerMode === 'preset'" class="picker-view">
            <div class="picker-header">
              <div class="picker-title-row">
                <div class="picker-title">
                  <k-icon name="bookmark"></k-icon>
                  <span>选择预设</span>
                  <span class="picker-count">{{ filteredPresetsCount }}</span>
                </div>
                <k-button size="mini" @click="pickerMode = null" class="picker-close-btn">
                  <template #icon><k-icon name="times"></k-icon></template>
                </k-button>
              </div>
              <div class="picker-filters">
                <el-input
                  v-model="presetSearch"
                  placeholder="搜索..."
                  size="small"
                  clearable
                  class="picker-search"
                >
                  <template #prefix><k-icon name="search"></k-icon></template>
                </el-input>
                <el-select
                  v-model="presetSourceFilter"
                  placeholder="全部来源"
                  clearable
                  size="small"
                  class="picker-filter"
                >
                  <el-option label="本地" value="user" />
                  <el-option label="远程" value="api" />
                </el-select>
              </div>
            </div>
            <div class="preset-picker-content ml-scrollbar">
              <div class="ml-masonry">
                <template v-for="preset in presets" :key="preset.id">
                  <div v-if="matchPresetFilter(preset)" class="ml-masonry-item">
                    <div
                      class="preset-picker-card"
                      :class="{ selected: presetId === preset.id }"
                      @click="selectPreset(preset)"
                    >
                      <!-- 缩略图 -->
                      <div class="card-thumb" v-if="preset.thumbnail">
                        <img :src="preset.thumbnail" loading="lazy" />
                      </div>
                      <div class="card-thumb empty" v-else>
                        <k-icon name="image"></k-icon>
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
                      <k-icon v-if="presetId === preset.id" name="check" class="card-check"></k-icon>
                    </div>
                  </div>
                </template>
              </div>
              <div v-if="filteredPresetsCount === 0" class="picker-empty">
                <k-icon name="search"></k-icon>
                <span>没有找到匹配的预设</span>
              </div>
            </div>
          </div>

          <!-- 生成中状态 -->
          <div v-else-if="generating" class="generating-state">
            <div class="generating-content">
              <div class="loader"></div>
              <div class="generating-info">
                <p class="generating-title">正在生成中...</p>
                <p class="generating-timer">
                  <k-icon name="stopwatch"></k-icon>
                  已用时间: {{ formatElapsedTime(elapsedTime) }}
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
                        <k-icon name="download"></k-icon>
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
                          <k-icon name="download"></k-icon>
                        </a>
                      </div>
                    </div>
                  </template>
                  <!-- 其他文件 -->
                  <template v-else-if="asset.kind === 'file'">
                    <a :href="asset.url" target="_blank" class="file-link">
                      <k-icon name="file"></k-icon>
                      {{ asset.meta?.filename || '下载文件' }}
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
                  <k-icon name="check-circle"></k-icon> 生成成功
                </span>
                <span class="meta-item" v-if="result.duration">
                  <k-icon name="stopwatch"></k-icon> 耗时: {{ formatElapsedTime(result.duration) }}
                </span>
                <span class="meta-item" v-if="result.taskId">
                  <k-icon name="list-alt"></k-icon> 任务 ID: {{ result.taskId }}
                </span>
              </div>
            </div>

            <!-- 失败状态 -->
            <div v-else class="error-result">
              <div class="error-content">
                <k-icon name="exclamation-triangle" class="error-icon"></k-icon>
                <div class="error-info">
                  <p class="error-title">生成失败</p>
                  <p class="error-msg">{{ result.error || '未知错误' }}</p>
                  <p class="error-meta" v-if="result.taskId">任务 ID: {{ result.taskId }}</p>
                  <p class="error-meta" v-if="result.duration">耗时: {{ formatElapsedTime(result.duration) }}</p>
                </div>
              </div>
              <k-button class="retry-btn" @click="generate">
                <template #icon><k-icon name="refresh"></k-icon></template>
                重新生成
              </k-button>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else class="empty-state">
            <k-icon name="image" class="empty-icon"></k-icon>
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
import { message } from '@koishijs/client'
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
  raw: File
}

// 选择模式状态
type PickerMode = 'channel' | 'preset' | null
const pickerMode = ref<PickerMode>(null)

// 数据
const channels = ref<ChannelConfig[]>([])
const presets = ref<PresetData[]>([])
const connectors = ref<ConnectorDefinition[]>([])
const generating = ref(false)
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
  await addFiles(Array.from(files).filter(f => f.type.startsWith('image/')))
}

// 添加文件
const addFiles = async (files: File[]) => {
  for (const file of files) {
    const url = URL.createObjectURL(file)
    fileList.value.push({
      uid: ++fileUid,
      url,
      raw: file
    })

    try {
      const base64 = await fileToBase64(file)
      uploadedFiles.value.push({
        type: 'image',
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
    URL.revokeObjectURL(file.url)
    fileList.value.splice(index, 1)
    uploadedFiles.value.splice(index, 1)
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
    message.warning('请选择渠道')
    return
  }

  generating.value = true
  result.value = null
  currentTaskId.value = null
  startTimer()

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

    const res = await generateApi.generate(params)

    // 更新 taskId
    if (res.taskId) {
      currentTaskId.value = res.taskId
    }

    // 如果成功，直接使用结果
    if (res.success) {
      result.value = res
      historyGalleryRef.value?.refresh()
    } else {
      // API 返回失败，但可能任务实际成功了，尝试通过 taskId 获取
      if (res.taskId) {
        // 等待一小段时间让后端完成处理
        await new Promise(resolve => setTimeout(resolve, 500))
        const taskResult = await fetchTaskResult(res.taskId)
        if (taskResult && taskResult.success) {
          result.value = taskResult
          historyGalleryRef.value?.refresh()
        } else {
          result.value = res
        }
      } else {
        result.value = res
      }
    }
  } catch (e: any) {
    // 请求异常，尝试通过 taskId 恢复
    if (currentTaskId.value) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const taskResult = await fetchTaskResult(currentTaskId.value)
      if (taskResult) {
        result.value = taskResult
        if (taskResult.success) {
          historyGalleryRef.value?.refresh()
        }
      } else {
        result.value = { success: false, error: e.message || '请求失败' }
      }
    } else {
      result.value = { success: false, error: e.message || '请求失败' }
    }
  } finally {
    stopTimer()
    generating.value = false
  }
}

// 处理历史记录选择（点击历史任务时填充提示词）
const handleHistorySelect = (task: { prompt: string }) => {
  if (task.prompt) {
    form.value.prompt = task.prompt
  }
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

<style scoped>
.generate-layout {
  display: flex;
  gap: 1.25rem;
  height: 100%;
  min-height: 0;
  padding: 0.25rem;
}

.config-panel {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.config-card {
  padding: 1.5rem;
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: linear-gradient(180deg, var(--k-card-bg) 0%, rgba(var(--k-color-primary-rgb), 0.02) 100%);
  border: 1px solid var(--k-color-border);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  transition: border-color 0.3s, box-shadow 0.3s;
}

.config-card:hover {
  border-color: rgba(var(--k-color-primary-rgb), 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.form-section {
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid rgba(var(--k-color-primary-rgb), 0.08);
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

.form-section.flex-grow :deep(.el-textarea) {
  flex-grow: 1;
}

.form-section.flex-grow :deep(.el-textarea__inner) {
  height: 100% !important;
  border-radius: 10px;
  background-color: var(--k-color-bg-2);
  border: 1px solid var(--k-color-border);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-section.flex-grow :deep(.el-textarea__inner:focus) {
  border-color: var(--k-color-active);
  box-shadow: 0 0 0 3px rgba(var(--k-color-primary-rgb), 0.1);
}

.section-title {
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: var(--k-color-text);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-title .k-icon {
  color: var(--k-color-active);
  font-size: 0.9rem;
}

.form-item {
  margin-bottom: 1rem;
}

.form-item:last-child {
  margin-bottom: 0;
}

.label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--k-color-text-description);
  margin-bottom: 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.label .optional {
  font-size: 0.65rem;
  opacity: 0.6;
  font-weight: 400;
}

/* ========== 选择触发器样式 ========== */
.selection-trigger {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 0.875rem;
  background: var(--k-color-bg-2);
  border: 1px solid var(--k-color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 44px;
  position: relative;
  overflow: hidden;
}

.selection-trigger::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(var(--k-color-primary-rgb), 0.05) 0%, transparent 50%);
  opacity: 0;
  transition: opacity 0.25s;
}

.selection-trigger:hover {
  border-color: var(--k-color-active);
  background-color: var(--k-color-bg-1);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.selection-trigger:hover::before {
  opacity: 1;
}

.selection-trigger.active {
  border-color: var(--k-color-active);
  box-shadow: 0 0 0 3px rgba(var(--k-color-primary-rgb), 0.12);
}

.selection-trigger.selected {
  background: linear-gradient(135deg, rgba(var(--k-color-primary-rgb), 0.08) 0%, var(--k-card-bg) 100%);
  border-color: var(--k-color-active);
  border-width: 1.5px;
}

.selection-info {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.selection-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: contain;
  flex-shrink: 0;
  background-color: var(--k-color-bg-1);
  padding: 2px;
}

.selection-thumb {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.selection-icon-fallback {
  width: 28px;
  height: 28px;
  padding: 4px;
  box-sizing: border-box;
  color: var(--k-color-active);
  background-color: rgba(var(--k-color-primary-rgb), 0.1);
  border-radius: 6px;
  flex-shrink: 0;
}

.selection-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--k-color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.placeholder-icon {
  color: var(--k-color-text-description);
  opacity: 0.5;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.placeholder-text {
  flex: 1;
  font-size: 0.8rem;
  color: var(--k-color-text-description);
  opacity: 0.8;
}

.arrow-icon {
  color: var(--k-color-text-description);
  font-size: 0.75rem;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.6;
}

.selection-trigger:hover .arrow-icon {
  color: var(--k-color-active);
  transform: translateX(3px);
  opacity: 1;
}

.clear-btn {
  padding: 6px;
  color: var(--k-color-text-description);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  border-radius: 4px;
  position: relative;
  z-index: 1;
}

.clear-btn:hover {
  color: var(--k-color-error, #f56c6c);
  background-color: rgba(245, 108, 108, 0.1);
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
  border-bottom: 1px solid rgba(var(--k-color-primary-rgb), 0.1);
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
  font-size: 1rem;
  font-weight: 700;
  color: var(--k-color-text);
  white-space: nowrap;
}

.picker-title .k-icon {
  color: var(--k-color-active);
  font-size: 1rem;
}

.picker-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 20px;
  padding: 0 6px;
  font-size: 0.7rem;
  font-weight: 600;
  color: white;
  background-color: var(--k-color-active);
  border-radius: 10px;
}

.picker-close-btn {
  flex-shrink: 0;
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

.picker-search :deep(.el-input__wrapper) {
  border-radius: 8px;
  background-color: var(--k-color-bg-2);
  box-shadow: none;
  border: 1px solid var(--k-color-border);
  transition: all 0.2s;
}

.picker-search :deep(.el-input__wrapper:hover) {
  border-color: var(--k-color-active);
}

.picker-search :deep(.el-input__wrapper.is-focus) {
  border-color: var(--k-color-active);
  box-shadow: 0 0 0 2px rgba(var(--k-color-primary-rgb), 0.1);
}

.picker-search :deep(.el-input__prefix) {
  color: var(--k-color-text-description);
}

.picker-filter {
  width: 120px;
  flex-shrink: 0;
}

.picker-filter :deep(.el-select__wrapper) {
  border-radius: 8px;
  background-color: var(--k-color-bg-2);
  box-shadow: none;
  border: 1px solid var(--k-color-border);
  min-height: 32px;
  transition: all 0.2s;
}

.picker-filter :deep(.el-select__wrapper:hover) {
  border-color: var(--k-color-active);
}

.picker-filter :deep(.el-select__wrapper.is-focused) {
  border-color: var(--k-color-active);
  box-shadow: 0 0 0 2px rgba(var(--k-color-primary-rgb), 0.1);
}

/* 渠道选择卡片网格 */
.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.875rem;
  flex: 1;
  align-content: start;
  overflow-y: auto;
  padding: 0.25rem;
}

.picker-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.625rem;
  padding: 1.125rem 0.875rem;
  background: var(--k-card-bg);
  border: 1px solid var(--k-color-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.picker-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(var(--k-color-primary-rgb), 0.05) 0%, transparent 50%);
  opacity: 0;
  transition: opacity 0.25s;
  pointer-events: none;
}

.picker-card:hover {
  background-color: var(--k-color-bg-1);
  border-color: var(--k-color-active);
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

.picker-card:hover::before {
  opacity: 1;
}

.picker-card.selected {
  border-color: var(--k-color-active);
  border-width: 2px;
  background: linear-gradient(135deg, rgba(var(--k-color-primary-rgb), 0.1) 0%, var(--k-card-bg) 100%);
  box-shadow: 0 0 0 3px rgba(var(--k-color-primary-rgb), 0.1);
}

.picker-card-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--k-color-bg-2);
  border-radius: 10px;
  position: relative;
  z-index: 1;
}

.picker-card-icon img {
  width: 30px;
  height: 28px;
  object-fit: contain;
}

.picker-card-icon .k-icon {
  font-size: 1.5rem;
  color: var(--k-color-active);
  opacity: 0.8;
}

.picker-card-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--k-color-text);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  line-height: 1.4;
  position: relative;
  z-index: 1;
}

.picker-card-check {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 22px;
  height: 22px;
  background-color: var(--k-color-active);
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.picker-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem;
  color: var(--k-color-text-description);
}

.picker-empty .k-icon {
  font-size: 2.5rem;
  opacity: 0.3;
}

/* ========== 预设选择器样式（复用 PresetsView 的卡片样式） ========== */
.preset-picker-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.5rem;
}

/* 瀑布流布局覆盖 */
.preset-picker-content .ml-masonry {
  columns: 4;
  column-gap: 0.75rem;
}

.preset-picker-content .ml-masonry-item {
  break-inside: avoid;
  margin-bottom: 0.75rem;
}

@media (max-width: 1200px) {
  .preset-picker-content .ml-masonry { columns: 3; }
}

@media (max-width: 900px) {
  .preset-picker-content .ml-masonry { columns: 2; }
}

/* 预设卡片 */
.preset-picker-card {
  background: var(--k-card-bg);
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.preset-picker-card:hover {
  border-color: var(--k-color-active);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.preset-picker-card.selected {
  border-color: var(--k-color-active);
  border-width: 2px;
  box-shadow: 0 0 0 2px rgba(var(--k-color-primary-rgb), 0.2);
}

.preset-picker-card:hover .card-thumb img {
  transform: scale(1.03);
}

/* 缩略图 */
.preset-picker-card .card-thumb {
  width: 100%;
  position: relative;
  overflow: hidden;
  background: var(--k-color-bg-2);
}

.preset-picker-card .card-thumb img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform 0.3s;
}

.preset-picker-card .card-thumb.empty {
  aspect-ratio: 4/3;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--k-color-text-description);
  opacity: 0.4;
  font-size: 2rem;
}

/* 底部信息 */
.preset-picker-card .card-info {
  padding: 0.5rem 0.625rem;
}

.preset-picker-card .card-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--k-color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 来源标记 */
.preset-picker-card .card-source {
  position: absolute;
  top: 0.375rem;
  left: 0.375rem;
  font-size: 0.6rem;
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: 600;
}

.preset-picker-card .card-source.api {
  background: var(--k-color-active);
  color: white;
}

.preset-picker-card .card-source.user {
  background: var(--k-color-warning, #e6a23c);
  color: white;
}

/* 选中标记 */
.preset-picker-card .card-check {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  width: 22px;
  height: 22px;
  background-color: var(--k-color-active);
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.form-actions {
  margin-top: auto;
  padding-top: 1.25rem;
}

.generate-btn {
  width: 100%;
  height: 46px;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: linear-gradient(135deg, var(--k-color-primary) 0%, var(--k-color-primary-dark, var(--k-color-primary)) 100%);
  border: none;
  border-radius: 10px;
  position: relative;
  overflow: hidden;
}

.generate-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%);
  opacity: 0;
  transition: opacity 0.3s;
}

.generate-btn:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(var(--k-color-primary-rgb), 0.45);
  filter: brightness(1.08);
}

.generate-btn:not(:disabled):hover::before {
  opacity: 1;
}

.generate-btn:not(:disabled):active {
  transform: translateY(0);
  box-shadow: 0 4px 12px rgba(var(--k-color-primary-rgb), 0.3);
}

.preview-panel {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  background: linear-gradient(180deg, var(--k-card-bg) 0%, rgba(var(--k-color-primary-rgb), 0.02) 100%);
  border-radius: 16px;
  border: 1px solid var(--k-color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
  overflow-y: auto;
  transition: border-color 0.3s, box-shadow 0.3s;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.preview-panel:hover {
  border-color: rgba(var(--k-color-primary-rgb), 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

/* States */
.empty-state {
  text-align: center;
  color: var(--k-color-text-description);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-icon {
  font-size: 4.5rem;
  margin-bottom: 1.25rem;
  opacity: 0.15;
  color: var(--k-color-text);
}

.empty-state p {
  font-size: 0.9rem;
  opacity: 0.7;
  margin: 0;
}

/* 生成中状态 - 增强样式 */
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
  background: linear-gradient(135deg, rgba(var(--k-color-primary-rgb), 0.05) 0%, rgba(var(--k-color-primary-rgb), 0.02) 100%);
  border-radius: 16px;
  border: 1px solid rgba(var(--k-color-primary-rgb), 0.1);
}

.loader {
  border: 4px solid var(--k-color-bg-2);
  border-top: 4px solid var(--k-color-active);
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
  font-weight: 600;
  color: var(--k-color-text);
  margin: 0 0 0.75rem 0;
}

.generating-timer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--k-color-active);
  margin: 0 0 0.5rem 0;
  font-variant-numeric: tabular-nums;
}

.generating-hint {
  font-size: 0.85rem;
  color: var(--k-color-text-description);
  margin: 0;
}

/* Result */
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
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--k-color-border);
  background-color: var(--k-card-bg);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.output-wrapper:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  border-color: transparent;
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

/* 音频包装器样式 */
.audio-wrapper {
  position: relative;
  min-width: 280px;
  max-width: 400px;
}

.audio-wrapper:hover .audio-actions {
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
  transition: opacity 0.2s;
  pointer-events: none;
}

.output-actions.audio-actions .action-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.output-actions.audio-actions .action-btn:hover {
  background: rgba(0, 0, 0, 0.7);
  transform: scale(1.1);
}

.output-wrapper:has(.audio-wrapper) {
  border: none;
  box-shadow: none;
  background: transparent;
}

.output-wrapper:has(.audio-wrapper):hover {
  transform: none;
  box-shadow: none;
}

.output-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.5rem;
  background: rgba(0,0,0,0.5);
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

.action-btn {
  color: white;
  padding: 4px;
  cursor: pointer;
}

.result-meta {
  margin-top: 1.5rem;
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  color: var(--k-color-text-description);
  font-size: 0.9rem;
  border-top: 1px solid var(--k-color-border);
  padding-top: 1rem;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.success-badge {
  color: var(--k-color-success, #67c23a);
  font-weight: 600;
}

/* 错误状态 - 增强样式 */
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
  background: linear-gradient(135deg, rgba(245, 108, 108, 0.08) 0%, rgba(245, 108, 108, 0.02) 100%);
  border-radius: 16px;
  border: 1px solid rgba(245, 108, 108, 0.2);
}

.error-icon {
  font-size: 3rem;
  color: var(--k-color-error, #f56c6c);
}

.error-info {
  text-align: center;
}

.error-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--k-color-error, #f56c6c);
  margin: 0 0 0.5rem 0;
}

.error-msg {
  color: var(--k-color-text);
  margin: 0 0 0.5rem 0;
  max-width: 400px;
  word-break: break-word;
}

.error-meta {
  font-size: 0.85rem;
  color: var(--k-color-text-description);
  margin: 0;
}

.retry-btn {
  margin-top: 0.5rem;
}

/* Upload Area */
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
  border: 1px solid var(--k-color-border);
  background-color: var(--k-color-bg-2);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  transition: all 0.2s;
}

.upload-item:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.upload-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(245, 108, 108, 0.85) 0%, rgba(220, 80, 80, 0.9) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.25s;
  cursor: pointer;
  color: white;
  font-size: 1.1rem;
}

.upload-item:hover .upload-overlay {
  opacity: 1;
}

.upload-trigger {
  width: 60px;
  height: 60px;
  border: 2px dashed var(--k-color-border);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: var(--k-color-bg-2);
  position: relative;
}

.upload-trigger::before {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 4px;
  background: rgba(var(--k-color-primary-rgb), 0.05);
  opacity: 0;
  transition: opacity 0.25s;
}

.upload-trigger:hover {
  border-color: var(--k-color-active);
  background-color: var(--k-color-bg-1);
  transform: scale(1.05);
}

.upload-trigger:hover::before {
  opacity: 1;
}

.upload-icon {
  font-size: 1.35rem;
  color: var(--k-color-text-description);
  transition: all 0.25s;
  position: relative;
  z-index: 1;
}

.upload-trigger:hover .upload-icon {
  color: var(--k-color-active);
  transform: scale(1.1);
}

.upload-tip {
  font-size: 0.7rem;
  color: var(--k-color-text-description);
  margin-top: 0.5rem;
  opacity: 0.7;
}

/* Text output */
.text-output {
  padding: 1rem;
  background-color: var(--k-color-bg-2);
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.6;
}

/* File link */
.file-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background-color: var(--k-color-bg-2);
  border-radius: 6px;
  color: var(--k-color-active);
  text-decoration: none;
  transition: background-color 0.2s;
}

.file-link:hover {
  background-color: var(--k-color-bg-3);
}
</style>
