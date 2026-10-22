<template>
  <div class="empty-state" :class="sizeClass">
    <k-icon :name="icon" class="empty-icon" />
    <p class="empty-title" v-if="title">{{ title }}</p>
    <p class="empty-description" v-if="description">{{ description }}</p>
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** 图标名称 */
  icon?: string
  /** 标题 */
  title?: string
  /** 描述文字 */
  description?: string
  /** 尺寸: small, default, large */
  size?: 'small' | 'default' | 'large'
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'inbox',
  title: '',
  description: '',
  size: 'default'
})

const sizeClass = computed(() => `size-${props.size}`)
</script>

<style scoped>
/* 空状态 - Obsidian 观感 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ml-text-secondary);
  text-align: center;
  background: transparent;
  border: 1px dashed var(--ml-border-color);
  border-radius: var(--ml-radius);
}

.empty-state.size-small {
  padding: 1.5rem;
}

.empty-state.size-small .empty-icon {
  font-size: 1.5rem;
}

.empty-state.size-default {
  padding: 3rem;
}

.empty-state.size-default .empty-icon {
  font-size: 2rem;
}

.empty-state.size-large {
  padding: 4rem;
}

.empty-state.size-large .empty-icon {
  font-size: 2.5rem;
}

.empty-icon {
  opacity: 0.6;
  margin-bottom: 4px;
  color: var(--ml-text-muted);
}

.empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ml-text);
}

.empty-description {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  opacity: 0.85;
  max-width: 300px;
  line-height: 1.6;
}
</style>
