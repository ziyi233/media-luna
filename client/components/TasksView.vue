<template>
  <div class="ml-view-container">
    <!-- 工具栏 -->
    <div class="tasks-toolbar">
      <div class="toolbar-left">
        <!-- 时间范围切换 -->
        <div class="btn-group">
          <button
            class="group-btn"
            :class="{ active: timeRange === 'all' }"
            @click="setTimeRange('all')"
          >
            全部
          </button>
          <button
            class="group-btn"
            :class="{ active: timeRange === 'today' }"
            @click="setTimeRange('today')"
          >
            今日
          </button>
        </div>
        <!-- 视图切换 -->
        <div class="btn-group">
          <button
            class="group-btn icon-only"
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
            title="列表视图"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <rect x="3" y="4" width="18" height="3" rx="1"/>
              <rect x="3" y="10.5" width="18" height="3" rx="1"/>
              <rect x="3" y="17" width="18" height="3" rx="1"/>
            </svg>
          </button>
          <button
            class="group-btn icon-only"
            :class="{ active: viewMode === 'gallery' }"
            @click="viewMode = 'gallery'"
            title="画廊视图"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <rect x="3" y="3" width="8" height="8" rx="1"/>
              <rect x="13" y="3" width="8" height="8" rx="1"/>
              <rect x="3" y="13" width="8" height="8" rx="1"/>
              <rect x="13" y="13" width="8" height="8" rx="1"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="toolbar-right">
        <button class="toolbar-btn" @click="fetchData">
          <k-icon name="refresh"></k-icon>
          <span>刷新</span>
        </button>
        <button class="toolbar-btn danger" @click="openCleanupDialog">
          <k-icon name="delete"></k-icon>
          <span>清理</span>
        </button>
      </div>
    </div>
    <div class="stats-grid" v-if="stats && viewMode === 'list'">
      <div class="stat-card">
        <div class="stat-icon total"><k-icon name="clipboard-list"></k-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">总任务数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon success"><k-icon name="check-circle"></k-icon></div>
        <div class="stat-content">
          <div class="stat-value success">{{ stats.byStatus.success }}</div>
          <div class="stat-label">成功</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon failed"><k-icon name="exclamation-triangle"></k-icon></div>
        <div class="stat-content">
          <div class="stat-value failed">{{ stats.byStatus.failed }}</div>
          <div class="stat-label">失败</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon processing"><k-icon name="clock"></k-icon></div>
        <div class="stat-content">
          <div class="stat-value pending">{{ stats.byStatus.pending + stats.byStatus.processing }}</div>
          <div class="stat-label">进行中</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon rate"><k-icon name="chart-pie"></k-icon></div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.successRate }}</div>
          <div class="stat-label">成功率</div>
        </div>
      </div>
    </div>

    <!-- 筛选栏 (固定) -->
    <div class="filter-bar">
      <div class="filter-group">
        <!-- 批量选择控制 -->
        <div class="batch-select-control" v-if="viewMode === 'list'">
          <el-checkbox
            v-model="isAllSelected"
            :indeterminate="isIndeterminate"
            @change="toggleSelectAll"
          />
        </div>
        <el-select
          v-model="filter.status"
          placeholder="所有状态"
          clearable
          @change="handleFilterChange"
          style="width: 120px"
        >
          <el-option label="等待中" value="pending"></el-option>
          <el-option label="处理中" value="processing"></el-option>
          <el-option label="成功" value="success"></el-option>
          <el-option label="失败" value="failed"></el-option>
        </el-select>
        <el-select
          v-model="filter.channelId"
          placeholder="所有渠道"
          clearable
          @change="handleFilterChange"
          style="width: 140px"
        >
          <el-option
            v-for="ch in channels"
            :key="ch.id"
            :label="ch.name || `渠道 ${ch.id}`"
            :value="ch.id"
          ></el-option>
        </el-select>
        <el-input
          v-model="filter.uid"
          placeholder="用户 UID"
          clearable
          @keyup.enter="handleFilterChange"
          @clear="handleFilterChange"
          style="width: 120px"
        >
          <template #suffix>
            <span class="filter-search-btn" @click="handleFilterChange" title="搜索">
              <k-icon name="search"></k-icon>
            </span>
          </template>
        </el-input>
      </div>
      <div class="filter-right">
        <!-- 批量操作按钮 -->
        <Transition name="fade">
          <div class="batch-actions" v-if="selectedIds.size > 0">
            <span class="selected-count">已选 {{ selectedIds.size }} 项</span>
            <button class="batch-btn danger" @click="openBatchDeleteDialog">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              <span>删除选中</span>
            </button>
            <button class="batch-btn" @click="clearSelection">
              <span>取消选择</span>
            </button>
          </div>
        </Transition>
        <div class="pagination-info" v-if="total > 0 && selectedIds.size === 0">
          共 {{ total }} 条记录
        </div>
      </div>
    </div>

    <!-- 可滚动的内容区域 -->
    <div class="ml-view-content" :class="{ 'no-scroll': viewMode === 'list' }">
      <!-- 列表视图 -->
      <template v-if="viewMode === 'list'">
        <el-table :data="tasks" style="width: 100%" height="100%" class="task-table" @row-click="handleRowClick">
          <el-table-column width="50" align="center">
            <template #header>
              <el-checkbox
                v-model="isAllSelected"
                :indeterminate="isIndeterminate"
                @change="toggleSelectAll"
              />
            </template>
            <template #default="{ row }">
              <el-checkbox
                :model-value="selectedIds.has(row.id)"
                @change="(val: boolean) => toggleSelect(row.id, val)"
                @click.stop
              />
            </template>
          </el-table-column>
          <el-table-column prop="id" label="ID" width="80" align="center">
            <template #default="{ row }">
              <span class="mono-text">#{{ row.id }}</span>
            </template>
          </el-table-column>

          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <StatusBadge :status="row.status" />
            </template>
          </el-table-column>

          <el-table-column prop="channelId" label="渠道" width="100" align="center" />

          <el-table-column label="提示词" min-width="300">
            <template #default="{ row }">
              <div class="prompt-cell" :title="getFinalPrompt(row)">{{ getFinalPrompt(row) }}</div>
            </template>
          </el-table-column>

          <el-table-column label="输出" width="140" align="center">
            <template #default="{ row }">
              <div v-if="row.responseSnapshot && row.responseSnapshot.length" class="output-thumbnails">
                <template v-for="(asset, idx) in row.responseSnapshot.slice(0, 3)" :key="idx">
                  <img
                    v-if="asset.kind === 'image' && asset.url"
                    :src="asset.url"
                    class="output-thumb"
                    @error="handleImageError"
                  />
                  <div v-else-if="asset.kind === 'video'" class="output-thumb video-thumb">
                    <k-icon name="play"></k-icon>
                    <span v-if="asset.meta?.duration" class="media-duration">{{ formatMediaDuration(asset.meta.duration) }}</span>
                  </div>
                  <div v-else-if="asset.kind === 'audio'" class="output-thumb audio-thumb">
                    <k-icon name="volume-up"></k-icon>
                    <span v-if="asset.meta?.duration" class="media-duration">{{ formatMediaDuration(asset.meta.duration) }}</span>
                  </div>
                  <div v-else-if="asset.kind === 'text'" class="output-thumb text-thumb">
                    <k-icon name="file-text"></k-icon>
                  </div>
                  <div v-else-if="asset.kind === 'file'" class="output-thumb file-thumb">
                    <k-icon name="file"></k-icon>
                  </div>
                </template>
                <span v-if="row.responseSnapshot.length > 3" class="output-more">
                  +{{ row.responseSnapshot.length - 3 }}
                </span>
              </div>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>

          <el-table-column label="耗时" width="100" align="right">
            <template #default="{ row }">
              <span v-if="row.duration">{{ formatDuration(row.duration) }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>

          <el-table-column label="时间" width="180" align="center">
            <template #default="{ row }">
              <span class="time-text">{{ formatDate(row.startTime) }}</span>
            </template>
          </el-table-column>

          <el-table-column width="60" align="center" fixed="right">
            <template #default="{ row }">
              <span
                class="delete-btn"
                title="删除"
                @click.stop="confirmDeleteTask(row)"
              >
                <k-icon name="delete"></k-icon>
              </span>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 画廊视图 (瀑布流) -->
      <template v-else-if="viewMode === 'gallery'">
        <div v-if="galleryItems.length === 0" class="empty-gallery">
          <k-icon name="image" class="empty-icon"></k-icon>
          <p>暂无成功生成的图片</p>
        </div>
        <div v-else class="ml-masonry">
          <div
            v-for="item in galleryItems"
            :key="item.id + '-' + item.assetIndex"
            class="ml-masonry-item"
          >
            <div class="gallery-item" @click="openGalleryDetail(item)">
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
                  <k-icon name="zoom-in" class="zoom-icon"></k-icon>
                </div>
              </div>
              <!-- 画廊模式下隐藏数据展示，纯图片浏览 -->
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 分页 (固定在底部) -->
    <div class="pagination-bar">
      <div class="page-size-select">
        <span class="page-size-label">每页</span>
        <el-select v-model="pageSize" size="small" @change="handlePageSizeChange" style="width: 70px">
          <el-option :value="20" label="20" />
          <el-option :value="50" label="50" />
          <el-option :value="100" label="100" />
        </el-select>
        <span class="page-size-label">条</span>
      </div>
      <div class="page-nav">
        <button class="page-btn" :disabled="page <= 1" @click="goToPage(page - 1)">
          <k-icon name="chevron-left"></k-icon>
        </button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="page >= totalPages" @click="goToPage(page + 1)">
          <k-icon name="chevron-right"></k-icon>
        </button>
      </div>
      <div class="page-total">共 {{ total }} 条</div>
    </div>

    <!-- 任务详情对话框 -->
    <el-dialog
      v-model="detailVisible"
      title="任务详情"
      width="800px"
    >
      <div v-if="currentTask" class="task-detail">
        <div class="detail-section">
          <h3>基本信息</h3>
          <div class="detail-grid">
            <div class="detail-item"><span class="label">ID:</span> {{ currentTask.id }}</div>
            <div class="detail-item"><span class="label">状态:</span> <StatusBadge :status="currentTask.status" /></div>
            <div class="detail-item"><span class="label">渠道 ID:</span> {{ currentTask.channelId }}</div>
            <div class="detail-item"><span class="label">用户 UID:</span> {{ currentTask.uid ?? 'N/A' }}</div>
            <div class="detail-item"><span class="label">创建时间:</span> {{ formatDate(currentTask.startTime) }}</div>
            <div class="detail-item"><span class="label">耗时:</span> {{ formatDuration(currentTask.duration || 0) }}</div>
          </div>
        </div>

        <div class="detail-section">
          <h3>Prompt</h3>
          <div class="code-block">{{ getFinalPrompt(currentTask) }}</div>
        </div>

        <div class="detail-section" v-if="currentTask.responseSnapshot && currentTask.responseSnapshot.length > 0">
          <h3>生成结果 ({{ currentTask.responseSnapshot.length }} 个资产)</h3>
          <div class="output-gallery">
            <div
              v-for="(asset, idx) in currentTask.responseSnapshot"
              :key="idx"
              class="output-item"
            >
              <template v-if="asset.kind === 'image' && asset.url">
                <img :src="asset.url" class="output-image" />
              </template>
              <template v-else-if="asset.kind === 'video' && asset.url">
                <video :src="asset.url" class="output-image" controls />
              </template>
              <template v-else-if="asset.kind === 'audio' && asset.url">
                <audio :src="asset.url" controls style="width: 100%;" />
              </template>
              <template v-else-if="asset.kind === 'text' && asset.content">
                <div class="text-asset">{{ asset.content }}</div>
              </template>
              <template v-else-if="asset.url">
                <a :href="asset.url" target="_blank" class="file-link">
                  <k-icon name="file"></k-icon>
                  {{ asset.meta?.filename || asset.url }}
                </a>
              </template>
            </div>
          </div>
        </div>

        <div class="detail-section" v-if="currentTask.middlewareLogs?.request?.error">
          <h3>错误信息</h3>
          <div class="code-block error">{{ currentTask.middlewareLogs.request.error }}</div>
        </div>
      </div>
    </el-dialog>

    <!-- 图片预览弹窗 -->
    <ImageLightbox
      v-model:visible="lightboxVisible"
      :task-id="lightboxTaskId"
      :initial-index="lightboxIndex"
    />

    <!-- 清理对话框 -->
    <el-dialog
      v-model="cleanupVisible"
      title="清理旧任务"
      width="400px"
    >
      <div class="cleanup-form">
        <p>清理多少天前的任务？</p>
        <el-input-number v-model="cleanupDays" :min="1" :max="365"></el-input-number>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <k-button @click="cleanupVisible = false">取消</k-button>
          <k-button type="error" @click="confirmCleanup">确认清理</k-button>
        </span>
      </template>
    </el-dialog>

    <!-- 删除确认对话框 -->
    <el-dialog
      v-model="deleteConfirmVisible"
      title="删除确认"
      width="420px"
    >
      <div class="delete-confirm-content">
        <div class="delete-icon-wrapper">
          <svg viewBox="0 0 24 24" fill="currentColor" class="delete-icon">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </div>
        <div class="delete-info">
          <div class="delete-title">确定删除此任务？</div>
          <div class="delete-task-id">#{{ taskToDelete?.id }}</div>
          <div class="delete-prompt" v-if="taskToDelete">{{ getDeletePromptPreview(taskToDelete) }}</div>
        </div>
        <div class="delete-warning">
          <svg viewBox="0 0 24 24" fill="currentColor" class="warning-icon">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <span>此操作不可恢复</span>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <k-button @click="deleteConfirmVisible = false">取消</k-button>
          <k-button type="error" @click="doDeleteTask">确认删除</k-button>
        </span>
      </template>
    </el-dialog>

    <!-- 批量删除确认对话框 -->
    <el-dialog
      v-model="batchDeleteVisible"
      title="批量删除确认"
      width="460px"
    >
      <div class="delete-confirm-content">
        <div class="delete-icon-wrapper batch">
          <svg viewBox="0 0 24 24" fill="currentColor" class="delete-icon">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </div>
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
          <svg viewBox="0 0 24 24" fill="currentColor" class="warning-icon">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <span>此操作不可恢复，请谨慎操作</span>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <k-button @click="batchDeleteVisible = false">取消</k-button>
          <k-button type="error" @click="doBatchDelete">
            确认删除 {{ selectedIds.size }} 条
          </k-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { message } from '@koishijs/client'
import { TaskData, ChannelConfig } from '../types'
import { taskApi, channelApi } from '../api'
import StatusBadge from './StatusBadge.vue'
import ImageLightbox from './ImageLightbox.vue'
import AudioPlayer from './AudioPlayer.vue'

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
  channelId: undefined as number | undefined
})

