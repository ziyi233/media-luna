<template>
  <div class="ml-view-container">
    <div class="ml-view-header">
      <div class="ml-header-left">
        <k-button solid type="primary" @click="openCreateDialog">
          <template #icon><k-icon name="add"></k-icon></template>
          新建渠道
        </k-button>
        <ConnectorFilter
          v-model="selectedConnectors"
          :connectors="connectors"
          :get-icon-url="getConnectorIconUrlByDef"
        />
        <TagFilter
          v-model="selectedTags"
          :all-tags="allTags"
          :preset-tags="presetTags"
          :show-input="false"
        />
        <SortSelect v-model="sortBy" />
      </div>
      <div class="ml-header-right">
        <div class="search-wrapper">
          <el-input
            v-model="searchQuery"
            placeholder="搜索渠道..."
            size="small"
            clearable
            class="search-input"
          >
            <template #prefix><k-icon name="search"></k-icon></template>
          </el-input>
        </div>
        <ViewModeSwitch v-model="viewMode" />
      </div>
    </div>

    <div class="ml-view-content">
      <LoadingState v-if="loading" />

      <!-- 卡片视图 -->
      <div v-else-if="viewMode === 'card'" class="ml-grid">
        <div v-for="channel in filteredChannels" :key="channel.id">
          <div
            class="ml-card ml-card--clickable"
            :class="{ 'ml-card--disabled': !channel.enabled }"
            @click="openEditDialog(channel)"
          >
            <div class="card-header">
              <div class="header-main">
                <div class="channel-title">
                  <div class="connector-logo">
                    <img
                      v-if="getConnectorIconUrl(channel.connectorId)"
                      :src="getConnectorIconUrl(channel.connectorId)"
                      :alt="getConnectorName(channel.connectorId)"
                    />
                    <k-icon v-else name="link"></k-icon>
                  </div>
                  <div class="channel-info">
                    <div class="channel-name">{{ channel.name }}</div>
                    <div class="connector-name">{{ getConnectorName(channel.connectorId) }}</div>
                  </div>
                </div>
                <el-switch v-model="channel.enabled" size="small" @change="toggleEnable(channel)" @click.stop />
              </div>
              <div class="header-meta">
                <span
                  class="speaker-id-badge"
                  title="点击复制 Speaker ID"
                  @click.stop="copySpeakerId(channel.id)"
                >
                  <k-icon name="voice"></k-icon>
                  {{ getSpeakerId(channel.id) }}
                </span>
                <!-- 中间件字段（如费用）显示在标题旁 -->
                <template v-for="field in middlewareCardFields" :key="`mw-${field.key}`">
                  <span class="cost-badge" v-if="field.key === 'cost' && getCardFieldValue(channel, field)">
                    {{ formatFieldValue(getCardFieldValue(channel, field), field.format, getCurrencySuffix(channel, field)) }}
                  </span>
                </template>
              </div>
            </div>

            <div class="card-body">
              <!-- 配置字段列表 -->
              <div class="field-list" v-if="getCardFields(channel).length">
                <div v-for="field in getCardFields(channel)" :key="field.key" class="field-item">
                  <span class="field-label">{{ field.label }}</span>
                  <span class="field-value">{{ formatCardFieldValue(channel, field) }}</span>
                </div>
              </div>

              <!-- 标签 -->
              <div class="tags-list" v-if="channel.tags && channel.tags.length">
                <span v-for="tag in channel.tags" :key="tag" class="tag-pill">{{ tag }}</span>
              </div>
            </div>

            <div class="card-footer" @click.stop>
              <k-button size="mini" class="ml-btn-outline-primary" @click="copyChannel(channel)">
                <template #icon><k-icon name="copy"></k-icon></template>
                复制
              </k-button>
              <div class="spacer"></div>
              <k-button size="mini" class="ml-btn-outline-danger" @click="confirmDelete(channel)">
                 <template #icon><k-icon name="delete"></k-icon></template>
                 删除
              </k-button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="filteredChannels.length === 0 && !loading" class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-text" v-if="channels.length === 0">还没有创建任何渠道</div>
          <div class="empty-text" v-else>没有找到匹配的渠道</div>
          <k-button v-if="channels.length === 0" type="primary" @click="openCreateDialog">
            创建第一个渠道
          </k-button>
          <k-button v-else @click="clearFilters">
            清除筛选条件
          </k-button>
        </div>
      </div>

      <!-- 列表视图 -->
      <div v-else class="ml-table-container">
        <table class="ml-table">
          <thead>
            <tr>
              <th class="col-name">名称</th>
              <th class="col-connector">连接器</th>
              <th class="col-tags">标签</th>
              <th class="col-cost">费用</th>
              <th class="col-status">状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="channel in filteredChannels"
              :key="channel.id"
              @click="openEditDialog(channel)"
            >
              <td class="col-name">
                <span class="name-text">{{ channel.name }}</span>
              </td>
              <td class="col-connector">
                <span class="connector-badge">
                  <img
                    v-if="getConnectorIconUrl(channel.connectorId)"
                    :src="getConnectorIconUrl(channel.connectorId)"
                    class="connector-icon"
                    :alt="getConnectorName(channel.connectorId)"
                  />
                  {{ getConnectorName(channel.connectorId) }}
                </span>
              </td>
              <td class="col-tags">
                <div class="tags-wrapper">
                  <span v-for="tag in (channel.tags || []).slice(0, 2)" :key="tag" class="mini-tag">{{ tag }}</span>
                  <span v-if="channel.tags && channel.tags.length > 2" class="mini-tag more">+{{ channel.tags.length - 2 }}</span>
                </div>
              </td>
              <td class="col-cost">
                <template v-for="field in middlewareCardFields" :key="`mw-${field.key}`">
                  <span v-if="field.key === 'cost'" class="cost-value">
                    {{ formatFieldValue(getCardFieldValue(channel, field), field.format, getCurrencySuffix(channel, field)) }}
                  </span>
                </template>
              </td>
              <td class="col-status" @click.stop>
                <el-switch v-model="channel.enabled" size="small" @change="toggleEnable(channel)" />
              </td>
              <td class="col-actions" @click.stop>
                <div class="action-btns">
                  <k-button size="mini" class="ml-btn-outline-primary" @click="copyChannel(channel)">
                    <template #icon><k-icon name="copy"></k-icon></template>
                    复制
                  </k-button>
                  <k-button size="mini" class="ml-btn-outline-danger" @click="confirmDelete(channel)">
                    <template #icon><k-icon name="delete"></k-icon></template>
                    删除
                  </k-button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 编辑/创建对话框 -->
    <ChannelConfigDialog
      v-model="dialogVisible"
      :channel="editingChannel"
      @saved="handleDialogSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from '@koishijs/client'
