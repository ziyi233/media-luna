<template>
  <div class="channels-view">
    <!-- 紧凑工具栏 -->
    <div class="compact-toolbar pop-card no-hover">
      <!-- 左侧：视图切换 + 搜索 + 筛选 -->
      <div class="toolbar-left">
        <div class="btn-group">
          <button
            class="group-btn"
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
            title="列表视图"
          >
            📋
          </button>
          <button
            class="group-btn"
            :class="{ active: viewMode === 'card' }"
            @click="viewMode = 'card'"
            title="卡片视图"
          >
            🎴
          </button>
        </div>
        <div class="filter-divider"></div>
        <!-- 搜索框 -->
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            class="pop-input small search-input"
            placeholder="搜索渠道..."
          />
          <button
            v-if="searchQuery"
            class="search-clear"
            @click="searchQuery = ''"
            title="清除搜索"
          >✕</button>
        </div>
        <div class="filter-divider"></div>
        <ConnectorFilter
          v-model="selectedConnectors"
          :connectors="connectors"
          :get-icon-url="getConnectorIconUrlByDef"
        />
        <TagDropdown
          v-model="selectedTags"
          :all-tags="allTags"
          :preset-tags="presetTags"
        />
        <SortSelect v-model="sortBy" />
        <span class="result-count">共{{ filteredChannels.length }}个渠道</span>
      </div>
      <!-- 右侧：操作按钮 -->
      <div class="toolbar-right">
        <button class="pop-btn small" @click="fetchData" title="刷新">🔄</button>
        <button class="pop-btn small primary" @click="openCreateDialog">
          ➕ 新建
        </button>
      </div>
    </div>

    <LoadingState v-if="loading" />

    <!-- 卡片视图 -->
    <div v-else-if="viewMode === 'card'" class="card-grid pop-scrollbar">
      <div
        v-for="channel in filteredChannels"
        :key="channel.id"
        class="channel-card pop-card"
        :class="{ 'disabled': !channel.enabled }"
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
                <span v-else>🔗</span>
              </div>
              <div class="channel-info">
                <div class="channel-name">{{ channel.name }}</div>
                <div class="connector-name">{{ getConnectorName(channel.connectorId) }}</div>
              </div>
            </div>
            <label class="toggle-switch" @click.stop>
              <input type="checkbox" v-model="channel.enabled" @change="toggleEnable(channel)" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="header-meta">
            <span
              class="speaker-id-badge"
              title="点击复制 Speaker ID"
              @click.stop="copySpeakerId(channel.id)"
            >
              🎤 {{ getSpeakerId(channel.id) }}
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
          <button class="pop-btn small" @click="copyChannel(channel)">
            📋 复制
          </button>
          <div class="spacer"></div>
          <button class="pop-btn small danger" @click="confirmDelete(channel)">
            🗑️ 删除
          </button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredChannels.length === 0 && !loading" class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text" v-if="channels.length === 0">还没有创建任何渠道</div>
        <div class="empty-text" v-else>没有找到匹配的渠道</div>
        <button v-if="channels.length === 0" class="pop-btn primary" @click="openCreateDialog">
          创建第一个渠道
        </button>
        <button v-else class="pop-btn" @click="clearFilters">
          清除筛选条件
        </button>
      </div>
    </div>

    <!-- 列表视图 -->
    <div v-else class="table-container pop-card pop-scrollbar">
        <table class="pop-table">
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
                <label class="toggle-switch small">
                  <input type="checkbox" v-model="channel.enabled" @change="toggleEnable(channel)" />
                  <span class="toggle-slider"></span>
                </label>
              </td>
              <td class="col-actions" @click.stop>
                <div class="action-btns">
                  <button class="pop-btn small" @click="copyChannel(channel)">
                    📋 复制
                  </button>
                  <button class="pop-btn small danger" @click="confirmDelete(channel)">
                    🗑️ 删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
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
import { ChannelConfig, ConfigField, ConnectorDefinition, CardField } from '../types'
import { channelApi, connectorApi, middlewareApi } from '../api'
import TagDropdown from './TagDropdown.vue'
import ConnectorFilter from './ConnectorFilter.vue'
import SortSelect, { type SortValue } from './SortSelect.vue'
import ChannelConfigDialog from './ChannelConfigDialog.vue'
import LoadingState from './LoadingState.vue'

