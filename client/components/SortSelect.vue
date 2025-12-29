<template>
  <div class="sort-select">
    <el-dropdown trigger="click" @command="handleCommand">
      <span class="sort-trigger">
        <k-icon name="sort"></k-icon>
        <span class="trigger-text">{{ currentLabel }}</span>
        <k-icon name="arrow-down" class="arrow-icon"></k-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="option in sortOptions"
            :key="option.value"
            :command="option.value"
            :class="{ 'is-active': modelValue === option.value }"
          >
            {{ option.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export type SortValue = 'default' | 'name-asc' | 'name-desc' | 'enabled-first' | 'disabled-first'

export interface SortOption {
  value: SortValue
  label: string
}

const sortOptions: SortOption[] = [
  { value: 'default', label: '默认排序' },
  { value: 'name-asc', label: '名称 A-Z' },
  { value: 'name-desc', label: '名称 Z-A' },
  { value: 'enabled-first', label: '启用优先' },
  { value: 'disabled-first', label: '禁用优先' }
]

const props = withDefaults(defineProps<{
  modelValue: SortValue
}>(), {
  modelValue: 'default'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: SortValue): void
  (e: 'change', value: SortValue): void
}>()

const currentLabel = computed(() => {
  const option = sortOptions.find(o => o.value === props.modelValue)
  return option?.label || '排序'
})

const handleCommand = (command: SortValue) => {
  emit('update:modelValue', command)
  emit('change', command)
}
</script>

<style scoped>
.sort-select {
  display: inline-flex;
}

.sort-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 0.85rem;
  border-radius: 16px;
  border: 1px solid var(--k-color-border);
  background-color: transparent;
  color: var(--k-color-text-description);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.sort-trigger:hover {
  border-color: var(--k-color-active);
  color: var(--k-color-active);
}

.trigger-text {
  font-weight: 500;
}

.arrow-icon {
  font-size: 0.7rem;
}

:deep(.el-dropdown-menu__item.is-active) {
  color: var(--k-color-active);
  font-weight: 600;
}
</style>
