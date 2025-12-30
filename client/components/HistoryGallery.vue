<template>
  <div class="history-gallery" :class="{ collapsed }">
    <!-- 折叠状态的侧边条 -->
    <div v-if="collapsed" class="collapsed-bar" @click="collapsed = false">
      <k-icon name="history"></k-icon>
      <span class="collapsed-text">历史</span>
    </div>

    <!-- 展开的内容 -->
    <div v-else class="gallery-content">
      <div class="gallery-header">
        <div class="header-left">
          <span class="gallery-title">历史记录</span>
          <span class="gallery-count" v-if="total > 0">{{ total }}</span>
        </div>
        <div class="header-actions">
          <k-icon name="refresh" class="action-icon" :class="{ spinning: loading }" @click="refresh" title="刷新"></k-icon>
          <k-icon name="chevron-right" class="action-icon" @click="collapsed = true" title="收起"></k-icon>
        </div>
      </div>

      <!-- 未登录提示 -->
      <div v-if="!loggedIn" class="gallery-empty">
        <k-icon name="user" class="empty-icon"></k-icon>
        <p>请登录查看历史</p>
      </div>

      <!-- 加载中 -->
      <div v-else-if="loading && tasks.length === 0" class="gallery-loading">
        <div class="loader-small"></div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="tasks.length === 0" class="gallery-empty">
        <k-icon name="image" class="empty-icon"></k-icon>
        <p>暂无记录</p>
      </div>

      <!-- 任务列表 (瀑布流) -->
      <div v-else class="gallery-list" ref="listRef" @scroll="handleScroll">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="task-card"
          :class="{ clickable: task.status === 'success' }"
          @click="handleTaskClick(task)"
        >
          <!-- 媒体区域 -->
          <template v-if="task.media && task.media.length > 0">
            <!-- 图片 -->
            <div class="task-image-wrapper" v-if="task.media[0].kind === 'image'">
              <img
                :src="task.media[0].url"
                class="task-image"
                loading="lazy"
              />
              <div v-if="task.media.length > 1" class="more-images">
                +{{ task.media.length - 1 }}
              </div>
            </div>
            <!-- 视频 -->
            <div class="task-video-wrapper" v-else-if="task.media[0].kind === 'video'">
              <video
                :src="task.media[0].url"
                class="task-video"
                muted
                loop
                @mouseenter="($event.target as HTMLVideoElement).play()"
                @mouseleave="($event.target as HTMLVideoElement).pause()"
              />
              <div class="media-type-badge video-badge">
                <k-icon name="play"></k-icon>
              </div>
              <div v-if="task.media.length > 1" class="more-images">
                +{{ task.media.length - 1 }}
              </div>
            </div>
            <!-- 音频 -->
            <div class="task-audio-wrapper" v-else-if="task.media[0].kind === 'audio'">
              <AudioPlayer
                :src="task.media[0].url"
                :duration="task.media[0].meta?.duration"
                compact
                @click.stop
              />
              <div v-if="task.media.length > 1" class="more-images audio-more">
                +{{ task.media.length - 1 }}
              </div>
            </div>
          </template>

          <!-- 处理中动画 -->
          <div v-else-if="task.status === 'processing' || task.status === 'pending'" class="task-processing">
            <div class="processing-animation">
              <div class="dot"></div>
              <div class="dot"></div>
              <div class="dot"></div>
            </div>
            <span class="processing-text">{{ task.status === 'pending' ? '等待中' : '生成中' }}</span>
          </div>

          <!-- 失败状态 -->
          <div v-else-if="task.status === 'failed'" class="task-failed">
            <k-icon name="exclamation-triangle" class="failed-icon"></k-icon>
            <span>失败</span>
          </div>

          <!-- 任务信息 -->
          <div class="task-info">
            <div class="task-prompt" :title="task.prompt">{{ task.prompt || '(无提示词)' }}</div>
            <div class="task-meta">
              <span class="task-time">{{ formatTime(task.createdAt) }}</span>
              <span v-if="task.duration" class="task-duration">{{ formatDuration(task.duration) }}</span>
            </div>
          </div>
        </div>

        <!-- 加载更多 -->
        <div v-if="loading && tasks.length > 0" class="loading-more">
          <div class="loader-small"></div>
        </div>
      </div>
    </div>

    <!-- 媒体预览弹窗 -->
    <ImageLightbox
      v-model:visible="lightboxVisible"
      :media="lightboxMedia"
      :initial-index="lightboxIndex"
      :prompt="lightboxPrompt"
      :created-at="lightboxCreatedAt"
      :duration="lightboxDuration"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { taskApi, authApi } from '../api'
import type { TaskData } from '../types'
import ImageLightbox from './ImageLightbox.vue'
import AudioPlayer from './AudioPlayer.vue'

interface MediaItem {
  kind: 'image' | 'video' | 'audio'
  url: string
  meta?: { duration?: number }
}

