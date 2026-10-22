<template>
  <div class="audio-player" :class="{ 'audio-player--compact': compact, 'audio-player--large': large }">
    <!-- 可视化区域 -->
    <div class="audio-visual" @click="togglePlay">
      <div class="audio-play-btn" :class="{ playing: isPlaying }">
        <span><k-icon :name="isPlaying ? 'pause' : 'play'" /></span>
      </div>
      <span class="audio-duration-badge">
        {{ currentTimeDisplay }} / {{ durationDisplay }}
      </span>
    </div>
    <!-- 进度条 -->
    <div class="audio-progress-bar" @click="seek">
      <div class="audio-progress" :style="{ width: progress + '%' }"></div>
    </div>
    <!-- 隐藏的原生 audio 元素 -->
    <audio
      ref="audioRef"
      :src="src"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'

const props = defineProps<{
  /** 音频源地址 */
  src: string
  /** 紧凑模式（用于列表卡片） */
  compact?: boolean
  /** 大尺寸模式（用于灯箱） */
  large?: boolean
  /** 预设时长（秒），避免需要加载完才显示 */
  duration?: number
}>()

const emit = defineEmits<{
  /** 播放状态改变 */
  (e: 'playStateChange', playing: boolean): void
  /** 元数据加载完成 */
  (e: 'loadedMetadata', duration: number): void
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const audioDuration = ref(props.duration || 0)

/** 进度百分比 */
const progress = computed(() => {
  if (!audioDuration.value) return 0
  return (currentTime.value / audioDuration.value) * 100
})

/** 格式化时间 (秒 -> mm:ss) */
const formatTime = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** 当前时间显示 */
const currentTimeDisplay = computed(() => formatTime(currentTime.value))

/** 总时长显示 */
const durationDisplay = computed(() => formatTime(audioDuration.value))

/** 切换播放/暂停 */
const togglePlay = () => {
  const audio = audioRef.value
  if (!audio) return

  if (audio.paused) {
    audio.play()
    isPlaying.value = true
  } else {
    audio.pause()
    isPlaying.value = false
  }
  emit('playStateChange', isPlaying.value)
}

/** 暂停播放（供外部调用） */
const pause = () => {
  const audio = audioRef.value
  if (audio && !audio.paused) {
    audio.pause()
    isPlaying.value = false
    emit('playStateChange', false)
  }
}

/** 元数据加载完成 */
const onLoadedMetadata = () => {
  const audio = audioRef.value
  if (audio && audio.duration && isFinite(audio.duration)) {
    audioDuration.value = audio.duration
    emit('loadedMetadata', audio.duration)
  }
}

/** 时间更新 */
const onTimeUpdate = () => {
  const audio = audioRef.value
  if (audio) {
    currentTime.value = audio.currentTime
  }
}

/** 播放结束 */
const onEnded = () => {
  isPlaying.value = false
  currentTime.value = 0
  emit('playStateChange', false)
}

/** 点击进度条跳转 */
const seek = (e: MouseEvent) => {
  const audio = audioRef.value
  if (!audio || !audioDuration.value) return

  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const percent = (e.clientX - rect.left) / rect.width
  audio.currentTime = percent * audioDuration.value
}

/** 监听 src 变化时重置状态 */
watch(() => props.src, () => {
  isPlaying.value = false
  currentTime.value = 0
  if (props.duration) {
    audioDuration.value = props.duration
  }
})

/** 组件卸载时暂停 */
onUnmounted(() => {
  pause()
})

/** 暴露方法供外部调用 */
defineExpose({
  pause,
  isPlaying
})
</script>

<style lang="scss">
@use '../styles/theme.scss';
</style>

<style scoped lang="scss">
.audio-player {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 200px;
  border-radius: var(--ml-radius);
  overflow: hidden;
  background: var(--ml-surface);
  border: 3px solid var(--ml-border-color);
  box-shadow: var(--ml-shadow-sm);
}

.audio-player:hover {
  box-shadow: var(--ml-shadow);
}

/* 可视化区域 */
.audio-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2.5rem 2rem;
  background: linear-gradient(145deg, rgba(251, 191, 36, 0.2), rgba(254, 243, 199, 0.3));
  cursor: pointer;
  transition: all 0.3s ease;
}

