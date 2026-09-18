<template>
  <div class="presets-view">
    <!-- 紧凑工具栏 -->
    <div class="compact-toolbar pop-card no-hover">
      <!-- 左侧：视图切换 + 筛选 + 搜索 -->
      <div class="toolbar-left">
        <div class="btn-group">
          <button
            class="group-btn"
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
            title="列表视图"
          >
            <k-icon name="tasks" />
          </button>
          <button
            class="group-btn"
            :class="{ active: viewMode === 'card' }"
            @click="viewMode = 'card'"
            title="卡片视图"
          >
            <k-icon name="image" />
          </button>
        </div>
        <div class="filter-divider"></div>
        <!-- 搜索框 -->
        <div class="search-box">
          <k-icon name="search" class="search-icon" />
          <input
            v-model="searchQuery"
            class="pop-input small search-input"
            placeholder="搜索名称或Prompt..."
          />
          <button
            v-if="searchQuery"
            class="search-clear"
            @click="searchQuery = ''"
            title="清除搜索"
          ><k-icon name="close" /></button>
        </div>
        <div class="filter-divider"></div>
        <select v-model="filter.source" class="pop-select small">
          <option value="">来源</option>
          <option value="user">本地</option>
          <option value="api">远程</option>
        </select>
        <select v-model="filter.enabled" class="pop-select small">
          <option :value="undefined">状态</option>
          <option :value="true">已启用</option>
          <option :value="false">已禁用</option>
        </select>
        <span class="result-count">共{{ filteredPresets.length }}个预设</span>
      </div>
      <!-- 右侧：批量管理 + 操作按钮 -->
      <div class="toolbar-right">
        <!-- 批量管理模式 -->
        <template v-if="batchMode">
          <span class="batch-info">已选 {{ selectedIds.size }} 项</span>
          <button
            class="pop-btn small"
            :disabled="selectedIds.size === 0"
            @click="batchToggle(true)"
            title="批量启用"
          ><k-icon name="check" /> 启用</button>
          <button
            class="pop-btn small"
            :disabled="selectedIds.size === 0"
            @click="batchToggle(false)"
            title="批量禁用"
          ><k-icon name="times-full" /> 禁用</button>
          <button
            class="pop-btn small danger"
            :disabled="selectedIds.size === 0 || !canBatchDelete"
            @click="batchDelete"
            title="批量删除（仅本地预设）"
          ><k-icon name="delete" /> 删除</button>
          <div class="filter-divider"></div>
          <button class="pop-btn small" @click="exitBatchMode">取消</button>
        </template>
        <!-- 常规模式 -->
        <template v-else>
          <button class="pop-btn small" @click="enterBatchMode" title="批量管理"><k-icon name="presets" /> 批量</button>
          <button class="pop-btn small" @click="fetchData" title="刷新"><k-icon name="refresh" /></button>
          <button class="pop-btn small primary" @click="openCreateDialog">
            <k-icon name="add" /> 新建
          </button>
        </template>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="view-content pop-scrollbar">
      <!-- 列表视图 -->
      <template v-if="viewMode === 'list'">
        <div class="list-table pop-card no-hover">
          <table class="preset-table">
            <thead>
              <tr>
                <th v-if="batchMode" style="width: 40px">
                  <label class="batch-checkbox">
                    <input
                      type="checkbox"
                      :checked="isAllSelected"
                      :indeterminate="isPartialSelected"
                      @change="toggleSelectAll"
                    />
                    <span class="checkmark"></span>
                  </label>
                </th>
                <th style="width: 70px">缩略图</th>
                <th style="width: 160px">名称</th>
                <th>Prompt 模板</th>
                <th style="width: 80px">参考图</th>
                <th style="width: 90px">来源</th>
                <th style="width: 70px">状态</th>
                <th style="width: 50px"></th>
                <th style="width: 50px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in displayPresets" :key="row.id" @click="handleRowClick(row)">
                <td v-if="batchMode" @click.stop>
                  <label class="batch-checkbox">
                    <input
                      type="checkbox"
                      :checked="selectedIds.has(row.id)"
                      @change="toggleSelect(row.id)"
                    />
                    <span class="checkmark"></span>
                  </label>
                </td>
                <td>
                  <div class="thumb-cell">
                    <img v-if="row.thumbnail" :src="row.thumbnail" class="thumb-img" />
                    <div v-else class="thumb-empty"><k-icon name="image" /></div>
                  </div>
                </td>
                <td>
                  <span class="preset-name">{{ row.name }}</span>
                </td>
                <td>
                  <div class="prompt-cell" :title="row.promptTemplate">
                    {{ truncate(row.promptTemplate, 60) }}
                  </div>
                </td>
                <td style="text-align: center">
                  <span v-if="row.referenceImages?.length" class="badge-count">
                    {{ row.referenceImages.length }}
                  </span>
                  <span v-else class="text-muted">-</span>
                </td>
                <td style="text-align: center">
                  <span class="source-tag" :class="row.source">
                    {{ row.source === 'api' ? '远程' : '本地' }}
                  </span>
                </td>
                <td style="text-align: center" @click.stop>
                  <label class="toggle-switch">
                    <input type="checkbox" v-model="row.enabled" @change="handleToggle(row)" />
                    <span class="toggle-slider"></span>
                  </label>
                </td>
                <td style="text-align: center">
                  <span
                    v-if="row.source === 'user' && row.thumbnail"
                    class="action-btn upload"
                    title="上传到云端"
                    @click.stop="handleUpload(row)"
                  ><k-icon name="image" /></span>
                </td>
                <td style="text-align: center">
                  <span
                    v-if="row.source === 'user'"
                    class="action-btn delete"
                    title="删除"
                    @click.stop="handleDelete(row)"
                  ><k-icon name="delete" /></span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- 卡片视图 -->
      <template v-else-if="viewMode === 'card'">
        <div v-if="displayPresets.length === 0" class="empty-view">
          <k-icon name="presets" class="empty-icon" />
          <p>暂无预设</p>
        </div>
        <MasonryGrid
          v-else
          :items="displayPresets"
          :item-key="(preset) => preset.id"
          :min-column-width="200"
          :gap="16"
        >
          <template #default="{ item: preset }">
            <div
              class="preset-card pop-card"
              :class="{ 'batch-selected': batchMode && selectedIds.has(preset.id) }"
              @click="batchMode ? toggleSelect(preset.id) : openEditDialog(preset)"
            >
              <!-- 批量选择复选框 -->
              <div v-if="batchMode" class="card-checkbox" @click.stop>
                <label class="batch-checkbox">
                  <input
                    type="checkbox"
                    :checked="selectedIds.has(preset.id)"
                    @change="toggleSelect(preset.id)"
                  />
                  <span class="checkmark"></span>
                </label>
              </div>
              <!-- 缩略图 - 卡片主体 -->
              <div class="card-thumb" v-if="preset.thumbnail">
                <img :src="preset.thumbnail" loading="lazy" />
                <!-- 悬浮时显示的中央操作区 -->
                <div class="thumb-overlay">
                  <div class="overlay-controls" @click.stop>
                    <label class="toggle-switch">
                      <input type="checkbox" v-model="preset.enabled" @change="handleToggle(preset)" />
                      <span class="toggle-slider"></span>
                    </label>
                    <button class="overlay-btn" title="复制为新预设" @click="handleCopy(preset)"><k-icon name="tasks" /></button>
                    <button
                      v-if="preset.source === 'user'"
                      class="overlay-btn danger"
                      title="删除"
                      @click="handleDelete(preset)"
                    ><k-icon name="delete" /></button>
                    <button class="overlay-btn upload" v-if="preset.source === 'user'" title="上传到云端" @click="handleUpload(preset)"><k-icon name="image" /></button>
                  </div>
                </div>
                <!-- 参考图数量 -->
                <span v-if="preset.referenceImages?.length" class="ref-badge">
                  <k-icon name="image" /> {{ preset.referenceImages.length }}
                </span>
              </div>
              <div class="card-thumb empty" v-else>
                <k-icon name="image" class="empty-thumb-icon" />
                <!-- 悬浮时显示的中央操作区 -->
                <div class="thumb-overlay">
                  <div class="overlay-controls" @click.stop>
                    <label class="toggle-switch">
                      <input type="checkbox" v-model="preset.enabled" @change="handleToggle(preset)" />
                      <span class="toggle-slider"></span>
                    </label>
                    <button class="overlay-btn" title="复制为新预设" @click="handleCopy(preset)"><k-icon name="tasks" /></button>
                    <button
                      v-if="preset.source === 'user'"
                      class="overlay-btn danger"
                      title="删除"
                      @click="handleDelete(preset)"
                    ><k-icon name="delete" /></button>
                  </div>
                </div>
              </div>

              <!-- 紧凑底部：名称 + 标签 -->
              <div class="card-info">
                <div class="card-name">{{ preset.name }}</div>
                <div class="card-tags" v-if="preset.tags?.length">
                  <span v-for="tag in preset.tags.slice(0, 3)" :key="tag" class="tag-item">{{ tag }}</span>
                  <span v-if="preset.tags.length > 3" class="tag-more">+{{ preset.tags.length - 3 }}</span>
                </div>
              </div>

              <!-- 来源标记 -->
              <div class="card-source" :class="preset.source">
                {{ preset.source === 'api' ? '远程' : '本地' }}
              </div>
            </div>
          </template>
        </MasonryGrid>
      </template>
    </div>

    <!-- 分页栏 -->
    <div class="pagination-bar pop-card no-hover">
      <div class="page-size-select">
        <span class="page-size-label">每页</span>
        <select v-model="pageSize" class="pop-select small" @change="page = 1">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
        <span class="page-size-label">条</span>
      </div>
      <div class="page-nav">
        <button class="pop-btn small" :disabled="page <= 1" @click="page--"><k-icon name="chevron-left" /></button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="pop-btn small" :disabled="page >= totalPages" @click="page++"><k-icon name="chevron-right" /></button>
      </div>
      <div class="page-total">共 {{ filteredPresets.length }} 条</div>
    </div>

    <!-- 编辑对话框 -->
    <Teleport to="#ml-teleport-container" defer>
      <div v-if="dialogVisible" class="modal-overlay" @click.self="dialogVisible = false">
        <div class="modal-dialog pop-card no-hover">
          <div class="modal-header">
            <h3>{{ isEdit ? '编辑预设' : '新建预设' }}</h3>
            <button class="modal-close" @click="dialogVisible = false"><k-icon name="close" /></button>
          </div>
          <div class="modal-body pop-scrollbar">
            <div class="form-group">
              <label class="form-label required">名称</label>
              <input
                v-model="form.name"
                :disabled="isEdit && form.source === 'api'"
                class="pop-input"
                placeholder="预设名称"
              />
            </div>

            <div class="form-group">
              <label class="form-label required">Prompt 模板</label>
              <textarea
                v-model="form.promptTemplate"
                class="pop-textarea"
                rows="4"
                placeholder="提示词模板，可用 {prompt} 指定用户输入位置"
              ></textarea>
            </div>

            <div class="form-group" v-if="form.source === 'user'">
              <label class="form-label">缩略图</label>
              <ImageUpload v-model="thumbnailList" :max-count="1" />
            </div>

            <div class="form-group">
              <label class="form-label">参考图</label>
              <ImageUpload v-model="form.referenceImages!" :max-count="5" />
            </div>

            <div class="form-divider">
              <span>高级设置</span>
            </div>

            <div class="form-group">
              <label class="form-label">标签</label>
              <TagInput v-model="form.tags!" placeholder="添加标签" />
            </div>

            <div class="form-group">
              <label class="form-label">参数覆盖</label>
              <JsonEditor v-model="form.parameterOverrides" :rows="3" />
            </div>

            <div class="form-group inline">
              <label class="form-label">启用</label>
              <label class="toggle-switch">
                <input type="checkbox" v-model="form.enabled" />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="pop-btn" @click="dialogVisible = false">取消</button>
            <button class="pop-btn primary" @click="handleSubmit">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 上传对话框 -->
    <UploadDialog
      v-if="uploadPreset"
      v-model="uploadDialogVisible"
      mode="preset"
      :preset-data="{
        name: uploadPreset.name,
        promptTemplate: uploadPreset.promptTemplate,
        thumbnail: uploadPreset.thumbnail,
        tags: uploadPreset.tags,
        referenceImages: uploadPreset.referenceImages
      }"
      @success="loadPresets"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { PresetData } from '../types'
