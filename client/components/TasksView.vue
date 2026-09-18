<template>
  <div class="tasks-view">
    <!-- 紧凑工具栏 -->
    <div class="compact-toolbar pop-card no-hover">
      <div class="toolbar-left">
        <!-- 视图切换 + 时间范围 -->
        <div class="btn-group">
          <button
            class="group-btn"
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
            title="列表视图"
          ><k-icon name="tasks" /></button>
          <button
            class="group-btn"
            :class="{ active: viewMode === 'gallery' }"
            @click="viewMode = 'gallery'"
            title="画廊视图"
          ><k-icon name="image" /></button>
        </div>
        <div class="filter-divider"></div>
        <!-- 搜索框 -->
        <div class="search-box">
          <k-icon name="search" class="search-icon" />
          <input
            v-model="filter.uid"
            class="pop-input small search-input"
            placeholder="用户 UID..."
            @keyup.enter="handleFilterChange"
          />
          <button
            v-if="filter.uid"
            class="search-clear"
            @click="filter.uid = ''; handleFilterChange()"
            title="清除"
          ><k-icon name="close" /></button>
        </div>
        <div class="filter-divider"></div>
        <!-- 时间范围 -->
        <div class="btn-group">
          <button
            class="group-btn"
            :class="{ active: timeRange === 'all' }"
            @click="setTimeRange('all')"
          >全部</button>
          <button
            class="group-btn"
            :class="{ active: timeRange === 'today' }"
            @click="setTimeRange('today')"
          >今日</button>
        </div>
        <!-- 筛选器 -->
        <select
          v-model="filter.status"
          class="pop-select small"
          @change="handleFilterChange"
        >
          <option value="">状态</option>
          <option value="pending">等待中</option>
          <option value="processing">处理中</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
        <select
          v-model="filter.channelId"
          class="pop-select small"
          @change="handleFilterChange"
        >
          <option :value="undefined">渠道</option>
          <option
            v-for="ch in channels"
            :key="ch.id"
            :value="ch.id"
          >{{ ch.name || `渠道 ${ch.id}` }}</option>
        </select>
        <select
          v-model="filter.mediaType"
          class="pop-select small"
          @change="handleFilterChange"
        >
          <option value="">类型</option>
          <option value="image">图片</option>
          <option value="video">视频</option>
          <option value="audio">音频</option>
        </select>
        <span class="result-count" v-if="total > 0">共 {{ total }} 条</span>
      </div>
      <div class="toolbar-right">
        <!-- 批量操作按钮 -->
        <template v-if="selectedIds.size > 0">
          <span class="batch-info">已选 {{ selectedIds.size }} 项</span>
          <button class="pop-btn small danger" @click="openBatchDeleteDialog">
            <k-icon name="delete" /> 删除
          </button>
          <button class="pop-btn small" @click="clearSelection">
            取消
          </button>
          <div class="filter-divider"></div>
        </template>
        <button class="pop-btn small" @click="fetchData" title="刷新"><k-icon name="refresh" /></button>
        <button
          class="pop-btn small danger"
          @click="openDeleteFailedDialog"
          :disabled="!stats || stats.byStatus.failed === 0"
          title="删除所有失败任务"
        >
          <k-icon name="warning" /> 删除失败
        </button>
        <button class="pop-btn small danger" @click="openCleanupDialog">
          <k-icon name="delete" /> 清理
        </button>
      </div>
    </div>

    <div class="stats-bar pop-card no-hover" v-if="stats && viewMode === 'list'">
      <div class="stat-item">
        <div class="stat-label"><span class="indicator total"></span>总任务数</div>
        <div class="stat-value">{{ stats.total }}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label"><span class="indicator success"></span>成功</div>
        <div class="stat-value">{{ stats.byStatus.success }}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label"><span class="indicator failed"></span>失败</div>
        <div class="stat-value">{{ stats.byStatus.failed }}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label"><span class="indicator processing"></span>进行中</div>
        <div class="stat-value">{{ stats.byStatus.pending + stats.byStatus.processing }}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label"><span class="indicator rate"></span>成功率</div>
        <div class="stat-value">{{ stats.successRate }}</div>
      </div>
    </div>

    <!-- 可滚动的内容区域 -->
    <div class="view-content pop-scrollbar" ref="contentRef">
      <!-- 列表视图 -->
      <template v-if="viewMode === 'list'">
        <div class="list-table pop-card no-hover">
          <table class="task-table">
            <thead>
              <tr>
                <th style="width: 50px">
                  <label class="checkbox-wrapper">
                    <input
                      type="checkbox"
                      :checked="isAllSelected"
                      :indeterminate="isIndeterminate"
                      @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
                    />
                    <span class="checkbox-mark"></span>
                  </label>
                </th>
                <th style="width: 80px">ID</th>
                <th style="width: 100px">状态</th>
                <th style="width: 100px">渠道</th>
                <th>提示词</th>
                <th style="width: 140px">输出</th>
                <th style="width: 100px">耗时</th>
                <th style="width: 180px">时间</th>
                <th style="width: 60px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tasks" :key="row.id" @click="handleRowClick(row)">
                <td @click.stop>
                  <label class="checkbox-wrapper">
                    <input
                      type="checkbox"
                      :checked="selectedIds.has(row.id)"
                      @change="toggleSelect(row.id, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="checkbox-mark"></span>
                  </label>
                </td>
                <td style="text-align: center">
                  <span class="mono-text">#{{ row.id }}</span>
                </td>
                <td style="text-align: center">
                  <StatusBadge :status="row.status" />
                </td>
                <td style="text-align: center">{{ row.channelId }}</td>
                <td>
                  <div class="prompt-cell" :title="getFinalPrompt(row)">{{ getFinalPrompt(row) }}</div>
                </td>
                <td style="text-align: center">
                  <div v-if="row.responseSnapshot && row.responseSnapshot.length" class="output-thumbnails">
                    <template v-for="(asset, idx) in row.responseSnapshot.slice(0, 3)" :key="idx">
                      <img
                        v-if="asset.kind === 'image' && asset.url"
                        :src="asset.url"
                        class="output-thumb"
                        @error="handleImageError"
                      />
                      <div v-else-if="asset.kind === 'video'" class="output-thumb video-thumb">
                        <k-icon name="image" />
                      </div>
                      <div v-else-if="asset.kind === 'audio'" class="output-thumb audio-thumb">
                        <k-icon name="image" />
                      </div>
                      <div v-else-if="asset.kind === 'text'" class="output-thumb text-thumb"><k-icon name="edit" /></div>
                      <div v-else-if="asset.kind === 'file'" class="output-thumb file-thumb"><k-icon name="file-archive" /></div>
                    </template>
                    <span v-if="row.responseSnapshot.length > 3" class="output-more">
                      +{{ row.responseSnapshot.length - 3 }}
                    </span>
                  </div>
                  <span v-else class="text-muted">-</span>
                </td>
                <td style="text-align: right">
                  <span v-if="row.duration">{{ formatDuration(row.duration) }}</span>
                  <span v-else>-</span>
                </td>
                <td style="text-align: center">
                  <span class="time-text">{{ formatDate(row.startTime) }}</span>
                </td>
                <td style="text-align: center">
                  <span
                    class="action-btn delete"
                    title="删除"
                    @click.stop="confirmDeleteTask(row)"
                  ><k-icon name="delete" /></span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- 画廊视图 (瀑布流) -->
      <template v-else-if="viewMode === 'gallery'">
        <div v-if="galleryItems.length === 0" class="empty-gallery">
          <k-icon name="image" class="empty-icon" />
          <p>暂无成功生成的图片</p>
        </div>
        <MasonryGrid
          v-else
          :items="galleryItems"
          :item-key="(item) => item.id + '-' + item.assetIndex"
          :min-column-width="220"
          :gap="16"
        >
          <template #default="{ item }">
            <div class="gallery-item pop-card" @click="openGalleryDetail(item)">
              <div class="gallery-image-wrapper">
                <img
                  v-if="item.kind === 'image'"
                  :src="item.url"
                  class="gallery-image"
                  loading="lazy"
                  @error="handleImageError"
                />
                <video
                  v-else-if="item.kind === 'video'"
                  :src="item.url"
                  class="gallery-video"
                  muted
                  loop
                  @mouseenter="($event.target as HTMLVideoElement).play()"
                  @mouseleave="($event.target as HTMLVideoElement).pause()"
                />
                <div v-else-if="item.kind === 'audio'" class="gallery-audio">
                  <AudioPlayer
                    :src="item.url"
                    :duration="item.duration"
                    compact
                    @click.stop
                  />
                </div>
                <div v-if="item.kind !== 'audio'" class="gallery-overlay">
                  <k-icon name="search" class="zoom-icon" />
                </div>
              </div>
              <!-- 画廊模式下隐藏数据展示，纯图片浏览 -->
            </div>
          </template>
        </MasonryGrid>
      </template>
    </div>

    <!-- 分页 (固定在底部) -->
    <div class="pagination-bar pop-card no-hover">
      <div class="page-size-select">
        <span class="page-size-label">每页</span>
        <select v-model="pageSize" class="pop-select small" @change="handlePageSizeChange">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
        <span class="page-size-label">条</span>
      </div>
      <div class="page-nav">
        <button class="pop-btn small" :disabled="page <= 1" @click="goToPage(page - 1)"><k-icon name="chevron-left" /></button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="pop-btn small" :disabled="page >= totalPages" @click="goToPage(page + 1)"><k-icon name="chevron-right" /></button>
      </div>
      <div class="page-total">共 {{ total }} 条</div>
    </div>

    <!-- 图片预览弹窗 -->
    <ImageLightbox
      v-model:visible="lightboxVisible"
      :task-id="lightboxTaskId"
      :initial-index="lightboxIndex"
    />

    <!-- 清理对话框 -->
    <Teleport to="#ml-teleport-container" defer>
      <div v-if="cleanupVisible" class="modal-overlay" @click.self="cleanupVisible = false">
        <div class="modal-dialog small pop-card no-hover">
          <div class="modal-header">
            <h3>清理旧任务</h3>
            <button class="modal-close" @click="cleanupVisible = false"><k-icon name="close" /></button>
          </div>
          <div class="modal-body">
            <div class="cleanup-form">
              <p>清理多少天前的任务？</p>
              <input type="number" v-model.number="cleanupDays" class="pop-input" min="1" max="365" style="width: 120px" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="pop-btn" @click="cleanupVisible = false">取消</button>
            <button class="pop-btn danger" @click="confirmCleanup">确认清理</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除失败任务确认对话框 -->
    <Teleport to="#ml-teleport-container" defer>
      <div v-if="deleteFailedVisible" class="modal-overlay" @click.self="deleteFailedVisible = false">
        <div class="modal-dialog small pop-card no-hover">
          <div class="modal-header">
            <h3>删除失败任务</h3>
            <button class="modal-close" @click="deleteFailedVisible = false"><k-icon name="close" /></button>
          </div>
          <div class="modal-body">
            <div class="delete-confirm-content">
              <div class="delete-icon-wrapper"><k-icon name="warning" /></div>
              <div class="delete-info">
                <div class="delete-title">确定删除所有失败任务？</div>
                <div class="delete-task-id" v-if="stats">共 {{ stats.byStatus.failed }} 条失败任务</div>
              </div>
              <div class="delete-warning">
                <k-icon name="warning" /> 此操作不可恢复
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="pop-btn" @click="deleteFailedVisible = false">取消</button>
            <button class="pop-btn danger" @click="confirmDeleteFailed">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认对话框 -->
    <Teleport to="#ml-teleport-container" defer>
      <div v-if="deleteConfirmVisible" class="modal-overlay" @click.self="deleteConfirmVisible = false">
        <div class="modal-dialog small pop-card no-hover">
          <div class="modal-header">
            <h3>删除确认</h3>
            <button class="modal-close" @click="deleteConfirmVisible = false"><k-icon name="close" /></button>
          </div>
          <div class="modal-body">
            <div class="delete-confirm-content">
              <div class="delete-icon-wrapper"><k-icon name="delete" /></div>
              <div class="delete-info">
                <div class="delete-title">确定删除此任务？</div>
                <div class="delete-task-id">#{{ taskToDelete?.id }}</div>
                <div class="delete-prompt" v-if="taskToDelete">{{ getDeletePromptPreview(taskToDelete) }}</div>
              </div>
              <div class="delete-warning">
                <k-icon name="warning" /> 此操作不可恢复
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="pop-btn" @click="deleteConfirmVisible = false">取消</button>
            <button class="pop-btn danger" @click="doDeleteTask">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量删除确认对话框 -->
    <Teleport to="#ml-teleport-container" defer>
      <div v-if="batchDeleteVisible" class="modal-overlay" @click.self="batchDeleteVisible = false">
        <div class="modal-dialog small pop-card no-hover">
          <div class="modal-header">
            <h3>批量删除确认</h3>
            <button class="modal-close" @click="batchDeleteVisible = false"><k-icon name="close" /></button>
          </div>
          <div class="modal-body">
            <div class="delete-confirm-content">
              <div class="delete-icon-wrapper batch"><k-icon name="delete" /></div>
              <div class="delete-info">
                <div class="delete-title">确定删除选中的任务？</div>
                <div class="batch-count">
                  <span class="count-number">{{ selectedIds.size }}</span>
                  <span class="count-label">条任务将被删除</span>
                </div>
                <div class="batch-ids">
                  <span v-for="id in Array.from(selectedIds).slice(0, 10)" :key="id" class="batch-id-tag">
                    #{{ id }}
                  </span>
                  <span v-if="selectedIds.size > 10" class="batch-more">
                    +{{ selectedIds.size - 10 }} 更多
                  </span>
                </div>
              </div>
              <div class="delete-warning">
                <k-icon name="warning" /> 此操作不可恢复，请谨慎操作
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="pop-btn" @click="batchDeleteVisible = false">取消</button>
            <button class="pop-btn danger" @click="doBatchDelete">
              确认删除 {{ selectedIds.size }} 条
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { TaskData, ChannelConfig } from '../types'
import { taskApi, channelApi } from '../api'
import { copyToClipboard as copyToClipboardUtil } from '../utils/clipboard'
import StatusBadge from './StatusBadge.vue'
import ImageLightbox from './ImageLightbox.vue'
import AudioPlayer from './AudioPlayer.vue'
import MasonryGrid from './MasonryGrid.vue'