import { ChannelConfig, ConfigField, ConnectorDefinition, CardField } from '../types'
import { channelApi, connectorApi, middlewareApi } from '../api'
import TagFilter from './TagFilter.vue'
import ConnectorFilter from './ConnectorFilter.vue'
import SortSelect, { type SortValue } from './SortSelect.vue'
import ViewModeSwitch, { type ViewMode } from './ViewModeSwitch.vue'
import ChannelConfigDialog from './ChannelConfigDialog.vue'
import LoadingState from './LoadingState.vue'

// 预置标签
const presetTags = ['text2img', 'img2img', 'NSFW']

// 状态
const loading = ref(false)
const viewMode = ref<ViewMode>('card')
const channels = ref<ChannelConfig[]>([])
const connectors = ref<ConnectorDefinition[]>([])
const middlewareCardFields = ref<CardField[]>([])
const middlewareGlobalConfigs = ref<Record<string, Record<string, any>>>({})
const dialogVisible = ref(false)
const editingChannel = ref<ChannelConfig | null>(null)
const selectedTags = ref<string[]>([])
const selectedConnectors = ref<string[]>([])
const sortBy = ref<SortValue>('default')
const searchQuery = ref('')

// 从所有渠道中提取标签
const allTags = computed(() => {
  const tagSet = new Set<string>()
  channels.value.forEach(c => {
    (c.tags || []).forEach(t => tagSet.add(t))
  })
  return Array.from(tagSet).sort()
})