import { presetApi } from '../api'
import TagInput from './TagInput.vue'
import JsonEditor from './JsonEditor.vue'
import ImageUpload from './ImageUpload.vue'
import MasonryGrid from './MasonryGrid.vue'
import UploadDialog from './UploadDialog.vue'

type ViewMode = 'list' | 'card'

// 预置标签
const presetTags = ['本地', '远程', 'text2img', 'img2img', 'NSFW']

// 视图状态
const viewMode = ref<ViewMode>('card')
const loading = ref(false)
const presets = ref<PresetData[]>([])
const selectedTags = ref<string[]>([])
const searchQuery = ref('')

// 批量管理
const batchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())

// 筛选
const filter = ref({
  source: '',
  enabled: undefined as boolean | undefined
})

// 分页
const page = ref(1)
const pageSize = ref(20)

// 对话框
const dialogVisible = ref(false)
const isEdit = ref(false)
const form = ref<Partial<PresetData>>({})
const thumbnailList = ref<string[]>([])

// 从预设中提取自定义标签（排除预置标签）
const customTags = computed(() => {
  const tagSet = new Set<string>()
  presets.value.forEach(p => {
    (p.tags || []).forEach(t => {
      if (!presetTags.includes(t)) tagSet.add(t)
    })
  })
  return Array.from(tagSet).sort()
})