// 内容区域引用（用于滚动到顶部）
const contentRef = ref<HTMLElement | null>(null)

// 视图模式
const viewMode = ref<'list' | 'gallery'>('list')

// 时间范围
const timeRange = ref<'all' | 'today'>('all')

// 状态
const loading = ref(false)
const tasks = ref<TaskData[]>([])
const stats = ref<any>(null)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

// 筛选
const filter = ref({
  status: '' as string,
  uid: '' as string,
  channelId: undefined as number | undefined,
  mediaType: '' as string  // 媒体类型筛选: image/audio/video
})

// 渠道列表（用于下拉筛选）
const channels = ref<ChannelConfig[]>([])

// 画廊详情
const galleryDetailVisible = ref(false)
const currentGalleryItem = ref<GalleryItem | null>(null)

// Lightbox 状态
const lightboxVisible = ref(false)
const lightboxTaskId = ref<number | null>(null)
const lightboxIndex = ref(0)

// 清理
const cleanupVisible = ref(false)
const cleanupDays = ref(30)

// 删除失败任务
const deleteFailedVisible = ref(false)

// 删除确认
const deleteConfirmVisible = ref(false)
const taskToDelete = ref<TaskData | null>(null)

// 批量选择
const selectedIds = ref<Set<number>>(new Set())
const batchDeleteVisible = ref(false)

