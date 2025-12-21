<template>
  <div class="config-renderer">
    <template v-for="field in fields" :key="field.key">
      <div class="form-row" v-if="shouldShowField(field)">
        <div class="form-label" :class="{ required: field.required }">
          {{ field.label }}
        </div>
        <div class="field-container">
          <!-- Boolean 类型 -->
          <template v-if="field.type === 'boolean'">
            <el-switch
              :model-value="getFieldValue(field.key)"
              @update:model-value="setFieldValue(field.key, $event)"
            />
          </template>

          <!-- Select 类型 -->
          <template v-else-if="field.type === 'select'">
            <el-select
              :model-value="getFieldValue(field.key)"
              @update:model-value="setFieldValue(field.key, $event)"
              :placeholder="field.placeholder || '请选择'"
              :clearable="clearable"
              style="width: 100%"
            >
              <el-option
                v-for="opt in field.options"
                :key="String(opt.value)"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </template>

          <!-- Number 类型 -->
          <template v-else-if="field.type === 'number'">
            <el-input-number
              :model-value="getFieldValue(field.key)"
              @update:model-value="setFieldValue(field.key, $event)"
              :placeholder="field.placeholder"
              :controls="true"
            />
          </template>

          <!-- Textarea 类型 -->
          <template v-else-if="field.type === 'textarea'">
            <el-input
              :model-value="getFieldValue(field.key)"
              @update:model-value="setFieldValue(field.key, $event)"
              type="textarea"
              :rows="4"
              :placeholder="field.placeholder"
            />
          </template>

          <!-- Table 类型（数组对象编辑） -->
          <template v-else-if="field.type === 'table' && field.columns">
            <TableFieldEditor
              :columns="field.columns"
              :model-value="getTableRows(field.key)"
              @update:model-value="setFieldValue(field.key, $event)"
              :table-config="field.tableConfig"
              :presets="getPresets(field.tableConfig?.presetsSource)"
            />
          </template>

          <!-- Password 类型 -->
          <template v-else-if="field.type === 'password'">
            <el-input
              :model-value="getFieldValue(field.key)"
              @update:model-value="setFieldValue(field.key, $event)"
              type="password"
              show-password
              :placeholder="field.placeholder"
            />
          </template>

          <!-- Text/String 类型 (默认) -->
          <template v-else>
            <el-input
              :model-value="getFieldValue(field.key)"
              @update:model-value="setFieldValue(field.key, $event)"
              :placeholder="field.placeholder"
              :clearable="clearable"
            />
          </template>

          <!-- 字段描述 -->
          <div v-if="field.description" class="field-desc">{{ field.description }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { ConfigField, TableColumnDefinition } from '../types'
import TableFieldEditor from './TableFieldEditor.vue'

interface Props {
  /** 配置字段定义 */
  fields: ConfigField[]
  /** 配置值对象 (v-model) */
  modelValue: Record<string, any>
  /** 是否显示清除按钮 */
  clearable?: boolean
  /** 预设数据源（外部注入） */
  presetsMap?: Record<string, Record<string, any>[]>
}

const props = withDefaults(defineProps<Props>(), {
  clearable: false,
  presetsMap: () => ({})
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

// 获取字段值
const getFieldValue = (key: string) => {
  return props.modelValue[key]
}

// 设置字段值
const setFieldValue = (key: string, value: any) => {
  const newValue = { ...props.modelValue, [key]: value }
  emit('update:modelValue', newValue)
}

// 判断字段是否应该显示（基于 showWhen 条件）
const shouldShowField = (field: ConfigField) => {
  if (!field.showWhen) return true
  const { field: dependField, value } = field.showWhen
  return props.modelValue[dependField] === value
}

// ============ Table 类型支持 ============

// 获取表格行数据
const getTableRows = (key: string): Record<string, any>[] => {
  const value = props.modelValue[key]
  return Array.isArray(value) ? value : []
}

// 获取预设数据
const getPresets = (source?: string): Record<string, any>[] => {
  if (!source) return []
  return props.presetsMap?.[source] || []
}
</script>

<style scoped>
.config-renderer {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 1.25rem;
}

.form-label {
  width: 120px;
  flex-shrink: 0;
  color: var(--k-color-text-description);
  padding-top: 6px;
  font-size: 0.9rem;
}

.form-label.required::after {
  content: '*';
  color: var(--k-color-error, #f56c6c);
  margin-left: 4px;
}

.field-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-desc {
  font-size: 0.8rem;
  color: var(--k-color-text-description);
  margin-top: 0.25rem;
}
</style>