// 渠道列表（用于下拉筛选）
const channels = ref<ChannelConfig[]>([])

// 详情
const detailVisible = ref(false)
const currentTask = ref<TaskData | null>(null)

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
}

// 筛选变化处理
const handleFilterChange = () => {
  page.value = 1  // 筛选变化时重置到第一页
  fetchData()
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
    message.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

const handlePageSizeChange = () => {
  // 改变每页条数时，重置到第一页
  page.value = 1
  fetchData()
}

const goToPage = (newPage: number) => {
  if (newPage >= 1 && newPage <= totalPages.value) {
    page.value = newPage
    fetchData()
  }
}

const openDetailDialog = (task: TaskData) => {
  currentTask.value = task
  detailVisible.value = true
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
    message.success(`成功清理 ${res.deleted} 条任务`)
    cleanupVisible.value = false
    fetchData()
  } catch (e) {
    message.error('清理失败')
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
    message.success('删除成功')
    deleteConfirmVisible.value = false
    taskToDelete.value = null
    fetchData()
  } catch (e) {
    message.error('删除失败')
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
    message.success(`成功删除 ${successCount} 条任务`)
  } else {
    message.warning(`删除完成：${successCount} 成功，${failCount} 失败`)
  }

  fetchData()
}

// 行点击处理 - 打开 ImageLightbox 查看详情
const handleRowClick = (row: TaskData) => {
  // 如果有图片/视频输出，打开 Lightbox
  if (row.responseSnapshot && row.responseSnapshot.length > 0) {
    lightboxTaskId.value = row.id
    lightboxIndex.value = 0
    lightboxVisible.value = true
  } else {
    // 没有输出的任务，打开详情弹窗
    openDetailDialog(row)
  }
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString()
}

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/** 格式化媒体时长（秒 -> mm:ss） */
const formatMediaDuration = (seconds: number) => {
  if (!seconds || seconds <= 0) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `0:${secs.toString().padStart(2, '0')}`
}

