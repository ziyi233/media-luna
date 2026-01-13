<template>
  <div class="table-field-editor">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-button type="primary" size="small" @click="addRow">
          <k-icon name="add" />
          添加
        </el-button>
        <el-button
          v-if="tableConfig?.enableBatchDelete && selectedRows.length > 0"
          type="danger"
          size="small"
          @click="deleteSelected"
        >
          删除选中 ({{ selectedRows.length }})
        </el-button>
      </div>
      <div class="toolbar-right">
        <el-button
          v-if="presets?.length > 0"
          size="small"
          @click="showPresetsDialog = true"
        >
          内置预设
        </el-button>
        <el-button
          v-if="tableConfig?.enableImport !== false"
          size="small"
          @click="showImportDialog = true"
        >
          导入
        </el-button>
        <el-button
          v-if="tableConfig?.enableExport !== false"
          size="small"
          @click="exportData"
        >
          导出
        </el-button>
      </div>
    </div>

    <!-- 卡片列表 -->
    <div class="card-list">
      <div
        v-for="(row, index) in rows"
        :key="index"
        class="item-card"
        :class="{ expanded: expandedIndex === index, selected: selectedRows.includes(index) }"
      >
        <!-- 卡片头部（始终显示） -->
        <div class="card-header" @click="toggleExpand(index)">
          <div class="header-left">
            <el-checkbox
              v-if="tableConfig?.enableSelection !== false"
              :model-value="selectedRows.includes(index)"
              @change="toggleRowSelection(index)"
              @click.stop
              size="small"
            />
            <div class="item-summary">
              <span class="item-title">{{ getItemTitle(row) }}</span>
              <span class="item-subtitle">{{ getItemSubtitle(row) }}</span>
            </div>
          </div>
          <div class="header-right">
            <!-- 关键开关（如 enabled）直接显示 -->
            <template v-for="col in keyColumns" :key="col.key">
              <el-switch
                v-if="col.type === 'boolean'"
                :model-value="row[col.key]"
                @update:model-value="updateCell(index, col.key, $event)"
                @click.stop
                size="small"
              />
            </template>
            <k-icon
              :name="expandedIndex === index ? 'chevron-up' : 'chevron-down'"
              class="expand-icon"
            />
            <el-button
              type="danger"
              size="small"
              link
              @click.stop="removeRow(index)"
              class="delete-btn"
            >
              <k-icon name="delete" />
            </el-button>
          </div>
        </div>

        <!-- 展开的详情（点击展开时显示） -->
        <div v-if="expandedIndex === index" class="card-body">
          <div
            v-for="col in editableColumns"
            :key="col.key"
            class="field-row"
          >
            <label class="field-label" :class="{ required: col.required }">
              {{ col.label }}
            </label>
            <div class="field-control">
              <el-input
                v-if="col.type === 'text'"
                :model-value="row[col.key]"
                @update:model-value="updateCell(index, col.key, $event)"
                :placeholder="col.placeholder"
                size="small"
              />
              <el-input-number
                v-else-if="col.type === 'number'"
                :model-value="row[col.key]"
                @update:model-value="updateCell(index, col.key, $event)"
                size="small"
                :controls="false"
                class="num-input"
              />
              <el-switch
                v-else-if="col.type === 'boolean'"
                :model-value="row[col.key]"
                @update:model-value="updateCell(index, col.key, $event)"
                size="small"
              />
              <el-select
                v-else-if="col.type === 'select'"
                :model-value="row[col.key]"
                @update:model-value="updateCell(index, col.key, $event)"
                :placeholder="col.placeholder || '请选择'"
                :teleported="false"
                size="small"
              >
                <el-option
                  v-for="opt in col.options"
                  :key="String(opt.value)"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <div v-if="col.description" class="field-desc">{{ col.description }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="rows.length === 0" class="empty-state">
        <k-icon name="inbox" />
        <span>暂无数据，点击上方"添加"按钮创建</span>
      </div>
    </div>

    <!-- 底部统计 -->
    <div class="table-footer" v-if="rows.length > 0">
      共 {{ rows.length }} 条
    </div>

    <!-- 导入对话框 -->
    <el-dialog
      v-model="showImportDialog"
      title="导入数据"
      width="550px"
      :close-on-click-modal="false"
      :teleported="false"
    >
      <p class="dialog-tip">粘贴 JSON 数组格式数据：</p>
      <el-input
        v-model="importText"
        type="textarea"
        :rows="10"
        placeholder='[{"alias": "xxx", "repoId": "xxx", ...}]'
      />
      <div class="import-mode">
        <el-radio-group v-model="importMode">
          <el-radio value="append">追加</el-radio>
          <el-radio value="replace">替换</el-radio>
        </el-radio-group>
      </div>
      <template #footer>
        <el-button @click="showImportDialog = false">取消</el-button>
        <el-button type="primary" @click="doImport">导入</el-button>
      </template>
    </el-dialog>

    <!-- 预设对话框 -->
    <el-dialog
      v-model="showPresetsDialog"
      title="内置预设"
      width="600px"
      :close-on-click-modal="false"
      :teleported="false"
    >
      <div class="presets-header">
        <el-input
          v-model="presetSearch"
          placeholder="搜索..."
          size="small"
          clearable
          class="search-input"
        />
        <el-button size="small" @click="selectAllPresets">全选</el-button>
        <el-button size="small" @click="selectedPresets = []">清空</el-button>
        <span class="sel-count">已选 {{ selectedPresets.length }}</span>
      </div>
      <div class="presets-list">
        <div
          v-for="p in filteredPresets"
          :key="p.alias"
          class="preset-row"
          :class="{ selected: selectedPresets.includes(p.alias), disabled: existingAliases.has(p.alias?.toLowerCase()) }"
          @click="togglePreset(p.alias)"
        >
          <el-checkbox
            :model-value="selectedPresets.includes(p.alias)"
            :disabled="existingAliases.has(p.alias?.toLowerCase())"
            size="small"
          />
          <span class="p-alias">{{ p.alias }}</span>
          <span class="p-desc">{{ p.description || p.repoId }}</span>
          <el-tag v-if="existingAliases.has(p.alias?.toLowerCase())" size="small" type="info">已有</el-tag>
        </div>
      </div>
      <template #footer>
        <el-button @click="showPresetsDialog = false">取消</el-button>
        <el-button type="primary" @click="importPresets" :disabled="selectedPresets.length === 0">
          导入 ({{ selectedPresets.length }})
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { TableColumnDefinition, TableConfig } from '../types'

interface Props {
  columns: TableColumnDefinition[]
  modelValue: Record<string, any>[]
  tableConfig?: TableConfig
  presets?: Record<string, any>[]
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
  presets: () => []
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>[]]
}>()