// 计算属性：是否全选
const isAllSelected = computed(() => {
  if (tasks.value.length === 0) return false
  return tasks.value.every(t => selectedIds.value.has(t.id))
})

// 计算属性：是否部分选中
const isIndeterminate = computed(() => {
  if (tasks.value.length === 0) return false
  const selectedCount = tasks.value.filter(t => selectedIds.value.has(t.id)).length
  return selectedCount > 0 && selectedCount < tasks.value.length
})

// 获取任务的最终提示词
const getFinalPrompt = (task: TaskData): string => {
  return (task.middlewareLogs as any)?.preset?.transformedPrompt
    || task.requestSnapshot?.prompt
    || ''
}

// 获取删除确认弹窗中的提示词预览（截断）
const getDeletePromptPreview = (task: TaskData): string => {
  const prompt = getFinalPrompt(task)
  if (!prompt) return '(无提示词)'
  return prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt
}

// 画廊项目类型
interface GalleryItem {
  id: number
  assetIndex: number
  kind: 'image' | 'video' | 'audio'
  url: string
  prompt: string
  channelId: number
  createdAt: string
  uid: number | null
  duration?: number  // 媒体时长（秒）
}

// 从任务列表提取画廊项目
const galleryItems = computed<GalleryItem[]>(() => {
  const items: GalleryItem[] = []
  for (const task of tasks.value) {
    if (task.status !== 'success' || !task.responseSnapshot) continue

    // 优先使用预设中间件处理后的最终提示词，如果没有则使用原始输入
    const finalPrompt = (task.middlewareLogs as any)?.preset?.transformedPrompt
      || task.requestSnapshot?.prompt
      || ''

    // 从 responseSnapshot 中提取图片/视频/音频 URL
    task.responseSnapshot.forEach((asset, assetIndex) => {
      if ((asset.kind === 'image' || asset.kind === 'video' || asset.kind === 'audio') && asset.url) {
        items.push({
          id: task.id,
          assetIndex,
          kind: asset.kind,
          url: asset.url,
          prompt: finalPrompt,
          channelId: task.channelId,
          createdAt: task.startTime,
          uid: task.uid,
          duration: asset.meta?.duration
        })
      }
    })
  }
  return items
})

