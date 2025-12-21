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

    <!-- 数据表格 -->
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th v-if="tableConfig?.enableSelection !== false" class="col-check">
              <el-checkbox
                :model-value="isAllSelected"
                :indeterminate="isIndeterminate"
                @change="toggleSelectAll"
                size="small"
              />
            </th>
            <th
              v-for="col in columns"
              :key="col.key"
              :class="['col-' + col.key, { required: col.required }]"
            >
              {{ col.label }}
            </th>
            <th class="col-op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in rows"
            :key="index"
            :class="{ selected: selectedRows.includes(index) }"
          >
            <td v-if="tableConfig?.enableSelection !== false" class="col-check">
              <el-checkbox
                :model-value="selectedRows.includes(index)"
                @change="toggleRowSelection(index)"
                size="small"
              />
            </td>
            <td v-for="col in columns" :key="col.key" :class="'col-' + col.key">
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
                size="small"
              >
                <el-option
                  v-for="opt in col.options"
                  :key="String(opt.value)"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </td>
            <td class="col-op">
              <el-button type="danger" size="small" link @click="removeRow(index)">
                删除
              </el-button>
            </td>
          </tr>
          <!-- 添加行 -->
          <tr class="add-row" @click="addRow">
            <td :colspan="totalColumns" class="add-cell">
              <span class="add-hint">
                <k-icon name="add" />
                点击添加一行
              </span>
            </td>
          </tr>
        </tbody>
      </table>
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
const isAllSelected = computed(() => rows.value.length > 0 && selectedRows.value.length === rows.value.length)
const isIndeterminate = computed(() => selectedRows.value.length > 0 && selectedRows.value.length < rows.value.length)

const totalColumns = computed(() => {
  let count = props.columns.length + 1 // columns + operation column
  if (props.tableConfig?.enableSelection !== false) count++ // checkbox column
  return count
})

const showImportDialog = ref(false)
const importText = ref('')
const importMode = ref<'append' | 'replace'>('append')

const showPresetsDialog = ref(false)
const selectedPresets = ref<string[]>([])
const presetSearch = ref('')

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

function addRow() {
  const newRow: Record<string, any> = {}
  for (const col of props.columns) {
    newRow[col.key] = col.type === 'boolean' ? false : col.type === 'number' ? undefined : ''
  }
  emit('update:modelValue', [...rows.value, newRow])
}

function removeRow(index: number) {
  const arr = [...rows.value]
  arr.splice(index, 1)
  emit('update:modelValue', arr)
  selectedRows.value = selectedRows.value.filter(i => i !== index).map(i => i > index ? i - 1 : i)
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

function toggleSelectAll(val: boolean) {
  selectedRows.value = val ? rows.value.map((_, i) => i) : []
}

function deleteSelected() {
  if (selectedRows.value.length === 0) return
  const toDelete = new Set(selectedRows.value)
  emit('update:modelValue', rows.value.filter((_, i) => !toDelete.has(i)))
  ElMessage.success(`已删除 ${toDelete.size} 条`)
  selectedRows.value = []
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
  max-width: 100%;
  overflow: hidden;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  gap: 6px;
}

.table-wrapper {
  border: 1px solid var(--k-color-border, #dcdfe6);
  border-radius: 6px;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  min-width: 500px;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th,
.data-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--k-color-border, #ebeef5);
  vertical-align: middle;
}

.data-table th {
  background: var(--k-color-fill, #f5f7fa);
  font-weight: 500;
  color: var(--k-color-text-secondary, #909399);
  font-size: 12px;
  white-space: nowrap;
}

.data-table th.required::after {
  content: '*';
  color: #f56c6c;
  margin-left: 2px;
}

.data-table tbody tr:hover {
  background: var(--k-color-fill-light, #f5f7fa);
}

.data-table tbody tr.selected {
  background: #ecf5ff;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

/* 列宽控制 - 使用百分比 */
.col-check { width: 32px; text-align: center; }
.col-op { width: 45px; text-align: center; }
.col-alias { width: 15%; min-width: 70px; }
.col-repoId { width: 35%; min-width: 120px; }
.col-triggerWords { width: 25%; min-width: 100px; }
.col-description { width: 25%; min-width: 100px; }

.data-table :deep(.el-input) {
  width: 100%;
}

.data-table :deep(.el-input__wrapper) {
  padding: 0 8px;
}

.data-table :deep(.el-input__inner) {
  height: 28px;
  font-size: 12px;
}

.num-input {
  width: 100%;
}

.empty-tip {
  padding: 30px;
  text-align: center;
  color: var(--k-color-text-description, #c0c4cc);
  font-size: 13px;
}

.add-row {
  cursor: pointer;
}

.add-row:hover {
  background: var(--k-color-fill-light, #f5f7fa);
}

.add-cell {
  text-align: center;
  padding: 12px !important;
}

.add-hint {
  color: var(--k-color-active, #409eff);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.table-footer {
  margin-top: 8px;
  font-size: 12px;
  color: var(--k-color-text-description, #909399);
  text-align: right;
}

/* 对话框 */
.dialog-tip {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--k-color-text-secondary);
}

.import-mode {
  margin-top: 10px;
}

/* 预设对话框 */
.presets-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.search-input {
  width: 160px;
}

.sel-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--k-color-text-description);
}

.presets-list {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--k-color-border, #dcdfe6);
  border-radius: 4px;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--k-color-border, #ebeef5);
  cursor: pointer;
  transition: background 0.15s;
}

.preset-row:last-child {
  border-bottom: none;
}

.preset-row:hover:not(.disabled) {
  background: var(--k-color-fill-light, #f5f7fa);
}

.preset-row.selected:not(.disabled) {
  background: #ecf5ff;
}

.preset-row.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.p-alias {
  font-weight: 500;
  min-width: 80px;
}

.p-desc {
  flex: 1;
  font-size: 12px;
  color: var(--k-color-text-description);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