const rows = computed({
  get: () => props.modelValue || [],
  set: (val) => emit('update:modelValue', val)
})

const selectedRows = ref<number[]>([])
const expandedIndex = ref<number | null>(null)

const showImportDialog = ref(false)
const importText = ref('')
const importMode = ref<'append' | 'replace'>('append')

const showPresetsDialog = ref(false)
const selectedPresets = ref<string[]>([])
const presetSearch = ref('')

// 关键列：布尔类型的 enabled 等字段，直接显示在卡片头部
const keyColumns = computed(() =>
  props.columns.filter(col => col.type === 'boolean' && (col.key === 'enabled' || col.key === 'asyncSendStartMessage'))
)

// 可编辑列：所有列（在展开区域显示）
const editableColumns = computed(() => props.columns)

// 获取标题列配置
const titleColumnKey = computed(() => props.tableConfig?.titleColumn || props.columns[0]?.key || 'name')
const subtitleColumnKey = computed(() => props.tableConfig?.subtitleColumn || props.columns[1]?.key)

// 获取显示标题
const getItemTitle = (row: Record<string, any>) => {
  const val = row[titleColumnKey.value]
  return val || '未命名'
}

// 获取显示副标题
const getItemSubtitle = (row: Record<string, any>) => {
  if (!subtitleColumnKey.value) return ''
  const val = row[subtitleColumnKey.value]
  if (typeof val === 'string' && val.length > 60) {
    return val.substring(0, 60) + '...'
  }
  return val || ''
}

