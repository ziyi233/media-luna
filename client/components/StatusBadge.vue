<template>
  <span class="status-badge" :class="status">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
}>()

const label = computed(() => {
  switch (props.status) {
    case 'pending': return '等待中'
    case 'processing': return '处理中'
    case 'success': return '成功'
    case 'failed': return '失败'
    default: return props.status
  }
})
</script>

<style scoped>
/* 状态徽章 - Obsidian 观感 */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
  border: 1px solid transparent;
}

.status-badge.pending {
  background-color: var(--ml-bg-alt);
  border-color: var(--ml-border-color);
  color: var(--ml-text-secondary);
}

.status-badge.processing {
  background-color: var(--ml-primary-light);
  border-color: var(--ml-primary);
  color: var(--ml-primary);
}

.status-badge.success {
  background-color: var(--ml-success-bg);
  border-color: var(--ml-success-border);
  color: var(--ml-success);
}

.status-badge.failed {
  background-color: var(--ml-error-bg);
  border-color: var(--ml-error-border);
  color: var(--ml-error);
}
</style>