// 筛选后的数据
const filteredPresets = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  return presets.value.filter(p => {
    // 搜索筛选
    if (query) {
      const nameMatch = p.name.toLowerCase().includes(query)
      const promptMatch = p.promptTemplate?.toLowerCase().includes(query)
      if (!nameMatch && !promptMatch) return false
    }
    // 来源筛选
    if (filter.value.source && p.source !== filter.value.source) return false
    // 状态筛选
    if (filter.value.enabled !== undefined && p.enabled !== filter.value.enabled) return false
    // 标签筛选
    if (selectedTags.value.length > 0) {
      const match = selectedTags.value.every(tag => {
        if (tag === '本地') return p.source === 'user'
        if (tag === '远程') return p.source === 'api'
        return (p.tags || []).includes(tag)
      })
      if (!match) return false
    }
    return true
  })
})

// 总页数
const totalPages = computed(() => Math.max(1, Math.ceil(filteredPresets.value.length / pageSize.value)))

// 当前页数据
const displayPresets = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredPresets.value.slice(start, start + pageSize.value)
})

// 缩略图同步
watch(() => form.value.thumbnail, val => {
  thumbnailList.value = val ? [val] : []
}, { immediate: true })

watch(thumbnailList, val => {
  form.value.thumbnail = val[0] || ''
})

