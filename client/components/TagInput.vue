<template>
  <div class="tag-input">
    <el-select
      v-model="model"
      multiple
      filterable
      allow-create
      default-first-option
      :placeholder="placeholder"
      :teleported="false"
      class="tag-select"
      tag-type="primary"
    >
      <el-option
        v-for="item in suggestions"
        :key="item"
        :label="item"
        :value="item"
      />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string[],
  suggestions?: string[],
  placeholder?: string
}>()

const emit = defineEmits(['update:modelValue'])

const model = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})
</script>

<style scoped>
/* 标签输入 - 波普风格 */
.tag-input {
  width: 100%;
}
.tag-select {
  width: 100%;
}

.tag-select :deep(.el-tag) {
  background-color: var(--ml-primary-light, #fde68a);
  color: var(--ml-text, #451a03);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius-sm, 8px);
  font-weight: 700;
}

.tag-select :deep(.el-tag .el-tag__close) {
  color: var(--ml-text-secondary, #92400e);
}

.tag-select :deep(.el-tag .el-tag__close:hover) {
  background-color: var(--ml-error, #ef4444);
  color: white;
}
</style>