.audio-visual:hover {
  background: linear-gradient(145deg, rgba(251, 191, 36, 0.3), rgba(254, 243, 199, 0.4));
}

.audio-visual:active {
  transform: scale(0.98);
}

/* 播放按钮 */
.audio-play-btn {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--ml-primary);
  border: 3px solid var(--ml-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--ml-shadow-sm);
}

.audio-visual:hover .audio-play-btn {
  transform: scale(1.1);
  box-shadow: var(--ml-shadow);
}

.audio-play-btn.playing {
  background: var(--ml-cream);
}

/* 时间徽章 */
.audio-duration-badge {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--ml-text);
  padding: 6px 14px;
  background: var(--ml-surface);
  border-radius: var(--ml-radius);
  border: 2px solid var(--ml-border-color);
}

/* 进度条 */
.audio-progress-bar {
  height: 8px;
  background: var(--ml-cream);
  cursor: pointer;
  position: relative;
  transition: height 0.2s;
}

.audio-progress-bar:hover {
  height: 12px;
}

.audio-progress {
  height: 100%;
  background: linear-gradient(90deg, var(--ml-primary), var(--ml-primary-dark));
  border-radius: 0 3px 3px 0;
  transition: width 0.1s linear;
}

/* 隐藏原生 audio */
.audio-player audio {
  display: none;
}

/* ========== 紧凑模式（用于列表卡片） ========== */
.audio-player--compact {
  min-width: 0;
  border-radius: 0;
  box-shadow: none;
  border: none;
  border-bottom: 2px solid var(--ml-border-color);
}

.audio-player--compact:hover {
  box-shadow: none;
}

.audio-player--compact .audio-visual {
  padding: 1rem;
  gap: 8px;
}

.audio-player--compact .audio-play-btn {
  width: 40px;
  height: 40px;
  font-size: 1rem;
  border-width: 2px;
}

.audio-player--compact .audio-duration-badge {
  font-size: 0.65rem;
  padding: 3px 10px;
}

.audio-player--compact .audio-progress-bar {
  height: 4px;
}

.audio-player--compact .audio-progress-bar:hover {
  height: 6px;
}

/* ========== 大尺寸模式（用于灯箱） ========== */
.audio-player--large {
  background: transparent;
  box-shadow: none;
  border: none;
  max-width: 400px;
  margin: 0 auto;
}

.audio-player--large:hover {
  box-shadow: none;
}

.audio-player--large .audio-visual {
  padding: 3rem 2rem;
  background: linear-gradient(145deg, rgba(251, 191, 36, 0.25), rgba(254, 243, 199, 0.35));
  border-radius: var(--ml-radius);
  border: 3px solid var(--ml-border-color);
}

.audio-player--large .audio-play-btn {
  width: 120px;
  height: 120px;
  font-size: 3rem;
  box-shadow: var(--ml-shadow);
}

.audio-player--large .audio-visual:hover .audio-play-btn {
  transform: scale(1.08);
}

.audio-player--large .audio-duration-badge {
  font-size: 1.125rem;
  padding: 8px 18px;
  margin-top: 0.5rem;
}

.audio-player--large .audio-progress-bar {
  height: 10px;
  margin-top: 1rem;
  border-radius: var(--ml-radius);
  background: rgba(69, 26, 3, 0.1);
  border: 2px solid var(--ml-border-color);
}

.audio-player--large .audio-progress-bar:hover {
  height: 14px;
}

.audio-player--large .audio-progress {
  border-radius: var(--ml-radius);
}
</style>