// 方法
const fetchData = async () => {
  loading.value = true
  try {
    presets.value = await presetApi.list()
  } catch {
    alert('加载失败')
  } finally {
    loading.value = false
  }
}

const truncate = (text: string, len: number) => {
  if (!text) return '-'
  const s = text.replace(/\s+/g, ' ').trim()
  return s.length > len ? s.slice(0, len) + '...' : s
}

const openCreateDialog = () => {
  isEdit.value = false
  form.value = {
    name: '',
    promptTemplate: '',
    referenceImages: [],
    tags: ['text2img', 'img2img'],
    parameterOverrides: {},
    enabled: true,
    source: 'user'
  }
  dialogVisible.value = true
}

const openEditDialog = (preset: PresetData) => {
  isEdit.value = true
  form.value = JSON.parse(JSON.stringify(preset))
  dialogVisible.value = true
}

const handleRowClick = (row: PresetData) => openEditDialog(row)

const handleToggle = async (preset: PresetData) => {
  try {
    await presetApi.toggle(preset.id, preset.enabled)
  } catch {
    preset.enabled = !preset.enabled
    alert('操作失败')
  }
}

const handleCopy = (preset: PresetData) => {
  isEdit.value = false
  const copy = JSON.parse(JSON.stringify(preset))
  delete copy.id
  copy.name = `${preset.name} (副本)`
  copy.source = 'user'
  form.value = copy
  dialogVisible.value = true
}