const handleImageError = (e: Event) => {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
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

<style scoped>
@import '../styles/shared.css';

/* ========== 列表视图滚动控制 ========== */
/* 列表视图时，禁用外层滚动，让 el-table 自己处理滚动（固定表头） */
.ml-view-content.no-scroll {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ========== 任务视图特有样式 ========== */

/* 工具栏 */
.tasks-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* 按钮组 */
.btn-group {
  display: flex;
  background-color: var(--k-color-bg-2);
  border: 1px solid var(--k-color-border);
  border-radius: 6px;
  padding: 2px;
}

.group-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px 12px;
  border: none;
  background: transparent;
  color: var(--k-color-text-description);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.group-btn.icon-only {
  padding: 5px 8px;
}

.group-btn:hover {
  color: var(--k-color-text);
}

.group-btn.active {
  color: var(--k-color-active);
  background-color: var(--k-card-bg);
  box-shadow: var(--k-shadow-1, 0 1px 2px var(--k-color-shadow, rgba(0, 0, 0, 0.08)));
}

/* 工具栏按钮 */
.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--k-color-border);
  background: var(--k-card-bg);
  color: var(--k-color-text-description);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
  font-size: 13px;
}

.toolbar-btn:hover {
  color: var(--k-color-text);
  border-color: var(--k-color-active);
}

