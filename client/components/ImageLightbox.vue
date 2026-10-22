<template>
  <teleport to="#ml-teleport-container" defer>
    <transition name="lightbox-fade">
      <div v-if="visible" class="lightbox-overlay" @click.self="close">
        <div class="lightbox-container">
          <div class="lightbox-content">
            <!-- 左侧媒体区域 -->
            <div class="lightbox-media-area" @click.self="close">
              <!-- 加载中 -->
              <div v-if="loading" class="loading-state">
                <k-icon name="refresh" class="spin" />
              </div>

              <template v-else>
                <!-- 多媒体时的导航 -->
                <button v-if="mediaList.length > 1" class="nav-btn prev" @click.stop="prevMedia" title="上一个">
                  <span><k-icon name="chevron-left" /></span>
                </button>

                <!-- 无媒体时的状态占位 -->
                <div v-if="mediaList.length === 0" class="no-media-placeholder">
                  <template v-if="taskData?.status === 'processing' || taskData?.status === 'pending'">
                    <k-icon name="loader" class="placeholder-icon spin" />
                    <span class="placeholder-text">{{ taskData.status === 'processing' ? '生成中...' : '等待中...' }}</span>
                  </template>
                  <template v-else-if="taskData?.status === 'failed'">
                    <k-icon name="times-full" class="placeholder-icon" />
                    <span class="placeholder-text">生成失败</span>
                    <span v-if="errorMessage" class="placeholder-error">{{ errorMessage }}</span>
                  </template>
                  <template v-else>
                    <span class="placeholder-icon"><k-icon name="inbox" /></span>
                    <span class="placeholder-text">无输出内容</span>
                  </template>
                </div>

                <!-- 图片 -->
                <img v-if="currentMedia?.kind === 'image'" :src="currentMedia.url" class="lightbox-image" alt="Preview" />

                <!-- 视频 -->
                <video
                  v-else-if="currentMedia?.kind === 'video'"
                  :src="currentMedia.url"
                  class="lightbox-video"
                  controls
                  autoplay
                  @loadedmetadata="handleMediaMetadata($event, currentMedia.url)"
                />

                <!-- 音频 -->
                <div v-else-if="currentMedia?.kind === 'audio'" class="lightbox-audio-container">
                  <AudioPlayer
                    :src="currentMedia.url"
                    large
                    @click.stop
                  />
                </div>

                <button v-if="mediaList.length > 1" class="nav-btn next" @click.stop="nextMedia" title="下一个">
                  <span><k-icon name="chevron-right" /></span>
                </button>

                <!-- 媒体计数器 -->
                <div v-if="mediaList.length > 1" class="media-counter">
                  {{ currentIndex + 1 }} / {{ mediaList.length }}
                </div>
              </template>
            </div>

            <!-- 右侧信息栏 -->
            <div class="lightbox-sidebar" v-if="showSidebar">
              <div class="sidebar-header">
                <div class="info-title">{{ sidebarTitle }}</div>
                <button class="header-close-btn" @click="close" title="关闭">
                  <span><k-icon name="close" /></span>
                </button>
              </div>

              <div class="sidebar-body">
                <!-- 创建者（仅在 taskId 模式下显示） -->
                <div class="info-block" v-if="isTaskIdMode">
                  <div class="block-header">
                    <span>创建者</span>
                  </div>
                  <div class="user-info" v-if="taskData?.uid">
                    <img
                      v-if="userInfo?.avatar"
                      :src="userInfo.avatar"
                      class="user-avatar"
                      @error="($event.target as HTMLImageElement).style.display = 'none'"
                    />
                    <div v-else class="user-avatar-placeholder">
                      <span><k-icon name="user" /></span>
                    </div>
                    <span class="user-name">{{ userInfo?.name || `UID: ${taskData.uid}` }}</span>
                  </div>
                  <div class="user-info" v-else>
                    <div class="user-avatar-placeholder">
                      <span><k-icon name="user" /></span>
                    </div>
                    <span class="user-name">匿名用户</span>
                  </div>
                </div>

                <!-- 参考图（用户输入的图片） -->
                <div class="info-block" v-if="inputImages.length > 0">
                  <div class="block-header">
                    <span>参考图</span>
                    <span class="ref-count">{{ inputImages.length }}张</span>
                  </div>
                  <div class="reference-images">
                    <div
                      v-for="(img, idx) in inputImages"
                      :key="idx"
                      class="reference-thumb"
                      @click="openUrl(img.url)"
                      :title="img.filename"
                    >
                      <img :src="img.url" :alt="img.filename" />
                    </div>
                  </div>
                </div>

                <!-- 使用的预设 -->
                <div class="info-block" v-if="presetInfo">
                  <div class="block-header">
                    <span>使用预设</span>
                  </div>
                  <div class="preset-tag">
                    <k-icon name="image" class="preset-icon" />
                    <span class="preset-name">{{ presetInfo.name }}</span>
                    <span v-if="presetInfo.referenceCount > 0" class="preset-ref">
                      +{{ presetInfo.referenceCount }}图
                    </span>
                  </div>
                </div>

                <!-- 提示词 -->
                <div class="info-block">
                  <div class="block-header">
                    <span>提示词</span>
                    <button v-if="displayPrompt" class="copy-btn" @click="copyPrompt">
                      复制
                    </button>
                  </div>
                  <div class="prompt-content" :class="{ empty: !displayPrompt }">
                    {{ displayPrompt || '无提示词' }}
                  </div>
                </div>

                <!-- 创建时间 -->
                <div class="info-block" v-if="displayCreatedAt">
                  <div class="block-header">
                    <span>创建时间</span>
                  </div>
                  <div class="info-value">{{ formatDate(displayCreatedAt) }}</div>
                </div>

                <!-- 生成耗时 -->
                <div class="info-block" v-if="displayDuration">
                  <div class="block-header">
                    <span>生成耗时</span>
                  </div>
                  <div class="info-value">{{ formatDuration(displayDuration) }}</div>
                </div>

                <!-- 渠道 -->
                <div class="info-block" v-if="taskData?.channelId">
                  <div class="block-header">
                    <span>渠道</span>
                  </div>
                  <div class="info-value">ID: {{ taskData.channelId }}</div>
                </div>
              </div>

              <div class="sidebar-footer">
                <template v-if="mediaList.length > 0">
                  <div class="footer-row">
                    <button class="pop-btn primary" @click="openOriginal">
                      <k-icon name="link" /> {{ currentMedia?.kind === 'audio' ? '音频' : currentMedia?.kind === 'video' ? '视频' : '原图' }}
                    </button>
                    <button class="pop-btn" @click="downloadMedia">
                      <k-icon name="download" /> 下载
                    </button>
                  </div>
                  <button v-if="canSaveAsPreset" class="pop-btn full-width" @click="openSaveAsPreset">
                    <k-icon name="image" /> 保存为预设
                  </button>
                </template>
                <template v-else>
                  <div class="footer-status">
                    <StatusBadge v-if="taskData" :status="taskData.status" />
                    <span class="footer-task-id">#{{ taskData?.id }}</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 保存为预设对话框 -->
    <PresetDialog
      v-model:visible="presetDialogVisible"
      :prefill="presetPrefill"
      @saved="handlePresetSaved"
    />
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { taskApi, userApi } from '../api'
import type { TaskData, AssetKind } from '../types'
import { copyToClipboard } from '../utils/clipboard'
import AudioPlayer from './AudioPlayer.vue'
import PresetDialog from './PresetDialog.vue'
import StatusBadge from './StatusBadge.vue'