// 计算总页数
const totalPages = computed(() => {
  return Math.max(1, Math.ceil(total.value / pageSize.value))
})

// 获取今日开始时间（本地时间 00:00:00）
const getTodayStartDate = (): string => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return today.toISOString()
}

// 设置时间范围
const setTimeRange = (range: 'all' | 'today') => {
  timeRange.value = range
  page.value = 1  // 切换时间范围时重置到第一页
  fetchData()
  // 滚动到顶部
  nextTick(() => {
    if (contentRef.value) {
      contentRef.value.scrollTop = 0
    }
  })
}

// 筛选变化处理
const handleFilterChange = () => {
  page.value = 1  // 筛选变化时重置到第一页
  fetchData()
  // 滚动到顶部
  nextTick(() => {
    if (contentRef.value) {
      contentRef.value.scrollTop = 0
    }
  })
}

// 加载渠道列表
const loadChannels = async () => {
  try {
    channels.value = await channelApi.list()
  } catch (e) {
    console.error('Failed to load channels:', e)
  }
}

// 方法
const fetchData = async () => {
  loading.value = true
  try {
    // 构建查询参数，过滤掉空值
    const query: Record<string, any> = {
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value
    }

    // 时间范围过滤
    if (timeRange.value === 'today') {
      query.startDate = getTodayStartDate()
    }

    // 只添加有值的筛选条件
    if (filter.value.status) {
      query.status = filter.value.status
    }
    if (filter.value.uid && filter.value.uid.trim()) {
      query.uid = Number(filter.value.uid.trim())
    }
    if (filter.value.channelId !== undefined && filter.value.channelId !== null) {
      query.channelId = filter.value.channelId
    }
    if (filter.value.mediaType) {
      query.mediaType = filter.value.mediaType
    }

    // stats 也需要使用相同的时间范围
    const statsParams: { channelId?: number, startDate?: string } = {}
    if (timeRange.value === 'today') {
      statsParams.startDate = getTodayStartDate()
    }

    const [listRes, statsRes] = await Promise.all([
      taskApi.list(query),
      taskApi.stats(statsParams)
    ])

    tasks.value = listRes.items
    total.value = listRes.total
    stats.value = statsRes
  } catch (e) {
    console.error('Failed to fetch tasks:', e)
    alert('加载数据失败')
  } finally {
    loading.value = false
  }
}