const existingAliases = computed(() => {
  const set = new Set<string>()
  for (const row of rows.value) {
    if (row.alias) set.add(row.alias.toLowerCase())
  }
  return set
})

const filteredPresets = computed(() => {
  if (!presetSearch.value) return props.presets
  const s = presetSearch.value.toLowerCase()
  return props.presets.filter(p =>
    p.alias?.toLowerCase().includes(s) ||
    p.description?.toLowerCase().includes(s) ||
    p.repoId?.toLowerCase().includes(s)
  )
})

function toggleExpand(index: number) {
  expandedIndex.value = expandedIndex.value === index ? null : index
}

function addRow() {
  const newRow: Record<string, any> = {}
  for (const col of props.columns) {
    newRow[col.key] = col.type === 'boolean' ? false : col.type === 'number' ? undefined : ''
  }
  emit('update:modelValue', [...rows.value, newRow])
  // 自动展开新添加的行
  expandedIndex.value = rows.value.length
}

function removeRow(index: number) {
  const arr = [...rows.value]
  arr.splice(index, 1)
  emit('update:modelValue', arr)
  selectedRows.value = selectedRows.value.filter(i => i !== index).map(i => i > index ? i - 1 : i)
  if (expandedIndex.value === index) {
    expandedIndex.value = null
  } else if (expandedIndex.value !== null && expandedIndex.value > index) {
    expandedIndex.value--
  }
}

function updateCell(rowIndex: number, colKey: string, value: any) {
  const arr = [...rows.value]
  arr[rowIndex] = { ...arr[rowIndex], [colKey]: value }
  emit('update:modelValue', arr)
}

function toggleRowSelection(index: number) {
  const idx = selectedRows.value.indexOf(index)
  if (idx >= 0) selectedRows.value.splice(idx, 1)
  else selectedRows.value.push(index)
}

function deleteSelected() {
  if (selectedRows.value.length === 0) return
  const toDelete = new Set(selectedRows.value)
  emit('update:modelValue', rows.value.filter((_, i) => !toDelete.has(i)))
  ElMessage.success(`已删除 ${toDelete.size} 条`)
  selectedRows.value = []
  expandedIndex.value = null
}