/** 媒体项 */
interface MediaItem {
  kind: AssetKind
  url: string
}

interface Props {
  visible: boolean
  // 模式1: 传入 taskId，组件自己获取数据
  taskId?: number | null
  // 模式2: 直接传入数据（用于 GenerateView 等场景）
  images?: string[]
  // 模式3: 传入媒体数组（支持多种媒体类型）
  media?: MediaItem[]
  prompt?: string
  duration?: number
  createdAt?: Date | string
  // 通用选项
  initialIndex?: number
  showSidebar?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  initialIndex: 0,
  showSidebar: true
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
}>()

// 状态
const loading = ref(false)
const taskData = ref<TaskData | null>(null)
const userInfo = ref<{ name?: string; avatar?: string; platform?: string } | null>(null)
const currentIndex = ref(props.initialIndex)

// 判断是否使用 taskId 模式
const isTaskIdMode = computed(() => !!props.taskId && !props.images?.length && !props.media?.length)

// 计算属性：媒体列表（支持三种模式）
const mediaList = computed<MediaItem[]>(() => {
  // 直接传入 media 时优先使用
  if (props.media?.length) {
    return props.media
  }
  // 传入 images 时转换为 MediaItem
  if (props.images?.length) {
    return props.images.map(url => ({ kind: 'image' as AssetKind, url }))
  }
  // 否则从任务数据中提取
  if (!taskData.value?.responseSnapshot) return []
  return taskData.value.responseSnapshot
    .filter(asset => ['image', 'video', 'audio'].includes(asset.kind) && asset.url)
    .map(asset => ({ kind: asset.kind, url: asset.url! }))
})