// 计算属性 - 筛选、搜索、排序
const filteredChannels = computed(() => {
  let result = channels.value

  // 1. 连接器筛选 (OR 逻辑)
  if (selectedConnectors.value.length > 0) {
    result = result.filter(c => selectedConnectors.value.includes(c.connectorId))
  }

  // 2. 标签筛选 (AND 逻辑)
  if (selectedTags.value.length > 0) {
    result = result.filter(c =>
      selectedTags.value.every(tag => (c.tags || []).includes(tag))
    )
  }

  // 3. 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    result = result.filter(c => {
      // 搜索名称
      if (c.name.toLowerCase().includes(query)) return true
      // 搜索连接器名称
      const connectorName = getConnectorName(c.connectorId).toLowerCase()
      if (connectorName.includes(query)) return true
      // 搜索标签
      if ((c.tags || []).some(t => t.toLowerCase().includes(query))) return true
      return false
    })
  }

  // 4. 排序
  if (sortBy.value !== 'default') {
    result = [...result].sort((a, b) => {
      switch (sortBy.value) {
        case 'name-asc':
          return a.name.localeCompare(b.name, 'zh-CN')
        case 'name-desc':
          return b.name.localeCompare(a.name, 'zh-CN')
        case 'enabled-first':
          return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)
        case 'disabled-first':
          return (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0)
        default:
          return 0
      }
    })
  }

  return result
})

// 方法
const getConnectorName = (id: string) => {
  const c = connectors.value.find(x => x.id === id)
  return c ? c.name : id
}

/** 获取连接器图标 URL (通过 connectorId) */
const getConnectorIconUrl = (connectorId: string): string => {
  const connector = connectors.value.find(c => c.id === connectorId)
  if (!connector?.icon) return ''

  // chatluna 和 edge-tts 使用 PNG 格式
  if (connector.icon === 'chatluna' || connector.icon === 'edge-tts') {
    return new URL(`../assets/connector-icons/${connector.icon}.png`, import.meta.url).href
  }
  // 其他图标使用 SVG 格式
  return new URL(`../assets/connector-icons/${connector.icon}.svg`, import.meta.url).href
}

/** 获取连接器图标 URL (通过 ConnectorDefinition) */
const getConnectorIconUrlByDef = (connector: ConnectorDefinition): string => {
  if (!connector?.icon) return ''

  // chatluna 和 edge-tts 使用 PNG 格式
  if (connector.icon === 'chatluna' || connector.icon === 'edge-tts') {
    return new URL(`../assets/connector-icons/${connector.icon}.png`, import.meta.url).href
  }
  // 其他图标使用 SVG 格式
  return new URL(`../assets/connector-icons/${connector.icon}.svg`, import.meta.url).href
}

/** 获取渠道卡片需要展示的字段 */
const getCardFields = (channel: ChannelConfig) => {
  const connector = connectors.value.find(c => c.id === channel.connectorId)
  if (!connector?.cardFields?.length) return []

  return connector.cardFields.map(cf => {
    const fieldDef = connector.fields.find(f => f.key === cf.key)
    return {
      key: cf.key,
      label: cf.label || fieldDef?.label || cf.key,
      format: cf.format || 'text'
    }
  })
}

/** 获取卡片展示字段的值 */
const getCardFieldValue = (channel: ChannelConfig, field: CardField): any => {
  const groupId = field.configGroup

  switch (field.source) {
    case 'channel':
      if (groupId) {
        const overrideValue = channel.pluginOverrides?.[groupId]?.[field.key]
        if (overrideValue !== undefined) {
          return overrideValue
        }
      }
      return (channel as any)[field.key]

    case 'connectorConfig':
      return channel.connectorConfig?.[field.key]

    case 'pluginOverride':
      if (groupId) {
        return channel.pluginOverrides?.[groupId]?.[field.key]
      }
      return undefined

    default:
      return undefined
  }
}