type ViewMode = 'list' | 'card'

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
const sortBy = ref<SortValue>('id-asc')
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
  result = [...result].sort((a, b) => {
    switch (sortBy.value) {
      case 'id-asc':
        return a.id - b.id
      case 'id-desc':
        return b.id - a.id
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
    alert(`已复制 Speaker ID: ${speakerId}`)
  } catch (e) {
    console.error('Failed to copy:', e)
    alert('复制失败')
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
    alert('加载数据失败')
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
    alert('删除成功')
    fetchData()
  } catch (e) {
    alert('删除失败')
  }
}

const toggleEnable = async (channel: ChannelConfig) => {
  try {
    await channelApi.toggle(channel.id, channel.enabled)
  } catch (e) {
    channel.enabled = !channel.enabled
    alert('操作失败')
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

<style lang="scss">
@use '../styles/theme.scss';
</style>

<style scoped lang="scss">
.channels-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 16px;
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

/* ============ 按钮组 ============ */
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
  background: var(--ml-primary);
  box-shadow: var(--ml-shadow-sm);
}

/* ========== 搜索框样式 ========== */
.search-input {
  width: 200px;
}

/* ========== 卡片网格 ========== */
.card-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  align-content: start;
  padding: 0 16px 16px 16px;
  margin: 0 -16px;
}

/* ========== 列表容器 ========== */
.table-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

/* ========== 渠道卡片 ========== */
.channel-card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  border-radius: var(--ml-radius-lg);
}

.channel-card.disabled {
  opacity: 0.6;
}

.channel-card.disabled .connector-logo {
  filter: grayscale(0.6);
}

.card-header {
  padding: 1rem 1.25rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-bottom: 2px dashed var(--ml-border-color);
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

/* 渠道标题区域 */
.channel-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.connector-logo {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--ml-bg);
  border: 2px solid var(--ml-border-color);
  border-radius: 10px;
  overflow: hidden;
  font-size: 1.5rem;
}

.connector-logo img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.channel-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.channel-name {
  font-size: 1rem;
  font-weight: 800;
  color: var(--ml-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connector-name {
  font-size: 0.75rem;
  color: var(--ml-text-muted);
  font-weight: 600;
}

.speaker-id-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--ml-success-light);
  border: 2px solid var(--ml-border-color);
  border-radius: 12px;
  font-size: 0.75rem;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  font-weight: 700;
  color: var(--ml-success);
  cursor: pointer;
  transition: all 0.2s;
}

.speaker-id-badge:hover {
  transform: translateY(-2px);
  box-shadow: var(--ml-shadow-sm);
}

.connector-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 4px 10px;
  background-color: var(--ml-bg);
  border: 2px solid var(--ml-border-color);
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ml-text-secondary);
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
  padding: 4px 10px;
  background-color: var(--ml-success-light);
  color: var(--ml-success);
  border: 2px solid var(--ml-border-color);
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
}

.card-body {
  flex-grow: 1;
  padding: 1rem 1.25rem;
  min-height: 40px;
}

/* 字段列表 */
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
  border-bottom: 1px dashed var(--ml-border-color);
}

.field-item:last-child {
  border-bottom: none;
}

.field-label {
  color: var(--ml-text-muted);
  font-weight: 600;
}

.field-value {
  font-weight: 700;
  color: var(--ml-text);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-pill {
  font-size: 0.75rem;
  padding: 2px 8px;
  color: var(--ml-text-secondary);
  border: 2px solid var(--ml-border-color);
  border-radius: 12px;
  background-color: var(--ml-bg);
  font-weight: 600;
}

.card-footer {
  padding: 0.75rem 1.25rem;
  border-top: 2px solid var(--ml-border-color);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: var(--ml-bg-alt);
  border-radius: 0 0 calc(var(--ml-radius-lg) - 3px) calc(var(--ml-radius-lg) - 3px);
}

.spacer {
  flex-grow: 1;
}

/* ========== 切换开关 ========== */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle-switch.small {
  width: 36px;
  height: 20px;
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
  border: 2px solid var(--ml-border-color);
  border-radius: 24px;
  transition: all 0.2s;
}

.toggle-slider::before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: var(--ml-surface);
  border: 2px solid var(--ml-border-color);
  border-radius: 50%;
  transition: all 0.2s;
}

.toggle-switch.small .toggle-slider::before {
  height: 12px;
  width: 12px;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--ml-success);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle-switch.small input:checked + .toggle-slider::before {
  transform: translateX(16px);
}

/* ========== 表格视图 ========== */
.table-container {
  overflow: hidden;
}

/* 表格列宽 */
.col-name { width: 20%; }
.col-connector { width: 15%; }
.col-tags { width: auto; }
.col-cost { width: 12%; }
.col-status { width: 8%; }
.col-actions { width: 15%; }

.name-text {
  font-weight: 700;
  color: var(--ml-text);
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
  padding: 2px 6px;
  color: var(--ml-text-secondary);
  border: 2px solid var(--ml-border-color);
  border-radius: 10px;
  background-color: transparent;
  font-weight: 600;
}

.mini-tag.more {
  background-color: var(--ml-bg-alt);
}

.cost-value {
  font-size: 0.85rem;
  color: var(--ml-success);
  font-weight: 700;
}

.action-btns {
  display: flex;
  gap: 0.5rem;
}

/* ========== 空状态 ========== */
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
  color: var(--ml-text-muted);
  font-weight: 600;
}
</style>