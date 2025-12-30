<template>
  <teleport to="body">
    <transition name="lightbox-fade">
      <div v-if="visible" class="lightbox-overlay" @click.self="close">
        <div class="lightbox-container">
          <div class="lightbox-content">
            <!-- 左侧媒体区域 -->
            <div class="lightbox-media-area" @click.self="close">
              <!-- 关闭按钮 -->
              <button class="close-btn" @click="close" title="关闭 (Esc)">
                <k-icon name="times"></k-icon>
              </button>

              <!-- 加载中 -->
              <div v-if="loading" class="loading-state">
                <k-icon name="sync" class="spin"></k-icon>
              </div>

              <template v-else>
                <!-- 多媒体时的导航 -->
                <button v-if="mediaList.length > 1" class="nav-btn prev" @click.stop="prevMedia" title="上一个">
                  <k-icon name="chevron-left"></k-icon>
                </button>

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
                  <k-icon name="chevron-right"></k-icon>
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
                  <k-icon name="times"></k-icon>
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
                      <k-icon name="user"></k-icon>
                    </div>
                    <span class="user-name">{{ userInfo?.name || `UID: ${taskData.uid}` }}</span>
                  </div>
                  <div class="user-info" v-else>
                    <div class="user-avatar-placeholder">
                      <k-icon name="user"></k-icon>
                    </div>
                    <span class="user-name">匿名用户</span>
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
                <button class="action-btn primary" @click="openOriginal">
                  <k-icon name="external-link"></k-icon>
                  {{ currentMedia?.kind === 'audio' ? '打开音频' : currentMedia?.kind === 'video' ? '打开视频' : '查看原图' }}
                </button>
                <button class="action-btn secondary" @click="downloadMedia">
                  <k-icon name="download"></k-icon>
                  下载
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { message } from '@koishijs/client'
import { taskApi, userApi } from '../api'
import type { TaskData, AssetKind } from '../types'
import AudioPlayer from './AudioPlayer.vue'

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

const copyPrompt = () => {
  if (displayPrompt.value) {
    navigator.clipboard.writeText(displayPrompt.value)
    message.success('已复制提示词')
  }
}

const openOriginal = () => {
  if (currentMedia.value?.url) {
    window.open(currentMedia.value.url, '_blank')
  }
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
    message.warning('无法直接下载，已在新标签页打开')
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
</script>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
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
  background: var(--k-card-bg);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
}

.lightbox-content {
  display: flex;
  height: 100%;
}

/* 媒体区域 */
.lightbox-media-area {
  flex: 1;
  background: #0a0a0a;
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
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 关闭按钮 - 图片区域左上角 */
.close-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 1.1rem;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.05);
}

/* 导航按钮 */
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: white;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 1.5rem;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.25);
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
  background: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
}

/* 侧边栏 */
.lightbox-sidebar {
  width: 280px;
  background: var(--k-card-bg);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--k-color-border);
  flex-shrink: 0;
}

.sidebar-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--k-color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.info-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--k-color-text);
}

.header-close-btn {
  background: transparent;
  border: none;
  color: var(--k-color-text-description);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.header-close-btn:hover {
  background: var(--k-color-bg-2);
  color: var(--k-color-text);
}

.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.sidebar-body:hover {
  scrollbar-color: var(--k-color-border) transparent;
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
  background-color: var(--k-color-border);
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
  font-weight: 600;
  color: var(--k-color-text-description);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.copy-btn {
  background: transparent;
  border: none;
  color: var(--k-color-active);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  font-weight: 500;
}

.copy-btn:hover {
  background: var(--k-color-bg-2);
}

.prompt-content {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--k-color-text);
  background: var(--k-color-bg-2);
  padding: 10px 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.prompt-content.empty {
  color: var(--k-color-text-description);
  font-style: italic;
}

.info-value {
  font-size: 0.85rem;
  color: var(--k-color-text);
}

/* 用户信息 */
.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--k-color-bg-2);
  border-radius: 6px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.user-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--k-color-bg-1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--k-color-text-description);
  flex-shrink: 0;
}

.user-name {
  font-size: 0.9rem;
  color: var(--k-color-text);
  font-weight: 500;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--k-color-border);
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}

.action-btn.primary {
  background: var(--k-color-active);
  color: white;
}

.action-btn.primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.action-btn.secondary {
  background: var(--k-color-bg-2);
  color: var(--k-color-text);
  border: 1px solid var(--k-color-border);
}

.action-btn.secondary:hover {
  background: var(--k-color-bg-1);
  border-color: var(--k-color-active);
  color: var(--k-color-active);
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
    border-top: 1px solid var(--k-color-border);
  }

  .close-btn {
    top: 12px;
    left: 12px;
  }
}
</style>