/** 获取货币后缀 */
const getCurrencySuffix = (channel: ChannelConfig, field: CardField): string => {
  const groupId = field.configGroup
  if (!groupId) return field.suffix || ''

  const overrideLabel = channel.pluginOverrides?.[groupId]?.currencyLabel
  if (overrideLabel) {
    return ` ${overrideLabel}${field.suffix || ''}`
  }

  const globalLabel = middlewareGlobalConfigs.value[groupId]?.currencyLabel
  if (globalLabel) {
    return ` ${globalLabel}${field.suffix || ''}`
  }

  return ` 积分${field.suffix || ''}`
}

/** 格式化字段值用于展示 */
const formatFieldValue = (value: any, format?: string, suffix?: string): string => {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  let result: string
  switch (format) {
    case 'password-mask':
      result = '••••••'
      break
    case 'boolean':
      result = value ? '是' : '否'
      break
    case 'number':
      result = String(value)
      break
    case 'size':
      result = String(value)
      break
    case 'currency':
      result = value === 0 ? '免费' : String(value)
      break
    default:
      result = String(value)
  }

  return suffix ? `${result} ${suffix}` : result
}

/** 格式化卡片字段值（从连接器 options 查找友好名称） */
const formatCardFieldValue = (channel: ChannelConfig, field: { key: string, format?: string }): string => {
  const value = channel.connectorConfig?.[field.key]
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  // 尝试从连接器的 options 中查找友好名称
  const connector = connectors.value.find(c => c.id === channel.connectorId)
  if (connector) {
    const fieldDef = connector.fields.find(f => f.key === field.key)
    if (fieldDef?.options) {
      const option = fieldDef.options.find(o => o.value === value)
      if (option?.label) {
        return option.label
      }
    }
  }

  // 如果值太长，截断显示
  if (typeof value === 'string' && value.length > 25) {
    return value.substring(0, 22) + '...'
  }

  return formatFieldValue(value, field.format)
}

/** 清除所有筛选条件 */
const clearFilters = () => {
  selectedConnectors.value = []
  selectedTags.value = []
  searchQuery.value = ''
  sortBy.value = 'default'
}

/** Speaker ID 基数 */
const SPEAKER_ID_BASE = 1000000

/** 获取 Speaker ID */
const getSpeakerId = (channelId: number) => {
  return SPEAKER_ID_BASE + channelId
}

/** 复制 Speaker ID 到剪贴板 */
const copySpeakerId = async (channelId: number) => {
  const speakerId = getSpeakerId(channelId)
  const text = String(speakerId)

  try {
    // 尝试使用现代 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      // Fallback: 使用传统方法
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      textArea.style.top = '-9999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
    message.success(`已复制 Speaker ID: ${speakerId}`)
  } catch (e) {
    console.error('Failed to copy:', e)
    message.error('复制失败')
  }
}

const fetchData = async () => {
  loading.value = true
  try {
    const [channelsData, connectorsData, mwCardFieldsResponse] = await Promise.all([
      channelApi.list(),
      connectorApi.list(),
      middlewareApi.cardFields()
    ])
    channels.value = channelsData
    connectors.value = connectorsData
    middlewareCardFields.value = mwCardFieldsResponse.fields
    middlewareGlobalConfigs.value = mwCardFieldsResponse.globalConfigs
  } catch (e) {
    message.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

const openCreateDialog = () => {
  editingChannel.value = null
  dialogVisible.value = true
}

const openEditDialog = (channel: ChannelConfig) => {
  editingChannel.value = channel
  dialogVisible.value = true
}

const handleDialogSaved = () => {
  fetchData()
}

const confirmDelete = async (channel: ChannelConfig) => {
  if (!confirm(`确定要删除渠道 "${channel.name}" 吗？`)) return
  try {
    await channelApi.delete(channel.id)
    message.success('删除成功')
    fetchData()
  } catch (e) {
    message.error('删除失败')
  }
}

const toggleEnable = async (channel: ChannelConfig) => {
  try {
    await channelApi.toggle(channel.id, channel.enabled)
  } catch (e) {
    channel.enabled = !channel.enabled
    message.error('操作失败')
  }
}

const copyChannel = (channel: ChannelConfig) => {
  const copied = JSON.parse(JSON.stringify(channel))
  delete copied.id
  copied.name = `${channel.name} (副本)`
  editingChannel.value = copied
  dialogVisible.value = true
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
@import '../styles/shared.css';

/* ========== 搜索框样式 ========== */
.search-wrapper {
  flex-shrink: 0;
}

.search-input {
  width: 180px;
}

/* ========== 渠道卡片特有样式 ========== */

/* 卡片内部布局 */
.card-header {
  padding: 1rem 1.25rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* 渠道标题区域（Logo + 名称信息） */
.channel-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.connector-logo {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--k-color-bg-2);
  border-radius: 8px;
  overflow: hidden;
}

.connector-logo img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.connector-logo .k-icon {
  font-size: 1.5rem;
  color: var(--k-color-text-description);
}

.channel-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.channel-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--k-color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connector-name {
  font-size: 0.75rem;
  color: var(--k-color-text-description);
}

.speaker-id-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.12), rgba(64, 158, 255, 0.12));
  border: 1px solid rgba(103, 194, 58, 0.25);
  border-radius: 12px;
  font-size: 0.75rem;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  font-weight: 500;
  color: var(--k-color-success, #67c23a);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.speaker-id-badge:hover {
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.2), rgba(64, 158, 255, 0.2));
  border-color: rgba(103, 194, 58, 0.4);
  transform: scale(1.02);
  box-shadow: 0 2px 8px rgba(103, 194, 58, 0.15);
}