.toolbar-btn.danger:hover {
  color: var(--k-color-error);
  border-color: var(--k-color-error);
}

/* Stats Grid */
.stats-grid {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: var(--k-card-bg);
  border: 1px solid transparent;
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  position: relative;
  overflow: hidden;
  box-shadow: var(--k-shadow-1, 0 2px 8px var(--k-color-shadow, rgba(0, 0, 0, 0.04)));
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--k-shadow-2, 0 8px 24px var(--k-color-shadow, rgba(0, 0, 0, 0.08)));
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
  background-color: var(--k-color-bg-2);
  color: var(--k-color-text-description);
  transition: all 0.3s ease;
}

.stat-card:hover .stat-icon {
  transform: scale(1.1);
}

.stat-icon.total { background-color: var(--k-color-active-bg, var(--k-color-bg-2)); color: var(--k-color-active); }
.stat-icon.success { background-color: var(--k-color-success-light, rgba(103, 194, 58, 0.1)); color: var(--k-color-success); }
.stat-icon.failed { background-color: var(--k-color-error-light, rgba(245, 108, 108, 0.1)); color: var(--k-color-error); }
.stat-icon.processing { background-color: var(--k-color-warning-light, rgba(230, 162, 60, 0.1)); color: var(--k-color-warning); }
.stat-icon.rate { background-color: var(--k-color-active-bg, var(--k-color-bg-2)); color: var(--k-color-active); }

