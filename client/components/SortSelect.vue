<template>
  <div class="sort-select">
    <el-dropdown trigger="click" :teleported="false" @command="handleCommand">
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

export type SortValue = 'default' | 'id-asc' | 'id-desc' | 'name-asc' | 'name-desc' | 'enabled-first' | 'disabled-first'

export interface SortOption {
  value: SortValue
  label: string
}

const sortOptions: SortOption[] = [
  { value: 'default', label: '默认排序' },
  { value: 'id-asc', label: 'ID 升序' },
  { value: 'id-desc', label: 'ID 降序' },
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

/* 排序触发器 - 波普风格 */
.sort-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: var(--ml-radius, 12px);
  border: 2px solid var(--ml-border-color, #451a03);
  background-color: var(--ml-surface, #ffffff);
  color: var(--ml-text, #451a03);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.sort-trigger:hover {
  border-color: var(--ml-primary, #fbbf24);
  background-color: var(--ml-cream, #fffbeb);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--ml-border-color, #451a03);
}

.trigger-text {
  font-weight: 700;
}

.arrow-icon {
  font-size: 0.7rem;
}

:deep(.el-dropdown-menu__item.is-active) {
  color: var(--ml-primary-dark, #d97706);
  font-weight: 700;
  background-color: var(--ml-primary-light, #fde68a);
}
</style>