const handleDelete = async (preset: PresetData) => {
  if (!confirm(`确定删除预设 "${preset.name}"？`)) return
  try {
    await presetApi.delete(preset.id)
    alert('已删除')
    fetchData()
  } catch {
    alert('删除失败')
  }
}

// ============ 批量管理 ============
// 是否全选当前页
const isAllSelected = computed(() => {
  if (displayPresets.value.length === 0) return false
  return displayPresets.value.every(p => selectedIds.value.has(p.id))
})

// 是否部分选中
const isPartialSelected = computed(() => {
  if (displayPresets.value.length === 0) return false
  const selected = displayPresets.value.filter(p => selectedIds.value.has(p.id)).length
  return selected > 0 && selected < displayPresets.value.length
})

// 选中的预设中是否有可删除的（本地预设）
const canBatchDelete = computed(() => {
  return presets.value.some(p => selectedIds.value.has(p.id) && p.source === 'user')
})

// 进入批量管理模式
const enterBatchMode = () => {
  batchMode.value = true
  selectedIds.value = new Set()
}

// 退出批量管理模式
const exitBatchMode = () => {
  batchMode.value = false
  selectedIds.value = new Set()
}

// 切换单个选择
const toggleSelect = (id: string) => {
  const newSet = new Set(selectedIds.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  selectedIds.value = newSet
}

// 全选/取消全选当前页
const toggleSelectAll = () => {
  const newSet = new Set(selectedIds.value)
  if (isAllSelected.value) {
    // 取消全选当前页
    displayPresets.value.forEach(p => newSet.delete(p.id))
  } else {
    // 全选当前页
    displayPresets.value.forEach(p => newSet.add(p.id))
  }
  selectedIds.value = newSet
}

// 批量切换启用状态
const batchToggle = async (enabled: boolean) => {
  const ids = Array.from(selectedIds.value)
  if (ids.length === 0) return

  const action = enabled ? '启用' : '禁用'
  if (!confirm(`确定${action} ${ids.length} 个预设？`)) return

  try {
    let successCount = 0
    for (const id of ids) {
      try {
        await presetApi.toggle(id, enabled)
        successCount++
      } catch (e) {
        console.error(`Failed to toggle preset ${id}:`, e)
      }
    }
    alert(`已${action} ${successCount} 个预设`)
    fetchData()
    exitBatchMode()
  } catch {
    alert('操作失败')
  }
}

// 批量删除（仅本地预设）
const batchDelete = async () => {
  const ids = Array.from(selectedIds.value)
  const deletablePresets = presets.value.filter(p => ids.includes(p.id) && p.source === 'user')

  if (deletablePresets.length === 0) {
    alert('没有可删除的本地预设')
    return
  }

  if (!confirm(`确定删除 ${deletablePresets.length} 个本地预设？（远程预设不会被删除）`)) return

  try {
    let successCount = 0
    for (const preset of deletablePresets) {
      try {
        await presetApi.delete(preset.id)
        successCount++
      } catch (e) {
        console.error(`Failed to delete preset ${preset.id}:`, e)
      }
    }
    alert(`已删除 ${successCount} 个预设`)
    fetchData()
    exitBatchMode()
  } catch {
    alert('删除失败')
  }
}

// 上传相关
const uploadDialogVisible = ref(false)
const uploadPreset = ref<PresetData | null>(null)

const handleUpload = (preset: PresetData) => {
  // 需要有缩略图才能上传
  if (!preset.thumbnail) {
    alert('预设没有缩略图，无法上传')
    return
  }
  uploadPreset.value = preset
  uploadDialogVisible.value = true
}

const handleSubmit = async () => {
  if (!form.value.name || !form.value.promptTemplate) {
    alert('请填写必要信息')
    return
  }
  try {
    if (isEdit.value && form.value.id) {
      await presetApi.update(form.value.id, form.value)
      alert('已保存')
    } else {
      await presetApi.create(form.value as Omit<PresetData, 'id'>)
      alert('已创建')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    alert('保存失败')
  }
}

onMounted(fetchData)
</script>

<style lang="scss">
@use '../styles/theme.scss';
</style>

<style scoped lang="scss">
/* ============ 视图容器 ============ */
.presets-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 16px;
  overflow: hidden; /* 视图本身不滚动 */
}

/* ============ 紧凑工具栏 ============ */
.compact-toolbar {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-divider {
  width: 2px;
  height: 20px;
  background: var(--ml-border-color);
  border-radius: 1px;
}

.result-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--ml-text-muted);
  white-space: nowrap;
}