const handlePageSizeChange = () => {
  // 改变每页条数时，重置到第一页
  page.value = 1
  fetchData()
  // 滚动到顶部
  nextTick(() => {
    if (contentRef.value) {
      contentRef.value.scrollTop = 0
    }
  })
}

const goToPage = (newPage: number) => {
  if (newPage >= 1 && newPage <= totalPages.value) {
    page.value = newPage
    fetchData()
    // 翻页后滚动到顶部
    nextTick(() => {
      if (contentRef.value) {
        contentRef.value.scrollTop = 0
      }
    })
  }
}

const openGalleryDetail = (item: GalleryItem) => {
  // 设置 taskId 和当前图片索引，ImageLightbox 会自己获取任务数据
  lightboxTaskId.value = item.id
  lightboxIndex.value = item.assetIndex
  lightboxVisible.value = true

  // 保留旧逻辑用于兼容
  currentGalleryItem.value = item
}

const openCleanupDialog = () => {
  cleanupVisible.value = true
}

const confirmCleanup = async () => {
  try {
    const res = await taskApi.cleanup(cleanupDays.value)
    alert(`成功清理 ${res.deleted} 条任务`)
    cleanupVisible.value = false
    fetchData()
  } catch (e) {
    alert('清理失败')
  }
}

// 删除失败任务
const openDeleteFailedDialog = () => {
  deleteFailedVisible.value = true
}

