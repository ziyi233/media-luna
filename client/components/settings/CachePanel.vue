<template>
  <div class="cache-panel">
    <div class="stats-card pop-card no-hover" v-if="stats">
      <div class="stats-grid">
        <div class="stat">
          <div class="value"><k-icon name="file-archive" /> {{ stats.totalFiles }}</div>
          <div class="label">文件数量</div>
        </div>
        <div class="stat">
          <div class="value"><k-icon name="file-archive" /> {{ stats.totalSizeMB.toFixed(1) }} MB</div>
          <div class="label">已用空间</div>
        </div>
        <div class="stat">
          <div class="value"><k-icon name="image" /> {{ stats.maxSizeMB }} MB</div>
          <div class="label">最大容量</div>
        </div>
      </div>

      <div class="progress-row">
        <div class="progress-bar">
          <div class="fill" :style="{ width: usagePercent + '%' }"></div>
        </div>
        <span class="percent">{{ usagePercent.toFixed(1) }}%</span>
      </div>
    </div>

    <div class="actions">
      <button class="pop-btn" @click="refresh">
        <k-icon name="refresh" /> 刷新
      </button>
      <button class="pop-btn danger" @click="clear">
        <k-icon name="delete" /> 清空缓存
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { cacheApi, CacheStats } from '../../api'

const stats = ref<CacheStats | null>(null)

const usagePercent = computed(() => {
  if (!stats.value) return 0
  return Math.min(100, (stats.value.totalSizeMB / stats.value.maxSizeMB) * 100)
})

const refresh = async () => {
  try {
    stats.value = await cacheApi.stats()
  } catch (e) {
    alert('获取缓存统计失败')
  }
}

const clear = async () => {
  if (!confirm('确定要清空所有缓存吗？')) return
  try {
    await cacheApi.clear()
    alert('缓存已清空')
    await refresh()
  } catch (e) {
    alert('清空缓存失败')
  }
}

onMounted(refresh)
</script>

<style lang="scss">
@use '../../styles/theme.scss';
</style>

<style scoped lang="scss">
.cache-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 500px;
}

.stats-card {
  padding: 24px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-bottom: 24px;
}

.stat {
  text-align: center;
}

.value {
  font-size: 1.25rem;
  font-weight: 900;
  color: var(--ml-text);
}

.label {
  font-size: 13px;
  color: var(--ml-text-muted);
  margin-top: 4px;
  font-weight: 600;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-bar {
  flex: 1;
  height: 12px;
  background: var(--ml-cream);
  border: 2px solid var(--ml-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--ml-primary);
  border-radius: 6px;
  transition: width 0.3s;
}

.percent {
  font-size: 14px;
  font-weight: 700;
  color: var(--ml-text);
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 12px;
}
</style>