.stat-content {
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-end;
  margin-left: auto;
  text-align: right;
}

.stat-label {
  font-size: 0.85rem;
  color: var(--k-color-text-description);
  margin-top: 0.5rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--k-color-text);
  line-height: 1;
  letter-spacing: -0.03em;
}

.stat-value.success { color: var(--k-color-success); }
.stat-value.failed { color: var(--k-color-error); }
.stat-value.pending { color: var(--k-color-warning); }

/* Filter Bar */
.filter-bar {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  background-color: var(--k-card-bg);
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid var(--k-color-border);
}

.filter-group {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.pagination-info {
  color: var(--k-color-text-description);
  font-size: 0.9rem;
}

/* 筛选搜索按钮 */
.filter-search-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--k-color-text-description);
  transition: color 0.15s ease;
  padding: 2px;
}

.filter-search-btn:hover {
  color: var(--k-color-active);
}

/* Task Table */
.task-table {
  border: 1px solid var(--k-color-border);
  border-radius: 12px;
  cursor: pointer;
  overflow: hidden;
  --el-table-header-bg-color: var(--k-color-bg-1);
  --el-table-row-hover-bg-color: var(--k-color-bg-2);
  --el-table-border-color: var(--k-color-border);
}

.task-table :deep(.el-table__row) {
  transition: background-color 0.15s ease;
}

.task-table :deep(th.el-table__cell) {
  font-weight: 600;
  color: var(--k-color-text-description);
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.mono-text {
  font-family: monospace;
  color: var(--k-color-text-description);
}

/* 删除按钮 */
.delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--k-color-text-description);
  cursor: pointer;
  transition: all 0.15s ease;
}

.delete-btn:hover {
  color: var(--k-color-error);
  background-color: var(--k-color-error-light, rgba(245, 108, 108, 0.1));
}

.prompt-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--k-color-text);
}