const confirmDeleteFailed = async () => {
  try {
    const res = await taskApi.deleteByStatus('failed')
    alert(`成功删除 ${res.deleted} 条失败任务`)
    deleteFailedVisible.value = false
    fetchData()
  } catch (e) {
    alert('删除失败')
  }
}

// 删除单个任务 - 打开确认对话框
const confirmDeleteTask = (task: TaskData) => {
  taskToDelete.value = task
  deleteConfirmVisible.value = true
}

// 执行删除
const doDeleteTask = async () => {
  if (!taskToDelete.value) return
  try {
    await taskApi.delete(taskToDelete.value.id)
    alert('删除成功')
    deleteConfirmVisible.value = false
    taskToDelete.value = null
    fetchData()
  } catch (e) {
    alert('删除失败')
  }
}

// 批量选择相关函数
const toggleSelect = (id: number, selected: boolean) => {
  const newSet = new Set(selectedIds.value)
  if (selected) {
    newSet.add(id)
  } else {
    newSet.delete(id)
  }
  selectedIds.value = newSet
}

const toggleSelectAll = (selected: boolean) => {
  if (selected) {
    selectedIds.value = new Set(tasks.value.map(t => t.id))
  } else {
    selectedIds.value = new Set()
  }
}

const clearSelection = () => {
  selectedIds.value = new Set()
}

const openBatchDeleteDialog = () => {
  batchDeleteVisible.value = true
}

const doBatchDelete = async () => {
  const ids = Array.from(selectedIds.value)
  if (ids.length === 0) return

  let successCount = 0
  let failCount = 0

  for (const id of ids) {
    try {
      await taskApi.delete(id)
      successCount++
    } catch (e) {
      failCount++
    }
  }

  batchDeleteVisible.value = false
  selectedIds.value = new Set()

  if (failCount === 0) {
    alert(`成功删除 ${successCount} 条任务`)
  } else {
    alert(`删除完成：${successCount} 成功，${failCount} 失败`)
  }

  fetchData()
}

// 行点击处理 - 统一使用 ImageLightbox 查看详情
const handleRowClick = (row: TaskData) => {
  lightboxTaskId.value = row.id
  lightboxIndex.value = 0
  lightboxVisible.value = true
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString()
}

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const handleImageError = (e: Event) => {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}

const copyToClipboard = async (text: string) => {
  const ok = await copyToClipboardUtil(text)
  if (ok) alert('已复制到剪贴板')
  else alert('复制失败，请手动复制')
}

const openInNewTab = (url: string) => {
  window.open(url, '_blank')
}

const getFilename = (item: GalleryItem) => {
  const ext = item.kind === 'video' ? 'mp4' : 'png'
  return `media-luna-${item.id}-${item.assetIndex}.${ext}`
}

onMounted(() => {
  fetchData()
  loadChannels()
})
</script>

<style lang="scss">
@use '../styles/theme.scss';
</style>

<style scoped lang="scss">
/* ============ 视图容器 ============ */
.tasks-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 14px;
  overflow: hidden;
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

.batch-info {
  font-size: 13px;
  font-weight: 700;
  color: var(--ml-primary-dark);
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
  width: 160px;
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

/* 按钮组 */
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
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--ml-text-muted);
  cursor: pointer;
  border-radius: calc(var(--ml-radius) - 4px);
  font-size: 13px;
  font-weight: 600;
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