/* ============ 搜索框 ============ */
.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  font-size: 14px;
  pointer-events: none;
  z-index: 1;
}

.search-input {
  padding-left: 32px !important;
  padding-right: 28px !important;
  width: 180px;
}

.search-clear {
  position: absolute;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: var(--ml-bg-alt);
  color: var(--ml-text-muted);
  border-radius: 50%;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.15s;
}

.search-clear:hover {
  background: var(--ml-danger);
  color: white;
}

/* ============ 批量管理 ============ */
.batch-info {
  font-size: 13px;
  font-weight: 700;
  color: var(--ml-primary-dark);
  white-space: nowrap;
}

.batch-checkbox {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.batch-checkbox input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}

.batch-checkbox .checkmark {
  width: 18px;
  height: 18px;
  background: var(--ml-surface);
  border: 2px solid var(--ml-border-color);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.batch-checkbox input:checked + .checkmark {
  background: var(--ml-primary);
  border-color: var(--ml-primary-dark);
}

.batch-checkbox input:checked + .checkmark::after {
  content: "✓";
  font-size: 12px;
  font-weight: 700;
  color: var(--ml-text);
}

.batch-checkbox input:indeterminate + .checkmark {
  background: var(--ml-primary-light);
  border-color: var(--ml-primary);
}

.batch-checkbox input:indeterminate + .checkmark::after {
  content: "−";
  font-size: 14px;
  font-weight: 700;
  color: var(--ml-text);
}

/* 卡片视图批量选择 */
.card-checkbox {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 6px;
  padding: 4px;
  border: 2px solid var(--ml-border-color);
}

.preset-card.batch-selected {
  border-color: var(--ml-primary);
  box-shadow: 0 0 0 3px var(--ml-primary-light), var(--ml-shadow);
}

.btn-group {
  display: flex;
  background: var(--ml-bg-alt);
  border: var(--ml-border);
  border-radius: var(--ml-radius);
  padding: 4px;
  gap: 4px;
}

.group-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--ml-text-muted);
  cursor: pointer;
  border-radius: calc(var(--ml-radius) - 4px);
  font-size: 14px;
  transition: all 0.15s;
}

.group-btn:hover {
  color: var(--ml-text);
  background: var(--ml-bg);
}

.group-btn.active {
  color: var(--ml-text);
  background: var(--ml-primary-soft, var(--ml-primary-light));
}

/* ============ 内容区域 ============ */
.view-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.view-content:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.view-content::-webkit-scrollbar {
  width: 6px;
}

.view-content::-webkit-scrollbar-track {
  background: transparent;
}

.view-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.view-content:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

/* ============ 列表表格 ============ */
.list-table {
  overflow: hidden;
}

.preset-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.preset-table thead {
  background: var(--ml-bg-alt);
}

.preset-table th {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ml-text-muted);
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: var(--ml-border);
}

.preset-table tbody tr {
  cursor: pointer;
  transition: background-color 0.15s;
}

.preset-table tbody tr:hover {
  background: var(--ml-primary-light);
}

.preset-table td {
  padding: 12px 16px;
  border-bottom: 2px solid var(--ml-border-color);
  vertical-align: middle;
}

.preset-table tbody tr:last-child td {
  border-bottom: none;
}

.thumb-cell {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--ml-bg-alt);
  border: 2px solid var(--ml-border-color);
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  opacity: 0.5;
}

.preset-name {
  font-weight: 700;
  color: var(--ml-text);
}

.prompt-cell {
  color: var(--ml-text-muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  background: var(--ml-primary);
  border: 2px solid var(--ml-border-color);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ml-text);
}

.source-tag {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 8px;
  font-weight: 700;
  border: 2px solid var(--ml-border-color);
}

.source-tag.api {
  background: var(--ml-info);
  color: white;
}