function exportData() {
  const blob = new Blob([JSON.stringify(rows.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'data.json'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}

function doImport() {
  try {
    const data = JSON.parse(importText.value)
    if (!Array.isArray(data)) {
      ElMessage.error('需要 JSON 数组')
      return
    }
    const normalized = data.map(item => {
      const row: Record<string, any> = {}
      for (const col of props.columns) {
        row[col.key] = item[col.key] ?? (col.key === 'repoId' && item.name ? item.name : '')
      }
      return row
    })
    emit('update:modelValue', importMode.value === 'replace' ? normalized : [...rows.value, ...normalized])
    ElMessage.success(`已导入 ${normalized.length} 条`)
    showImportDialog.value = false
    importText.value = ''
  } catch {
    ElMessage.error('JSON 解析失败')
  }
}

function selectAllPresets() {
  selectedPresets.value = filteredPresets.value
    .filter(p => !existingAliases.value.has(p.alias?.toLowerCase()))
    .map(p => p.alias)
}

function togglePreset(alias: string) {
  if (existingAliases.value.has(alias?.toLowerCase())) return
  const idx = selectedPresets.value.indexOf(alias)
  if (idx >= 0) selectedPresets.value.splice(idx, 1)
  else selectedPresets.value.push(alias)
}

function importPresets() {
  const toImport = props.presets.filter(p => selectedPresets.value.includes(p.alias))
  const newRows = toImport.map(preset => {
    const row: Record<string, any> = {}
    for (const col of props.columns) row[col.key] = preset[col.key] ?? ''
    return row
  })
  emit('update:modelValue', [...rows.value, ...newRows])
  ElMessage.success(`已导入 ${newRows.length} 条`)
  showPresetsDialog.value = false
  selectedPresets.value = []
}

watch(showPresetsDialog, (v) => {
  if (v) {
    selectedPresets.value = []
    presetSearch.value = ''
  }
})
</script>

<style scoped>
.table-field-editor {
  width: 100%;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  gap: 6px;
}

/* 卡片列表 - 波普风格 */
.card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item-card {
  background: var(--ml-surface, #ffffff);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius, 12px);
  transition: all 0.15s ease;
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.item-card:hover {
  border-color: var(--ml-primary, #fbbf24);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--ml-border-color, #451a03);
}

.item-card.expanded {
  border-color: var(--ml-primary, #fbbf24);
  box-shadow: 3px 3px 0 var(--ml-border-color, #451a03);
}

.item-card.selected {
  background: var(--ml-primary-light, #fde68a);
}

/* 卡片头部 */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  cursor: pointer;
  min-height: 48px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.item-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.item-title {
  font-weight: 700;
  color: var(--ml-text, #451a03);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-subtitle {
  font-size: 12px;
  color: var(--ml-text-secondary, #92400e);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.expand-icon {
  color: var(--ml-text-secondary, #92400e);
  transition: transform 0.2s;
}

.delete-btn {
  opacity: 0;
  transition: opacity 0.2s;
}

.item-card:hover .delete-btn {
  opacity: 1;
}

/* 卡片内容 */
.card-body {
  padding: 14px 16px 18px;
  border-top: 2px solid var(--ml-border-color, #451a03);
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--ml-bg-alt, #fef3c7);
}

.field-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.field-label {
  width: 100px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--ml-text-secondary, #92400e);
  padding-top: 5px;
  text-align: right;
}

.field-label.required::after {
  content: '*';
  color: var(--ml-error, #ef4444);
  margin-left: 2px;
}

.field-control {
  flex: 1;
  min-width: 0;
}

.field-control :deep(.el-input),
.field-control :deep(.el-select) {
  width: 100%;
}

.field-desc {
  font-size: 12px;
  color: var(--ml-text-muted, #92400e);
  margin-top: 4px;
  font-weight: 600;
}

.num-input {
  width: 100%;
}

/* 空状态 - 波普风格 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 20px;
  color: var(--ml-text-secondary, #92400e);
  font-size: 13px;
  font-weight: 600;
  background: var(--ml-bg-alt, #fef3c7);
  border: 2px dashed var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius, 12px);
}

.empty-state .k-icon {
  font-size: 28px;
  opacity: 0.6;
  color: var(--ml-text-muted, #92400e);
}

.table-footer {
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ml-text-secondary, #92400e);
  text-align: right;
}

/* 对话框 */
.dialog-tip {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ml-text-secondary, #92400e);
}

.import-mode {
  margin-top: 10px;
}

/* 预设对话框 - 波普风格 */
.presets-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.search-input {
  width: 160px;
}

.sel-count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  color: var(--ml-text-secondary, #92400e);
}

.presets-list {
  max-height: 360px;
  overflow-y: auto;
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius-sm, 8px);
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.presets-list:hover {
  scrollbar-color: var(--ml-border-color, #451a03) transparent;
}

.presets-list::-webkit-scrollbar {
  width: 6px;
}

.presets-list::-webkit-scrollbar-track {
  background: transparent;
}

.presets-list::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.presets-list:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color, #451a03);
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 2px solid var(--ml-border-color, #451a03);
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-row:last-child {
  border-bottom: none;
}

.preset-row:hover:not(.disabled) {
  background: var(--ml-bg-alt, #fef3c7);
}

.preset-row.selected:not(.disabled) {
  background: var(--ml-primary-light, #fde68a);
}

.preset-row.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.p-alias {
  font-weight: 700;
  min-width: 80px;
  color: var(--ml-text, #451a03);
}

.p-desc {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--ml-text-secondary, #92400e);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