.time-text {
  font-size: 0.85rem;
  color: var(--k-color-text-description);
  white-space: nowrap;
}

.text-muted {
  color: var(--k-color-text-description);
}

/* 输出缩略图 */
.output-thumbnails {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.output-thumb {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid var(--k-color-border);
  background: var(--k-color-bg-2);
}

.video-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--k-color-text-description);
  font-size: 14px;
  position: relative;
}

.audio-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.15), rgba(64, 158, 255, 0.15));
  color: var(--k-color-success, #67c23a);
  font-size: 14px;
  position: relative;
}

.media-duration {
  font-size: 8px;
  font-weight: 500;
  margin-top: 2px;
  opacity: 0.9;
}

.text-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(144, 147, 153, 0.1);
  color: var(--k-color-text-description);
  font-size: 14px;
}

.file-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(64, 158, 255, 0.1);
  color: var(--k-color-active, #409eff);
  font-size: 14px;
}

.output-more {
  font-size: 0.75rem;
  color: var(--k-color-text-description);
  margin-left: 2px;
}

/* Gallery Item */
.gallery-item {
  background: var(--k-card-bg);
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
}

.gallery-item:hover {
  border-color: var(--k-color-active);
  box-shadow: var(--k-shadow-2, 0 4px 12px var(--k-color-shadow, rgba(0, 0, 0, 0.1)));
}

.gallery-image-wrapper {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--k-color-bg-2);
}

.gallery-image,
.gallery-video {
  width: 100%;
  display: block;
  transition: transform 0.3s;
}

.gallery-item:hover .gallery-image,
.gallery-item:hover .gallery-video {
  transform: scale(1.03);
}

/* Gallery Audio Card */
.gallery-audio {
  width: 100%;
}

.gallery-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, var(--k-color-overlay, rgba(0, 0, 0, 0.8)) 0%, transparent 50%);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 1.5rem;
  opacity: 0;
  transition: opacity 0.3s;
}

.gallery-item:hover .gallery-overlay {
  opacity: 1;
}

.zoom-icon {
  font-size: 2rem;
  color: var(--k-color-text-inverse, #fff);
  margin-bottom: auto;
  align-self: center;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.3s;
}

.gallery-item:hover .zoom-icon {
  opacity: 1;
  transform: scale(1);
}

.empty-gallery {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--k-color-text-description);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

/* Pagination Bar */
.pagination-bar {
  flex-shrink: 0;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  border-top: 1px solid var(--k-color-border);
  background-color: var(--k-card-bg);
  border-radius: 0 0 8px 8px;
}

.page-size-select {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-size-label {
  font-size: 0.85rem;
  color: var(--k-color-text-description);
}

.page-nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--k-color-border);
  border-radius: 6px;
  background-color: var(--k-color-bg-1);
  color: var(--k-color-text);
  cursor: pointer;
  transition: all 0.2s ease;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--k-color-active);
  color: var(--k-color-active);
  background-color: var(--k-color-bg-2);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 0.9rem;
  color: var(--k-color-text);
  min-width: 60px;
  text-align: center;
}

.page-total {
  font-size: 0.85rem;
  color: var(--k-color-text-description);
}

/* Detail Modal Styles */
.task-detail {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.detail-section h3 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--k-color-border);
  color: var(--k-color-text);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  background-color: var(--k-color-bg-2);
  padding: 1rem;
  border-radius: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.label {
  font-weight: 600;
  color: var(--k-color-text-description);
  flex-shrink: 0;
}

.code-block {
  background-color: var(--k-color-bg-2);
  padding: 1rem;
  border-radius: 6px;
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--k-color-border);
}

.code-block.error {
  background-color: var(--k-color-error-bg);
  color: var(--k-color-error);
  border-color: var(--k-color-error);
}

.output-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
}

.output-item {
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--k-color-bg-2);
  transition: transform 0.2s;
}

.output-item:hover {
  transform: scale(1.02);
  box-shadow: var(--k-shadow-2, 0 4px 12px var(--k-color-shadow, rgba(0, 0, 0, 0.1)));
}

.output-image {
  width: 100%;
  height: 150px;
  object-fit: cover;
  display: block;
}

.text-asset {
  padding: 0.75rem;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 150px;
  overflow-y: auto;
}

.file-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  color: var(--k-color-active);
  text-decoration: none;
  font-size: 0.85rem;
  word-break: break-all;
}