.source-tag.user {
  background: var(--ml-warning);
  color: var(--ml-text);
}

.text-muted {
  color: var(--ml-text-muted);
  opacity: 0.5;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}

.action-btn:hover {
  transform: scale(1.15);
}

.action-btn.delete:hover {
  background: var(--ml-danger);
}

.action-btn.upload:hover {
  background: var(--ml-info);
}

/* ============ 分页栏 ============ */
.pagination-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 12px 16px;
}

.page-size-select {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-size-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ml-text-muted);
}

.page-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-info {
  font-size: 14px;
  font-weight: 700;
  color: var(--ml-text);
  min-width: 60px;
  text-align: center;
}

.page-total {
  font-size: 13px;
  font-weight: 600;
  color: var(--ml-text-muted);
}

/* ============ 卡片视图 ============ */
.empty-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px;
  color: var(--ml-text-muted);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.preset-card {
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.2s;
}

.preset-card:hover {
  transform: translateY(-4px);
}

/* 缩略图区域 */
.card-thumb {
  width: 100%;
  position: relative;
  overflow: hidden;
  background: var(--ml-bg-alt);
}

.card-thumb img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform 0.3s;
}

.preset-card:hover .card-thumb img {
  transform: scale(1.05);
}

.card-thumb.empty {
  aspect-ratio: 4/3;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-thumb-icon {
  font-size: 32px;
  opacity: 0.3;
}

/* 悬浮遮罩层 */
.thumb-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.preset-card:hover .thumb-overlay {
  opacity: 1;
}

.overlay-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 24px;
  backdrop-filter: blur(4px);
}

.overlay-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}

.overlay-btn:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: scale(1.1);
}

.overlay-btn.danger:hover {
  background: var(--ml-danger);
}

.overlay-btn.upload:hover {
  background: var(--ml-info);
}

/* 参考图徽章 */
.ref-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 11px;
  font-weight: 700;
  border-radius: 8px;
}

/* 紧凑底部 */
.card-info {
  padding: 10px 12px;
}

.card-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--ml-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-item {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--ml-bg-alt);
  color: var(--ml-text-muted);
  border: 1px solid var(--ml-border-color);
  border-radius: 6px;
  font-weight: 600;
}

.tag-more {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--ml-primary);
  color: var(--ml-text);
  border-radius: 6px;
  font-weight: 700;
}

/* 来源标记 */
.card-source {
  position: absolute;
  top: 8px;
  left: 8px;
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 700;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.card-source.api {
  background: var(--ml-info);
  color: white;
}

.card-source.user {
  background: var(--ml-warning);
  color: var(--ml-text);
}

/* ============ Toggle Switch ============ */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--ml-bg-alt);
  border: none;
  border-radius: 24px;
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.08);
  transition: 0.2s;
}

.toggle-slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: #ffffff;
  border: none;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--ml-success);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

/* ============ 模态框 ============ */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal-dialog {
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  animation: modal-pop 0.2s ease-out;
}

@keyframes modal-pop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: var(--ml-border);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--ml-text);
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--ml-text-muted);
  cursor: pointer;
  font-size: 18px;
  border-radius: 8px;
  transition: all 0.15s;
}

.modal-close:hover {
  background: var(--ml-danger);
  color: white;
}

.modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.modal-body:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.modal-body::-webkit-scrollbar {
  width: 6px;
}

.modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.modal-body::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.modal-body:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

.modal-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: var(--ml-border);
}

/* ============ 表单 ============ */
.form-group {
  margin-bottom: 20px;
}

.form-group.inline {
  display: flex;
  align-items: center;
  gap: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--ml-text);
  margin-bottom: 8px;
}

.form-group.inline .form-label {
  margin-bottom: 0;
}

.form-label.required::after {
  content: " *";
  color: var(--ml-danger);
}

.form-divider {
  display: flex;
  align-items: center;
  margin: 24px 0;
  gap: 16px;
}

.form-divider::before,
.form-divider::after {
  content: "";
  flex: 1;
  height: 2px;
  background: var(--ml-border-color);
}

.form-divider span {
  font-size: 12px;
  font-weight: 700;
  color: var(--ml-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