/* ============ 极简数据看板 (Stats Bar) —— 参考 gemini-designer 建议 ============ */
.stats-bar {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-bottom: 0 !important;
  overflow: hidden;
}

.stat-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 16px;
  border-right: var(--ml-border);
  background: transparent;
  transition: background-color var(--ml-transition);
}

.stat-item:last-child {
  border-right: none;
}

.stat-item:hover {
  background: var(--ml-bg-alt);
}

.stat-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ml-text-muted);
  margin-bottom: 6px;
}

.indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.indicator.total { background: var(--ml-text-muted); opacity: 0.5; }
.indicator.success { background: var(--ml-success); }
.indicator.failed { background: var(--ml-error); }
.indicator.processing { background: var(--ml-warning); }
.indicator.rate { background: var(--ml-primary); }

.stat-value {
  font-size: 26px;
  font-weight: 600;
  color: var(--ml-text);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

/* 响应式：窄屏折叠为 3 列网格 */
@media (max-width: 900px) {
  .stats-bar {
    grid-template-columns: repeat(3, 1fr);
  }
  .stat-item {
    border-bottom: var(--ml-border);
  }
  .stat-item:nth-child(3n) {
    border-right: none;
  }
  .stat-item:nth-last-child(-n+2) {
    border-bottom: none;
  }
}

/* ============ 内容区域 ============ */
.view-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
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

.task-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.task-table thead {
  background: var(--ml-bg-alt);
}

.task-table th {
  padding: 12px 16px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ml-text-muted);
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: var(--ml-border);
}

.task-table tbody tr {
  cursor: pointer;
  transition: background-color 0.15s;
}

.task-table tbody tr:hover {
  background: var(--ml-primary-light);
}

.task-table td {
  padding: 12px 16px;
  border-bottom: 2px solid var(--ml-border-color);
  vertical-align: middle;
}

.task-table tbody tr:last-child td {
  border-bottom: none;
}

.mono-text {
  font-family: 'Consolas', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--ml-text-muted);
}

.prompt-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ml-text);
  font-size: 13px;
}

.time-text {
  font-size: 12px;
  color: var(--ml-text-muted);
  white-space: nowrap;
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

/* ============ 输出缩略图 ============ */
.output-thumbnails {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.output-thumb {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  border: 2px solid var(--ml-border-color);
  background: var(--ml-bg-alt);
}

.video-thumb,
.audio-thumb,
.text-thumb,
.file-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.audio-thumb {
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.15), rgba(64, 158, 255, 0.15));
}

.output-more {
  font-size: 11px;
  font-weight: 600;
  color: var(--ml-text-muted);
  margin-left: 2px;
}

/* ============ 画廊视图 ============ */
.empty-gallery {
  text-align: center;
  padding: 64px 32px;
  color: var(--ml-text-muted);
}

.empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
  opacity: 0.5;
}

.gallery-item {
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s;
}

.gallery-item:hover {
  transform: translateY(-4px);
}

.gallery-image-wrapper {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--ml-bg-alt);
}

.gallery-image,
.gallery-video {
  width: 100%;
  display: block;
  transition: transform 0.3s;
}

.gallery-item:hover .gallery-image,
.gallery-item:hover .gallery-video {
  transform: scale(1.05);
}

.gallery-audio {
  width: 100%;
}

.gallery-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.gallery-item:hover .gallery-overlay {
  opacity: 1;
}

.zoom-icon {
  font-size: 32px;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.3s;
}