const currentMedia = computed<MediaItem | null>(() => mediaList.value[currentIndex.value] || null)

// 侧边栏标题（根据媒体类型动态显示）
const sidebarTitle = computed(() => {
  if (mediaList.value.length === 0) return '任务详情'
  const kind = currentMedia.value?.kind
  if (kind === 'audio') return '音频详情'
  if (kind === 'video') return '视频详情'
  return '图片详情'
})

/** 处理视频加载元数据事件 */
const handleMediaMetadata = (_e: Event, _url: string) => {
  // 视频时长处理（如需记录可在此扩展）
}

// 显示的提示词（支持两种模式）
const displayPrompt = computed(() => {
  // 直接传入 prompt 时优先使用
  if (props.prompt !== undefined) {
    return props.prompt
  }
  // 否则从任务数据中提取
  if (!taskData.value) return ''
  const logs = taskData.value.middlewareLogs as any
  return logs?.preset?.transformedPrompt
    || taskData.value.requestSnapshot?.prompt
    || ''
})

// 显示的持续时间（支持两种模式）
const displayDuration = computed(() => {
  if (props.duration !== undefined) {
    return props.duration
  }
  return taskData.value?.duration || null
})

// 显示的创建时间（支持两种模式）
const displayCreatedAt = computed(() => {
  if (props.createdAt) {
    return props.createdAt
  }
  return taskData.value?.startTime || null
})

// 输入参考图（用户上传的图片）
interface InputImage {
  url: string
  filename: string
}

const inputImages = computed<InputImage[]>(() => {
  if (!taskData.value) return []
  const logs = taskData.value.middlewareLogs as any
  const storageInput = logs?.['storage-input']
  if (!storageInput?.logs?.length) return []
  return storageInput.logs.map((log: any) => ({
    url: log.url as string,
    filename: (log.filename || '参考图') as string
  }))
})

// 预设信息
const presetInfo = computed(() => {
  if (!taskData.value) return null
  const logs = taskData.value.middlewareLogs as any
  const preset = logs?.preset
  if (!preset?.presetName) return null
  return {
    id: preset.presetId,
    name: preset.presetName,
    referenceCount: preset.referenceImagesInjected || 0
  }
})

// 错误信息（用于失败任务占位显示）
const errorMessage = computed(() => {
  if (!taskData.value) return ''
  const logs = taskData.value.middlewareLogs as any
  return logs?.request?.error || ''
})

// 获取任务数据
const fetchTaskData = async () => {
  if (!props.taskId) {
    taskData.value = null
    return
  }

  loading.value = true
  try {
    console.log('[ImageLightbox] Fetching task data for taskId:', props.taskId)
    const result = await taskApi.get(props.taskId)
    console.log('[ImageLightbox] Task data:', result)
    console.log('[ImageLightbox] Task uid:', result?.uid)
    taskData.value = result

    // 获取用户信息
    if (result?.uid) {
      console.log('[ImageLightbox] Fetching user info for uid:', result.uid)
      const userResult = await userApi.batch([result.uid])
      console.log('[ImageLightbox] User result:', userResult)
      userInfo.value = userResult[result.uid] || null
      console.log('[ImageLightbox] User info:', userInfo.value)
    } else {
      console.log('[ImageLightbox] No uid in task data')
      userInfo.value = null
    }
  } catch (e) {
    console.error('Failed to fetch task data:', e)
    taskData.value = null
  } finally {
    loading.value = false
  }
}

// 监听 visible 变化
watch(() => props.visible, (val) => {
  if (val) {
    currentIndex.value = props.initialIndex
    document.body.style.overflow = 'hidden'
    // 只在 taskId 模式下获取数据
    if (isTaskIdMode.value) {
      fetchTaskData()
    }
  } else {
    document.body.style.overflow = ''
  }
})

// 监听 taskId 变化
watch(() => props.taskId, () => {
  if (props.visible && isTaskIdMode.value) {
    fetchTaskData()
  }
})