.speaker-id-badge:active {
  transform: scale(0.98);
}

.speaker-id-badge .k-icon {
  font-size: 0.7rem;
  opacity: 0.8;
  pointer-events: none;
}

.connector-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 2px 8px;
  background-color: var(--k-color-bg-2);
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--k-color-text-description);
}

.connector-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  border-radius: 3px;
}

.cost-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background-color: var(--k-color-success-light, rgba(103, 194, 58, 0.1));
  color: var(--k-color-success, #67c23a);
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.card-body {
  flex-grow: 1;
  padding: 0 1.25rem 1rem;
  min-height: 40px;
}

/* 字段列表样式 */
.field-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.field-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  padding: 0.25rem 0;
  border-bottom: 1px dashed var(--k-color-border);
}

.field-item:last-child {
  border-bottom: none;
}

.field-label {
  color: var(--k-color-text-description);
}

.field-value {
  font-weight: 500;
  color: var(--k-color-text);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-pill {
  font-size: 0.75rem;
  padding: 1px 6px;
  color: var(--k-color-text-description);
  border: 1px solid var(--k-color-border);
  border-radius: 12px;
  background-color: transparent;
}

.card-footer {
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--k-color-border);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: rgba(0, 0, 0, 0.02);
}

.spacer {
  flex-grow: 1;
}

/* ========== 列表视图特有样式 ========== */

/* 表格列宽定义 */
.col-name { width: 20%; }
.col-connector { width: 15%; }
.col-tags { width: auto; }
.col-cost { width: 12%; }
.col-status { width: 8%; }
.col-actions { width: 15%; }

.name-text {
  font-weight: 600;
  color: var(--k-color-text);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tags-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mini-tag {
  font-size: 0.7rem;
  padding: 1px 6px;
  color: var(--k-color-text-description);
  border: 1px solid var(--k-color-border);
  border-radius: 10px;
  background-color: transparent;
}

.mini-tag.more {
  background-color: var(--k-color-bg-2);
}

.cost-value {
  font-size: 0.85rem;
  color: var(--k-color-success, #67c23a);
  font-weight: 500;
}

.action-btns {
  display: flex;
  gap: 0.5rem;
}

/* ========== 禁用状态卡片样式 ========== */
.ml-card--disabled {
  opacity: 0.6;
  background-color: var(--k-color-bg-2);
}

.ml-card--disabled .connector-logo {
  filter: grayscale(0.6);
}

.ml-card--disabled .channel-name {
  color: var(--k-color-text-description);
}

.ml-card--disabled:hover {
  opacity: 0.8;
}

/* ========== 空状态样式 ========== */
.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  gap: 1rem;
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.6;
}

.empty-text {
  font-size: 1rem;
  color: var(--k-color-text-description);
}
</style>