/* Gallery Detail Dialog */
.gallery-detail-dialog :deep(.el-dialog__header) {
  display: none;
}

.gallery-detail-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.gallery-detail {
  display: flex;
  height: 80vh;
  background: var(--k-card-bg);
  border-radius: 12px;
  overflow: hidden;
}

.gallery-detail-media {
  flex: 1;
  background: var(--k-color-bg-1, #000);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.gallery-detail-media img,
.gallery-detail-media video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.gallery-detail-sidebar {
  width: 320px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--k-color-border);
  background: var(--k-card-bg);
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid var(--k-color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--k-color-text);
}

.sidebar-content {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.sidebar-content:hover {
  scrollbar-color: var(--k-color-border) transparent;
}

.sidebar-content::-webkit-scrollbar {
  width: 6px;
}

.sidebar-content::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.sidebar-content:hover::-webkit-scrollbar-thumb {
  background-color: var(--k-color-border);
}

.info-block {
  margin-bottom: 1.5rem;
}

.info-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--k-color-text-description);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.info-value {
  color: var(--k-color-text);
  font-size: 0.9rem;
}

.info-value.prompt {
  background: var(--k-color-bg-2);
  padding: 0.75rem;
  border-radius: 6px;
  font-family: monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
}

.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid var(--k-color-border);
  display: flex;
  gap: 0.5rem;
}

.download-btn {
  text-decoration: none;
}

/* Cleanup Form */
.cleanup-form {
  text-align: center;
}

.cleanup-form p {
  margin-bottom: 1rem;
  color: var(--k-color-text);
}

.dialog-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

/* 批量选择样式 */
.batch-select-control {
  display: flex;
  align-items: center;
  padding-right: 0.5rem;
  border-right: 1px solid var(--k-color-border);
  margin-right: 0.5rem;
}

.filter-right {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 32px;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 0.75rem;
  background: transparent;
  border: none;
  border-radius: 0;
}

.selected-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--k-color-active);
}

.batch-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid var(--k-color-border);
  background: var(--k-card-bg);
  color: var(--k-color-text-description);
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  transition: all 0.15s ease;
}

.batch-btn:hover {
  color: var(--k-color-text);
  border-color: var(--k-color-active);
}

.batch-btn.danger {
  background: var(--k-card-bg);
  border-color: var(--k-color-error);
  color: var(--k-color-error);
}

.batch-btn.danger:hover {
  background: var(--k-color-bg-2);
  border-color: var(--k-color-error);
  color: var(--k-color-error);
  filter: brightness(0.95);
}

/* 删除确认弹窗美化 */
.delete-confirm-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0.5rem 0;
}

.delete-icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--k-color-bg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
}

.delete-icon {
  width: 32px;
  height: 32px;
  color: var(--k-color-error);
}

.delete-info {
  width: 100%;
}

.delete-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--k-color-text);
  margin-bottom: 0.75rem;
}

.delete-task-id {
  display: inline-block;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--k-color-active);
  background: var(--k-color-bg-2);
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  margin-bottom: 0.75rem;
}

.delete-prompt {
  font-size: 0.85rem;
  color: var(--k-color-text-description);
  background: var(--k-color-bg-2);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  line-height: 1.5;
  max-width: 100%;
  word-break: break-word;
}

.delete-warning {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1.25rem;
  padding: 0.5rem 1rem;
  background: var(--k-color-bg-2);
  border: 1px solid var(--k-color-border);
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--k-color-text-description);
}

.warning-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* 批量删除弹窗增强样式 */
.delete-icon-wrapper.batch {
  width: 72px;
  height: 72px;
}

.delete-icon-wrapper.batch .delete-icon {
  width: 36px;
  height: 36px;
}

.batch-count {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.count-number {
  font-size: 2rem;
  font-weight: 700;
  color: var(--k-color-active);
  line-height: 1;
}

.count-label {
  font-size: 0.9rem;
  color: var(--k-color-text-description);
}

.batch-ids {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--k-color-bg-2);
  border-radius: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.batch-id-tag {
  display: inline-block;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.8rem;
  color: var(--k-color-active);
  background: var(--k-card-bg);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--k-color-border);
}

.batch-more {
  font-size: 0.8rem;
  color: var(--k-color-text-description);
  padding: 0.2rem 0.5rem;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>