// 监听 initialIndex 变化
watch(() => props.initialIndex, (val) => {
  currentIndex.value = val
})

const close = () => {
  emit('update:visible', false)
  emit('close')
}

const prevMedia = () => {
  currentIndex.value = (currentIndex.value - 1 + mediaList.value.length) % mediaList.value.length
}

const nextMedia = () => {
  currentIndex.value = (currentIndex.value + 1) % mediaList.value.length
}

const copyPrompt = async () => {
  if (!displayPrompt.value) return
  const ok = await copyToClipboard(displayPrompt.value)
  if (ok) alert('已复制提示词')
  else alert('复制失败，请手动复制')
}

const openOriginal = () => {
  if (currentMedia.value?.url) {
    window.open(currentMedia.value.url, '_blank')
  }
}

const openUrl = (url: string) => {
  window.open(url, '_blank')
}

const downloadMedia = async () => {
  if (!currentMedia.value?.url) return

  const kind = currentMedia.value.kind
  const ext = kind === 'audio' ? 'mp3' : kind === 'video' ? 'mp4' : 'png'
  const filename = `${kind}-${Date.now()}.${ext}`

  try {
    // 通过 fetch 获取 blob 实现真正下载（绕过跨域限制）
    const response = await fetch(currentMedia.value.url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    link.click()

    // 清理 blob URL
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
  } catch (e) {
    // 如果 fetch 失败（如 CORS 问题），回退到直接打开
    console.warn('Download failed, opening in new tab:', e)
    window.open(currentMedia.value.url, '_blank')
    alert('无法直接下载，已在新标签页打开')
  }
}

const formatDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString()
}

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// 键盘导航
const handleKeydown = (e: KeyboardEvent) => {
  if (!props.visible) return

  if (e.key === 'Escape') {
    close()
  } else if (e.key === 'ArrowLeft') {
    prevMedia()
  } else if (e.key === 'ArrowRight') {
    nextMedia()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})

// ============ 保存为预设功能 ============
const presetDialogVisible = ref(false)
const presetPrefill = ref<{
  name?: string
  promptTemplate?: string
  thumbnail?: string
  referenceImages?: string[]
}>({})

// 是否可以保存为预设（需要有图片和提示词）
const canSaveAsPreset = computed(() => {
  return currentMedia.value?.kind === 'image' && displayPrompt.value
})

const openSaveAsPreset = () => {
  if (!canSaveAsPreset.value) return

  // 收集参考图
  const refImages: string[] = inputImages.value.map(img => img.url)

  // 预填充数据
  presetPrefill.value = {
    name: '',
    promptTemplate: displayPrompt.value,
    thumbnail: currentMedia.value?.url,
    referenceImages: refImages
  }

  presetDialogVisible.value = true
}

const handlePresetSaved = () => {
  alert('预设已保存')
}
</script>

<style lang="scss">
@use '../styles/theme.scss';
</style>

<style scoped lang="scss">
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.68);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.lightbox-container {
  width: 100%;
  max-width: 1100px;
  height: 90vh;
  max-height: 850px;
  background: var(--ml-surface);
  border-radius: var(--ml-radius);
  border: 3px solid var(--ml-border-color);
  overflow: hidden;
  position: relative;
  box-shadow: 8px 8px 0 var(--ml-border-color);
}

.lightbox-content {
  display: flex;
  height: 100%;
}

/* 媒体区域 */
.lightbox-media-area {
  flex: 1;
  background: #1a0a03;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: zoom-out;
  min-width: 0;
}

.lightbox-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

/* 视频 */
.lightbox-video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  outline: none;
}

/* 音频容器 */
.lightbox-audio-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  width: 100%;
  max-width: 500px;
}

.loading-state {
  color: white;
  font-size: 2rem;
}

.spin {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 无媒体占位 */
.no-media-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.6);
  user-select: none;
}

.placeholder-icon {
  font-size: 3rem;
  display: inline-block;
}

.placeholder-text {
  font-size: 1rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
}

.placeholder-error {
  font-size: 0.8rem;
  color: rgba(244, 67, 54, 0.8);
  max-width: 400px;
  text-align: center;
  line-height: 1.5;
  word-break: break-word;
  padding: 8px 16px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: var(--ml-radius);
  border: 1px solid rgba(244, 67, 54, 0.3);
}

/* 底部状态栏 */
.footer-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 4px 0;
}