interface TaskItem {
  id: number
  status: 'pending' | 'processing' | 'success' | 'failed'
  prompt: string
  images: string[]  // 保持兼容
  media: MediaItem[]  // 新增：所有媒体
  createdAt: Date
  duration?: number
}

const emit = defineEmits<{
  (e: 'select', task: TaskItem): void
}>()

const collapsed = ref(false)
const loading = ref(false)
const loggedIn = ref(false)
const tasks = ref<TaskItem[]>([])
const total = ref(0)
const hasMore = ref(false)
const offset = ref(0)
const limit = 10
const listRef = ref<HTMLElement>()
let refreshTimer: ReturnType<typeof setInterval> | null = null

// Lightbox 状态
const lightboxVisible = ref(false)
const lightboxMedia = ref<MediaItem[]>([])
const lightboxIndex = ref(0)
const lightboxPrompt = ref('')
const lightboxCreatedAt = ref<Date | undefined>()
const lightboxDuration = ref<number | undefined>()

// 检查登录状态
const checkAuth = async () => {
  try {
    const me = await authApi.me()
    loggedIn.value = me.loggedIn
    return me.loggedIn
  } catch {
    loggedIn.value = false
    return false
  }
}

// 转换任务数据
const toTaskItem = (task: TaskData): TaskItem => {
  const images: string[] = []
  const media: MediaItem[] = []
  if (task.responseSnapshot) {
    for (const asset of task.responseSnapshot) {
      if (asset.url) {
        if (asset.kind === 'image') {
          images.push(asset.url)
          media.push({ kind: 'image', url: asset.url })
        } else if (asset.kind === 'video') {
          media.push({ kind: 'video', url: asset.url })
        } else if (asset.kind === 'audio') {
          media.push({ kind: 'audio', url: asset.url })
        }
      }
    }
  }
  // 优先使用预设中间件处理后的最终提示词，如果没有则使用原始输入
  const finalPrompt = (task.middlewareLogs as any)?.preset?.transformedPrompt
    || task.requestSnapshot?.prompt
    || ''
  return {
    id: task.id,
    status: task.status as TaskItem['status'],
    prompt: finalPrompt,
    images,
    media,
    createdAt: new Date(task.startTime),
    duration: task.duration || undefined
  }
}

// 加载任务
const loadTasks = async (append = false) => {
  if (!loggedIn.value) return

  loading.value = true
  try {
    const result = await taskApi.my({
      limit,
      offset: append ? offset.value : 0
    })

    const newTasks = result.items.map(toTaskItem)

    if (append) {
      tasks.value = [...tasks.value, ...newTasks]
    } else {
      tasks.value = newTasks
      offset.value = 0
    }

    total.value = result.total
    hasMore.value = result.items.length >= limit
    offset.value += limit
  } catch (e) {
    console.error('Failed to load tasks:', e)
  } finally {
    loading.value = false
  }
}

// 加载更多
const loadMore = () => {
  if (!loading.value && hasMore.value) {
    loadTasks(true)
  }
}

// 滚动加载
const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement
  const { scrollTop, scrollHeight, clientHeight } = target
  if (scrollHeight - scrollTop - clientHeight < 100) {
    loadMore()
  }
}

// 刷新
const refresh = async () => {
  await checkAuth()
  await loadTasks()
}

// 点击任务
const handleTaskClick = (task: TaskItem) => {
  if (task.status === 'success' && task.media.length > 0) {
    // 支持图片、视频、音频预览
    const previewableMedia = task.media.filter(m => ['image', 'video', 'audio'].includes(m.kind))
    if (previewableMedia.length > 0) {
      lightboxMedia.value = previewableMedia
      lightboxIndex.value = 0
      lightboxPrompt.value = task.prompt
      lightboxCreatedAt.value = task.createdAt
      lightboxDuration.value = task.duration
      lightboxVisible.value = true
    }
    // 同时触发 select 事件用于填充提示词
    emit('select', task)
  }
}

// 格式化时间
const formatTime = (date: Date) => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

  return date.toLocaleDateString()
}

// 格式化耗时
const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// 自动刷新进行中的任务
const startAutoRefresh = () => {
  refreshTimer = setInterval(() => {
    const hasPending = tasks.value.some(t => t.status === 'pending' || t.status === 'processing')
    if (hasPending) {
      loadTasks()
    }
  }, 3000)
}

// 暴露刷新方法给父组件
defineExpose({ refresh })