.gallery-item:hover .zoom-icon {
  opacity: 1;
  transform: scale(1);
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

/* ============ Checkbox ============ */
.checkbox-wrapper {
  position: relative;
  display: inline-block;
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.checkbox-wrapper input {
  opacity: 0;
  width: 0;
  height: 0;
}

.checkbox-mark {
  position: absolute;
  top: 0;
  left: 0;
  width: 20px;
  height: 20px;
  background: var(--ml-bg);
  border: 1px solid var(--ml-border-color);
  border-radius: 6px;
  transition: all 0.15s;
}

.checkbox-wrapper input:checked + .checkbox-mark {
  background: var(--ml-primary);
  border-color: var(--ml-primary);
}

.checkbox-mark::after {
  content: "";
  position: absolute;
  display: none;
  left: 6px;
  top: 2px;
  width: 5px;
  height: 10px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.checkbox-wrapper input:checked + .checkbox-mark::after {
  display: block;
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
  max-width: 460px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  animation: modal-pop 0.2s ease-out;
}

.modal-dialog.small {
  max-width: 420px;
}

.modal-dialog.large {
  max-width: 800px;
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

/* ============ 详情区域 ============ */
.detail-section {
  margin-bottom: 24px;
}

.detail-section h4 {
  font-size: 14px;
  font-weight: 700;
  color: var(--ml-text);
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--ml-border-color);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  background: var(--ml-bg-alt);
  padding: 16px;
  border-radius: var(--ml-radius);
  border: 2px solid var(--ml-border-color);
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.label {
  font-weight: 700;
  color: var(--ml-text-muted);
}

.code-block {
  background: var(--ml-bg-alt);
  padding: 16px;
  border-radius: var(--ml-radius);
  font-family: 'Consolas', monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
  border: 2px solid var(--ml-border-color);
  color: var(--ml-text);
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.code-block:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.code-block::-webkit-scrollbar {
  width: 4px;
}

.code-block::-webkit-scrollbar-track {
  background: transparent;
}

.code-block::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 2px;
}

.code-block:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

.code-block.error {
  background: rgba(244, 67, 54, 0.1);
  color: var(--ml-danger);
  border-color: var(--ml-danger);
}

.output-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.output-item {
  border: 2px solid var(--ml-border-color);
  border-radius: var(--ml-radius);
  overflow: hidden;
  background: var(--ml-bg-alt);
}

.output-image {
  width: 100%;
  height: 120px;
  object-fit: cover;
  display: block;
}

.text-asset {
  padding: 12px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.text-asset:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.text-asset::-webkit-scrollbar {
  width: 4px;
}

.text-asset::-webkit-scrollbar-track {
  background: transparent;
}

.text-asset::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 2px;
}

.text-asset:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

.file-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--ml-primary-dark);
  text-decoration: none;
  font-size: 13px;
  word-break: break-all;
}

/* ============ 清理表单 ============ */
.cleanup-form {
  text-align: center;
}

.cleanup-form p {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--ml-text);
}

/* ============ 删除确认 ============ */
.delete-confirm-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.delete-icon-wrapper {
  font-size: 48px;
  margin-bottom: 16px;
}

.delete-icon-wrapper.batch {
  font-size: 56px;
}

.delete-info {
  width: 100%;
}

.delete-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ml-text);
  margin-bottom: 12px;
}

.delete-task-id {
  display: inline-block;
  font-family: 'Consolas', monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--ml-primary-dark);
  background: var(--ml-bg-alt);
  padding: 4px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  border: 2px solid var(--ml-border-color);
}

.delete-prompt {
  font-size: 13px;
  color: var(--ml-text-muted);
  background: var(--ml-bg-alt);
  padding: 12px 16px;
  border-radius: var(--ml-radius);
  line-height: 1.5;
  word-break: break-word;
  border: 2px solid var(--ml-border-color);
}

.delete-warning {
  margin-top: 16px;
  padding: 8px 16px;
  background: rgba(244, 67, 54, 0.1);
  border: 2px solid var(--ml-danger);
  border-radius: var(--ml-radius);
  font-size: 13px;
  font-weight: 600;
  color: var(--ml-danger);
}

.batch-count {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
}

.count-number {
  font-size: 32px;
  font-weight: 800;
  color: var(--ml-primary-dark);
  line-height: 1;
}

.count-label {
  font-size: 14px;
  color: var(--ml-text-muted);
}

.batch-ids {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: var(--ml-bg-alt);
  border-radius: var(--ml-radius);
  max-height: 100px;
  overflow-y: auto;
  border: 2px solid var(--ml-border-color);
}

.batch-id-tag {
  display: inline-block;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--ml-primary-dark);
  background: var(--ml-bg);
  padding: 4px 8px;
  border-radius: 6px;
  border: 2px solid var(--ml-border-color);
}

.batch-more {
  font-size: 12px;
  color: var(--ml-text-muted);
  padding: 4px 8px;
}

/* ============ 过渡动画 ============ */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>