.footer-task-id {
  font-family: 'Consolas', monospace;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ml-text-muted);
}

/* 导航按钮 */
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(251, 191, 36, 0.9);
  border: 2px solid var(--ml-border-color);
  color: var(--ml-text);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 1.2rem;
  font-weight: 700;
  box-shadow: 2px 2px 0 var(--ml-border-color);
}

.nav-btn:hover {
  background: var(--ml-primary);
  transform: translateY(-50%) scale(1.08);
}

.nav-btn.prev {
  left: 16px;
}

.nav-btn.next {
  right: 16px;
}

.media-counter {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(69, 26, 3, 0.8);
  color: white;
  padding: 8px 16px;
  border-radius: var(--ml-radius);
  font-size: 0.85rem;
  font-weight: 700;
  border: 2px solid var(--ml-border-color);
}

/* 侧边栏 */
.lightbox-sidebar {
  width: 280px;
  background: var(--ml-surface);
  display: flex;
  flex-direction: column;
  border-left: 3px solid var(--ml-border-color);
  flex-shrink: 0;
}

.sidebar-header {
  padding: 14px 16px;
  border-bottom: 2px solid var(--ml-border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.info-title {
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--ml-text);
}

.header-close-btn {
  background: transparent;
  border: none;
  color: var(--ml-text-muted);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 0.9rem;
  font-weight: 700;
}

.header-close-btn:hover {
  background: var(--ml-cream);
  color: var(--ml-text);
}

.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.sidebar-body:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.sidebar-body::-webkit-scrollbar {
  width: 6px;
}

.sidebar-body::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-body::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.sidebar-body:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

.info-block {
  margin-bottom: 16px;
}

.info-block:last-child {
  margin-bottom: 0;
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--ml-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.copy-btn {
  background: transparent;
  border: none;
  color: var(--ml-primary-dark);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  font-weight: 600;
}

.copy-btn:hover {
  background: var(--ml-cream);
}

.prompt-content {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--ml-text);
  background: var(--ml-cream);
  padding: 10px 12px;
  border-radius: var(--ml-radius);
  border: 2px solid var(--ml-border-color);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.prompt-content.empty {
  color: var(--ml-text-muted);
  font-style: italic;
}

.info-value {
  font-size: 0.85rem;
  color: var(--ml-text);
  font-weight: 500;
}

/* 用户信息 */
.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--ml-cream);
  border-radius: var(--ml-radius);
  border: 2px solid var(--ml-border-color);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid var(--ml-border-color);
}

.user-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ml-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid var(--ml-border-color);
  font-size: 1rem;
}

.user-name {
  font-size: 0.9rem;
  color: var(--ml-text);
  font-weight: 600;
}

/* 参考图 */
.ref-count {
  font-size: 0.7rem;
  color: var(--ml-text-muted);
  font-weight: 600;
}

.reference-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.reference-thumb {
  width: 56px;
  height: 56px;
  border-radius: var(--ml-radius);
  border: 2px solid var(--ml-border-color);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--ml-cream);
}

.reference-thumb:hover {
  border-color: var(--ml-primary-dark);
  transform: scale(1.05);
  box-shadow: 2px 2px 0 var(--ml-border-color);
}

.reference-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 预设标签 */
.preset-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--ml-cream);
  border: 2px solid var(--ml-border-color);
  border-radius: var(--ml-radius);
}

.preset-icon {
  font-size: 1rem;
}

.preset-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ml-text);
}

.preset-ref {
  font-size: 0.7rem;
  padding: 2px 6px;
  background: var(--ml-primary);
  border-radius: 8px;
  font-weight: 700;
  color: var(--ml-text);
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 2px solid var(--ml-border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.footer-row {
  display: flex;
  gap: 8px;
}

.footer-row .pop-btn {
  flex: 1;
  min-width: 0;
}

.sidebar-footer .pop-btn.full-width {
  width: 100%;
}

/* 过渡动画 */
.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.25s ease;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}

/* 响应式 */
@media (max-width: 768px) {
  .lightbox-overlay {
    padding: 0;
  }

  .lightbox-container {
    height: 100%;
    max-height: none;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }

  .lightbox-content {
    flex-direction: column;
  }

  .lightbox-media-area {
    min-height: 50vh;
  }

  .lightbox-sidebar {
    width: 100%;
    border-left: none;
    border-top: 3px solid var(--ml-border-color);
  }
}
</style>