onMounted(async () => {
  if (await checkAuth()) {
    await loadTasks()
    startAutoRefresh()
  }
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<style scoped>
.history-gallery {
  width: 240px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--k-card-bg);
  border-radius: 12px;
  border: 1px solid var(--k-color-border);
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.history-gallery:not(.collapsed):hover {
  border-color: var(--k-color-active);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.history-gallery.collapsed {
  width: 40px;
}

/* 折叠状态的侧边条 */
.collapsed-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  cursor: pointer;
  color: var(--k-color-text-description);
  transition: all 0.2s;
  gap: 0.5rem;
  padding: 1rem 0;
}

.collapsed-bar:hover {
  color: var(--k-color-active);
  background-color: var(--k-color-bg-2);
}

.collapsed-bar .k-icon {
  font-size: 1.1rem;
}

.collapsed-text {
  writing-mode: vertical-rl;
  font-size: 0.75rem;
  font-weight: 500;
}

/* 展开的内容 */
.gallery-content {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.gallery-header {
  padding: 0.75rem;
  border-bottom: 1px solid var(--k-color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.gallery-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--k-color-text);
}

.gallery-count {
  font-size: 0.7rem;
  background-color: var(--k-color-active);
  color: white;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
  font-weight: 500;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.action-icon {
  padding: 0.3rem;
  border-radius: 4px;
  cursor: pointer;
  color: var(--k-color-text-description);
  transition: all 0.2s;
  font-size: 0.85rem;
}

.action-icon:hover {
  color: var(--k-color-active);
  background-color: var(--k-color-bg-2);
}

.action-icon.spinning {
  animation: spin 1s linear infinite;
}

/* 任务列表 */
.gallery-list {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.gallery-list:hover {
  scrollbar-color: var(--k-color-border) transparent;
}

.gallery-list::-webkit-scrollbar {
  width: 4px;
}

.gallery-list::-webkit-scrollbar-track {
  background: transparent;
}

.gallery-list::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 2px;
  transition: background-color 0.2s;
}

.gallery-list:hover::-webkit-scrollbar-thumb {
  background-color: var(--k-color-border);
}

/* 任务卡片 */
.task-card {
  background-color: var(--k-color-bg-2);
  border-radius: 8px;
  flex-shrink: 0;
  overflow: hidden;
  transition: all 0.2s;
  position: relative;
  border: 1px solid var(--k-color-border);
}

.task-card.clickable {
  cursor: pointer;
}

.task-card.clickable:hover {
  background-color: var(--k-color-bg-1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-color: var(--k-color-active);
}

/* 处理中状态的卡片 */
.task-card:has(.task-processing) {
  border-color: var(--k-color-warning, #e6a23c);
  background-color: rgba(230, 162, 60, 0.05);
}

/* 失败状态的卡片 */
.task-card:has(.task-failed) {
  border-color: var(--k-color-error, #f56c6c);
  background-color: rgba(245, 108, 108, 0.05);
}

/* 图片区域 - 单张图片，完整显示不裁剪 */
.task-image-wrapper {
  position: relative;
  width: 100%;
  background-color: var(--k-color-bg-1);
}

.task-image {
  width: 100%;
  height: auto;
  display: block;
}

.more-images {
  position: absolute;
  right: 6px;
  top: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.audio-more {
  top: auto;
  bottom: 40px;
}

/* 视频区域 */
.task-video-wrapper {
  position: relative;
  width: 100%;
  background-color: var(--k-color-bg-1);
}

.task-video {
  width: 100%;
  height: auto;
  display: block;
}

.media-type-badge {
  position: absolute;
  left: 6px;
  top: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
}

.video-badge {
  background: rgba(0, 0, 0, 0.6);
  color: white;
}

/* 音频区域 */
.task-audio-wrapper {
  position: relative;
  width: 100%;
}

/* 处理中动画 */
.task-processing {
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, rgba(230, 162, 60, 0.08) 0%, rgba(230, 162, 60, 0.02) 100%);
}

.processing-animation {
  display: flex;
  gap: 0.3rem;
}

.processing-animation .dot {
  width: 8px;
  height: 8px;
  background-color: var(--k-color-warning, #e6a23c);
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite both;
}

.processing-animation .dot:nth-child(1) { animation-delay: -0.32s; }
.processing-animation .dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.processing-text {
  font-size: 0.75rem;
  color: var(--k-color-warning, #e6a23c);
  font-weight: 500;
}

/* 失败状态 */
.task-failed {
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: var(--k-color-error, #f56c6c);
  background: linear-gradient(135deg, rgba(245, 108, 108, 0.08) 0%, rgba(245, 108, 108, 0.02) 100%);
}

.failed-icon {
  font-size: 1.5rem;
  opacity: 0.8;
}

.task-failed span {
  font-size: 0.75rem;
  font-weight: 500;
}

/* 任务信息 */
.task-info {
  padding: 0.5rem;
}

.task-prompt {
  font-size: 0.75rem;
  color: var(--k-color-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  word-break: break-all;
}

.task-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.35rem;
  font-size: 0.65rem;
  color: var(--k-color-text-description);
}

/* 空状态和加载中 */
.gallery-empty,
.gallery-loading {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--k-color-text-description);
  padding: 2rem 1rem;
  gap: 0.5rem;
}

.empty-icon {
  font-size: 2rem;
  opacity: 0.3;
}

.gallery-empty p {
  font-size: 0.8rem;
  margin: 0;
}

.loading-more {
  display: flex;
  justify-content: center;
  padding: 0.5rem;
}

.loader-small {
  border: 2px solid var(--k-color-bg-1);
  border-top: 2px solid var(--k-color-active);
  border-radius: 50%;
  width: 20px;
  height: 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
