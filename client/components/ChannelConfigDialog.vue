<template>
  <!-- 整体容器：使用 Teleport 确保在弹出层层级 -->
  <Teleport to="#ml-teleport-container" defer>
    <Transition name="dialog-slide">
      <div v-if="visible" class="channel-config-container">
        <!-- 遮罩层 -->
        <div class="overlay" @click="visible = false"></div>

        <!-- 主对话框 -->
        <div class="main-dialog">
          <div class="dialog-header">
            <span class="dialog-title">{{ isEdit ? '编辑渠道' : '创建渠道' }}</span>
            <button class="close-btn" @click="visible = false">
              <k-icon name="x" />
            </button>
          </div>

          <div class="dialog-layout">
            <!-- 左侧 Tab 导航 -->
            <div class="tab-nav">
              <div
                v-for="tab in availableTabs"
                :key="tab.id"
                class="tab-item"
                :class="{ active: activeTab === tab.id }"
                @click="activeTab = tab.id"
              >
                <k-icon :name="tab.icon" />
                <span>{{ tab.label }}</span>
                <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
              </div>
            </div>

            <!-- 右侧内容区 -->
            <div class="tab-content">
              <!-- 基本信息 -->
              <div v-show="activeTab === 'basic'" class="content-section">
                <div class="section-header">
                  <h4>基本信息</h4>
                  <p>设置渠道的名称、连接器和标签</p>
                </div>

                <div class="form-group">
                  <label class="form-label required">渠道名称</label>
                  <el-input
                    v-model="form.name"
                    placeholder="如 OpenAI DALL-E"
                  />
                  <div class="form-hint">用户可见的渠道名称，冲突时会自动添加后缀</div>
                </div>

                <div class="form-row">
                  <div class="form-group flex-1">
                    <label class="form-label required">连接器</label>
                    <div class="connector-display">
                      <span v-if="form.connectorId" class="connector-name">{{ currentConnectorName }}</span>
                      <span v-else class="connector-placeholder">← 在右侧面板选择</span>
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">启用状态</label>
                    <div class="switch-wrapper">
                      <el-switch v-model="form.enabled" />
                      <span class="switch-label">{{ form.enabled ? '启用' : '禁用' }}</span>
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">标签</label>
                  <TagInput v-model="form.tags!" :suggestions="tagSuggestions" placeholder="选择或输入标签..." />
                  <div class="form-hint">用于分类和筛选渠道，标签与预设匹配后才能使用对应预设</div>
                </div>

                <!-- 连接器配置（内嵌） -->
                <template v-if="form.connectorId">
                  <div class="section-divider">
                    <span>{{ currentConnectorName }} 配置</span>
                  </div>
                  <div v-if="connectorFieldsLoading" class="loading-hint">
                    <k-icon name="loader" class="spin" />
                    <span>加载配置项...</span>
                  </div>
                  <ConfigRenderer
                    v-else-if="currentConnectorFields.length > 0"
                    :fields="currentConnectorFields"
                    v-model="form.connectorConfig!"
                  />
                  <div v-else class="empty-config-hint">
                    <span>此连接器无需额外配置</span>
                  </div>
                </template>
              </div>

              <!-- 中间件流程 -->
              <div v-show="activeTab === 'middlewares'" class="content-section">
                <div class="section-header">
                  <h4>中间件流程</h4>
                  <p>控制此渠道的中间件启用状态</p>
                </div>

                <div class="override-hint-bar">
                  <k-icon name="info-circle" />
                  <span>留空表示跟随全局配置</span>
                </div>

                <div class="pipeline-flow">
                  <div
                    v-for="(phase, phaseIndex) in phases"
                    :key="phase.id"
                    class="phase-section"
                  >
                    <!-- 阶段标题 -->
                    <div class="phase-header" :class="phase.colorClass">
                      <div class="phase-icon">
                        <k-icon :name="phase.icon" />
                      </div>
                      <div class="phase-info">
                        <span class="phase-name">{{ phase.label }}</span>
                        <span class="phase-desc">{{ phase.description }}</span>
                      </div>
                      <span class="phase-badge">{{ getPhaseMiddlewares(phase.id).length }}</span>
                    </div>

                    <!-- 中间件列表 -->
                    <div class="phase-middlewares" v-if="getPhaseMiddlewares(phase.id).length > 0">
                      <div
                        v-for="mw in getPhaseMiddlewares(phase.id)"
                        :key="mw.name"
                        class="mw-item"
                        :class="{ 'has-override': getMiddlewareEnabled(mw.configGroup || mw.name, mw.name) !== undefined }"
                      >
                        <div class="mw-card">
                          <div class="mw-status" :class="getMiddlewareStatusClass(mw)"></div>
                          <div class="mw-content">
                            <span class="mw-name">{{ mw.displayName }}</span>
                            <span class="mw-desc">{{ mw.description || categoryLabels[mw.category] || mw.category }}</span>
                          </div>
                          <el-select
                            :model-value="getMiddlewareEnabled(mw.configGroup || mw.name, mw.name)"
                            @update:model-value="setMiddlewareEnabled(mw.configGroup || mw.name, mw.name, $event)"
                            :placeholder="mw.enabled ? '全局: 启用' : '全局: 禁用'"
                            clearable
                            size="small"
                            :teleported="false"
                            class="mw-switch"
                          >
                            <el-option label="启用" :value="true" />
                            <el-option label="禁用" :value="false" />
                          </el-select>
                        </div>
                      </div>
                    </div>

                    <!-- 空状态 -->
                    <div v-else class="empty-phase">
                      <span>无中间件</span>
                    </div>

                    <!-- 阶段间连接箭头 -->
                    <div v-if="phaseIndex < phases.length - 1" class="phase-connector">
                      <div class="connector-line"></div>
                      <div class="connector-arrow">
                        <k-icon name="chevron-down" />
                      </div>
                      <div class="connector-line"></div>
                    </div>
                  </div>
                </div>

                <!-- 底部说明 -->
                <div class="pipeline-footer">
                  <div class="footer-item">
                    <span class="dot active"></span>
                    <span>启用 - 中间件将在请求中执行</span>
                  </div>
                  <div class="footer-item">
                    <span class="dot"></span>
                    <span>禁用 - 中间件将被跳过</span>
                  </div>
                  <div class="footer-item">
                    <span class="dot override"></span>
                    <span>已覆盖 - 与全局配置不同</span>
                  </div>
                </div>
              </div>

              <!-- 插件配置 -->
              <div v-show="activeTab === 'plugins'" class="content-section">
                <div class="section-header">
                  <h4>插件配置覆盖</h4>
                  <p>为此渠道单独配置插件参数</p>
                </div>

                <div class="override-hint-bar">
                  <k-icon name="info-circle" />
                  <span>留空使用全局配置，填写后将覆盖全局设置</span>
                </div>

                <div v-if="pluginsWithConfig.length > 0" class="plugins-override-list">
                  <div
                    v-for="plugin in pluginsWithConfig"
                    :key="plugin.id"
                    class="plugin-override-card"
                    :class="{ expanded: expandedPlugins.has(plugin.id) }"
                  >
                    <div class="plugin-header" @click="togglePluginExpand(plugin.id)">
                      <div class="plugin-info">
                        <span class="plugin-name">{{ plugin.name }}</span>
                        <span v-if="hasPluginOverride(plugin.id)" class="override-badge">已覆盖</span>
                      </div>
                      <div class="plugin-actions">
                        <k-button
                          v-if="hasPluginOverride(plugin.id)"
                          size="mini"
                          @click.stop="clearPluginOverride(plugin.id)"
                        >
                          清除
                        </k-button>
                        <k-icon :name="expandedPlugins.has(plugin.id) ? 'chevron-up' : 'chevron-down'" />
                      </div>
                    </div>

                    <div v-show="expandedPlugins.has(plugin.id)" class="plugin-config-fields">
                      <ConfigRenderer
                        :fields="getPluginOverrideFields(plugin)"
                        :model-value="getPluginOverrideConfig(plugin.id)"
                        @update:model-value="updatePluginOverrideConfig(plugin.id, $event)"
                        :override-mode="true"
                        :default-values="plugin.config"
                        :show-nav="false"
                      />
                    </div>
                  </div>
                </div>

                <div v-else class="empty-hint">
                  <k-icon name="apps" />
                  <span>暂无可配置的插件</span>
                </div>
              </div>
            </div>
          </div>

          <div class="dialog-footer">
            <k-button @click="visible = false">取消</k-button>
            <k-button type="primary" @click="handleSave" :loading="saving">
              {{ isEdit ? '保存' : '创建' }}
            </k-button>
          </div>
        </div>

        <!-- 右侧连接器选择面板（始终可见） -->
        <div class="connector-side-panel">
          <div class="side-panel-header">
            <k-icon name="puzzle" />
            <span>选择连接器</span>
          </div>

          <!-- 分类筛选 -->
          <div class="category-tabs">
            <div
              v-for="category in connectorCategories"
              :key="category.id"
              class="category-tab"
              :class="{ active: activeConnectorCategory === category.id }"
              @click="activeConnectorCategory = category.id"
            >
              <k-icon :name="category.icon" />
              <span>{{ category.label }}</span>
            </div>
          </div>

          <!-- 搜索框 -->
          <div class="search-box">
            <k-icon name="search" />
            <input
              v-model="connectorSearch"
              type="text"
              placeholder="搜索..."
              class="search-input"
            />
          </div>

          <!-- 连接器列表 -->
          <div class="connector-list">
            <div
              v-for="connector in filteredConnectors"
              :key="connector.id"
              class="connector-card"
              :class="{ selected: form.connectorId === connector.id }"
              @click="handleConnectorSelect(connector)"
            >
              <!-- 选中标记 -->
              <div v-if="form.connectorId === connector.id" class="selected-check">
                <k-icon name="check" />
              </div>

              <!-- 图标 -->
              <div class="card-logo" :class="getConnectorLogoClass(connector)">
                <img
                  :src="getConnectorIconUrl(connector)"
                  :alt="connector.name"
                  class="logo-img"
                  @error="handleIconError"
                />
              </div>

              <!-- 信息 -->
              <div class="card-info">
                <div class="card-name">{{ connector.name }}</div>
                <div class="card-desc">{{ connector.description || getConnectorDefaultDesc(connector) }}</div>
              </div>

              <!-- 类型标签 -->
              <div class="card-types">
                <span
                  v-for="type in connector.supportedTypes"
                  :key="type"
                  class="type-dot"
                  :class="type"
                  :title="getTypeLabel(type)"
                ></span>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-if="filteredConnectors.length === 0" class="empty-connectors">
              <k-icon name="inbox" />
              <span>未找到连接器</span>
            </div>
          </div>

          <!-- 底部统计 -->
          <div class="side-panel-footer">
            共 {{ connectors.length }} 个连接器
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { message, send } from '@koishijs/client'
import { ChannelConfig, ConfigField, ConnectorDefinition, MiddlewareInfo, FieldDefinition } from '../types'
import { channelApi, connectorApi, middlewareApi, pluginApi, PluginInfo } from '../api'
import TagInput from './TagInput.vue'
import ConfigRenderer from './ConfigRenderer.vue'

interface Props {
  modelValue: boolean
  channel?: ChannelConfig | null
}

const props = withDefaults(defineProps<Props>(), {
  channel: null
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': []
}>()

// 状态
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const isEdit = computed(() => !!props.channel?.id)
const activeTab = ref('basic')
const saving = ref(false)
const expandedPlugins = ref(new Set<string>())

// 连接器选择面板状态
const activeConnectorCategory = ref('all')
const connectorSearch = ref('')
const connectorFieldsLoading = ref(false)

// 连接器分类定义
const connectorCategories = [
  { id: 'all', label: '全部', icon: 'grid' },
  { id: 'image', label: '图片', icon: 'image' },
  { id: 'audio', label: '音频', icon: 'volume-2' },
  { id: 'video', label: '视频', icon: 'video' }
]

// 数据
const connectors = ref<ConnectorDefinition[]>([])
const connectorFields = ref<Record<string, ConfigField[]>>({})
const allMiddlewares = ref<MiddlewareInfo[]>([])
const allPlugins = ref<PluginInfo[]>([])

// 远程选项缓存（用于 select-remote 类型字段）
const remoteOptionsCache = ref<Record<string, { label: string; value: any }[]>>({})
const remoteOptionsLoading = ref<Record<string, boolean>>({})

// 表单
const form = ref<Partial<ChannelConfig>>({
  name: '',
  enabled: true,
  connectorId: '',
  connectorConfig: {},
  pluginOverrides: {},
  tags: []
})

// Tab 定义
const tabs = [
  { id: 'basic', label: '基本信息', icon: 'file-text' },
  { id: 'middlewares', label: '中间件流程', icon: 'git-branch' },
  { id: 'plugins', label: '插件配置', icon: 'puzzle' }
]

// 阶段定义
const phases = [
  { id: 'lifecycle-prepare', label: '准备', description: '验证、权限检查', icon: 'clipboard-check', colorClass: 'phase-prepare' },
  { id: 'lifecycle-pre-request', label: '预处理', description: '预设应用、参数处理', icon: 'settings', colorClass: 'phase-pre' },
  { id: 'lifecycle-request', label: '执行', description: '调用连接器生成', icon: 'play', colorClass: 'phase-request' },
  { id: 'lifecycle-post-request', label: '后处理', description: '结果缓存、格式转换', icon: 'package', colorClass: 'phase-post' },
  { id: 'lifecycle-finalize', label: '完成', description: '计费结算、记录保存', icon: 'check-circle', colorClass: 'phase-finalize' }
]

const categoryLabels: Record<string, string> = {
  billing: '计费模块',
  transform: '转换处理',
  validation: '验证检查',
  preset: '预设系统',
  cache: '缓存管理',
  recording: '任务记录',
  request: '请求执行',
  custom: '自定义'
}

// 计算属性
const currentConnectorFields = computed(() => {
  if (!form.value.connectorId) return []
  return connectorFields.value[form.value.connectorId] || []
})

const currentConnectorName = computed(() => {
  const connector = connectors.value.find(c => c.id === form.value.connectorId)
  return connector?.name || '连接器'
})

const availableTabs = computed(() => {
  return tabs.map(tab => {
    let badge = ''
    if (tab.id === 'middlewares') {
      badge = String(allMiddlewares.value.length)
    }
    if (tab.id === 'plugins' && pluginsWithConfig.value.length > 0) {
      badge = String(pluginsWithConfig.value.length)
    }
    return { ...tab, badge }
  })
})

const pluginsWithConfig = computed(() => {
  return allPlugins.value.filter(p => p.configFields && p.configFields.length > 0)
})

// 预置标签选项
const PRESET_TAGS = ['text2img', 'img2img', 'text2video', 'img2video', 'text2audio']

// 标签建议（合并预置标签和当前连接器的默认标签）
const tagSuggestions = computed(() => {
  const connector = connectors.value.find(c => c.id === form.value.connectorId)
  const connectorTags = (connector as any)?.defaultTags || []
  // 合并预置标签和连接器标签，去重
  const allTags = new Set([...PRESET_TAGS, ...connectorTags])
  return Array.from(allTags)
})

// ============ 连接器选择面板相关 ============

// 过滤后的连接器列表
const filteredConnectors = computed(() => {
  let list = connectors.value

  // 分类过滤
  if (activeConnectorCategory.value !== 'all') {
    list = list.filter(c => c.supportedTypes.includes(activeConnectorCategory.value))
  }

  // 搜索过滤
  if (connectorSearch.value.trim()) {
    const query = connectorSearch.value.toLowerCase()
    list = list.filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.description && c.description.toLowerCase().includes(query))
    )
  }

  return list
})

// 获取连接器 Logo 背景类
const getConnectorLogoClass = (connector: ConnectorDefinition): string => {
  if (connector.supportedTypes.includes('audio')) return 'logo-audio'
  if (connector.supportedTypes.includes('video')) return 'logo-video'
  return 'logo-image'
}

// 获取连接器默认图标
const getConnectorDefaultIcon = (connector: ConnectorDefinition): string => {
  if (connector.supportedTypes.includes('audio')) return 'volume-2'
  if (connector.supportedTypes.includes('video')) return 'video'
  return 'image'
}

// 获取连接器图标 URL
const getConnectorIconUrl = (connector: ConnectorDefinition): string => {
  // 如果有自定义图标名称，尝试加载对应图标
  // 优先尝试 SVG，部分旧图标使用 PNG
  if (connector.icon) {
    // chatluna 和 edge-tts 使用 PNG 格式
    if (connector.icon === 'chatluna' || connector.icon === 'edge-tts') {
      return new URL(`../assets/connector-icons/${connector.icon}.png`, import.meta.url).href
    }
    // 其他图标使用 SVG 格式
    return new URL(`../assets/connector-icons/${connector.icon}.svg`, import.meta.url).href
  }
  // 根据类型返回默认图标
  if (connector.supportedTypes.includes('audio')) {
    return new URL('../assets/connector-icons/default-audio.svg', import.meta.url).href
  }
  if (connector.supportedTypes.includes('video')) {
    return new URL('../assets/connector-icons/default-video.svg', import.meta.url).href
  }
  return new URL('../assets/connector-icons/default-image.svg', import.meta.url).href
}

// 图标加载失败时使用默认图标
const handleIconError = (event: Event) => {
  const img = event.target as HTMLImageElement
  const connector = connectors.value.find(c => c.name === img.alt)
  if (connector) {
    // 根据类型使用默认图标
    if (connector.supportedTypes.includes('audio')) {
      img.src = new URL('../assets/connector-icons/default-audio.svg', import.meta.url).href
    } else if (connector.supportedTypes.includes('video')) {
      img.src = new URL('../assets/connector-icons/default-video.svg', import.meta.url).href
    } else {
      img.src = new URL('../assets/connector-icons/default-image.svg', import.meta.url).href
    }
  }
}

// 获取连接器默认描述
const getConnectorDefaultDesc = (connector: ConnectorDefinition): string => {
  if (connector.supportedTypes.includes('audio')) return '语音合成服务'
  if (connector.supportedTypes.includes('video')) return '视频生成服务'
  return '图像生成服务'
}

// 获取类型标签
const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'image': return '图片'
    case 'audio': return '音频'
    case 'video': return '视频'
    default: return type
  }
}

// ============ 远程选项相关方法 ============

// 构建带参数的缓存 key
const buildCacheKey = (source: string, params?: Record<string, any>) => {
  if (!params || Object.keys(params).length === 0) {
    return source
  }
  const sortedParams = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')
  return `${source}?${sortedParams}`
}

// 获取远程选项（异步）
const fetchRemoteOptions = async (source: string, params?: Record<string, any>) => {
  const cacheKey = buildCacheKey(source, params)

  if (remoteOptionsCache.value[cacheKey] || remoteOptionsLoading.value[cacheKey]) {
    return
  }

  remoteOptionsLoading.value[cacheKey] = true
  try {
    const result = await send(source, params)
    if (result?.success && Array.isArray(result.data)) {
      remoteOptionsCache.value[cacheKey] = result.data
    } else {
      remoteOptionsCache.value[cacheKey] = []
    }
  } catch (e) {
    console.error(`Failed to fetch options from ${source}:`, e)
    remoteOptionsCache.value[cacheKey] = []
  } finally {
    remoteOptionsLoading.value[cacheKey] = false
  }
}

// 获取字段参数（基于 dependsOn 和插件配置）
const getFieldParams = (field: FieldDefinition, plugin: PluginInfo): Record<string, any> | undefined => {
  if (!field.dependsOn) return undefined
  // 优先使用覆盖值，其次使用全局配置
  const overrideValue = form.value.pluginOverrides?.[plugin.id]?.[field.dependsOn]
  const globalValue = plugin.config[field.dependsOn]
  const dependValue = overrideValue !== undefined ? overrideValue : globalValue

  if (dependValue === undefined || dependValue === null || dependValue === '') {
    return undefined
  }
  // 提取 dependsOn 的最后一段作为参数名
  const paramName = field.dependsOn.includes('.')
    ? field.dependsOn.split('.').pop()!
    : field.dependsOn
  return { [paramName]: dependValue }
}

// 获取字段的缓存 key
const getFieldCacheKey = (field: FieldDefinition, plugin: PluginInfo): string => {
  if (!field.optionsSource) return ''
  const params = getFieldParams(field, plugin)
  return buildCacheKey(field.optionsSource, params)
}

// 获取远程选项（同步访问缓存）
const getRemoteOptions = (field: FieldDefinition, plugin: PluginInfo) => {
  const cacheKey = getFieldCacheKey(field, plugin)
  if (!cacheKey) return []

  // 如果还没加载，触发加载
  if (!remoteOptionsCache.value[cacheKey] && !remoteOptionsLoading.value[cacheKey]) {
    const params = getFieldParams(field, plugin)
    fetchRemoteOptions(field.optionsSource!, params)
  }

  return remoteOptionsCache.value[cacheKey] || []
}

// 检查是否正在加载
const isRemoteLoading = (field: FieldDefinition) => {
  if (!field.optionsSource) return false
  // 简单检查，不考虑参数
  for (const key of Object.keys(remoteOptionsLoading.value)) {
    if (key.startsWith(field.optionsSource) && remoteOptionsLoading.value[key]) {
      return true
    }
  }
  return false
}

// 方法
const getPhaseMiddlewares = (phaseId: string) => {
  return allMiddlewares.value.filter(mw => mw.phase === phaseId)
}

const getMiddlewareEnabled = (pluginId: string, mwName: string) => {
  return form.value.pluginOverrides?.[pluginId]?.middlewares?.[mwName]
}

const setMiddlewareEnabled = (pluginId: string, mwName: string, value: boolean | undefined | null) => {
  if (!form.value.pluginOverrides) {
    form.value.pluginOverrides = {}
  }
  if (!form.value.pluginOverrides[pluginId]) {
    form.value.pluginOverrides[pluginId] = {}
  }
  if (!form.value.pluginOverrides[pluginId].middlewares) {
    form.value.pluginOverrides[pluginId].middlewares = {}
  }

  if (value === undefined || value === null) {
    delete form.value.pluginOverrides[pluginId].middlewares[mwName]
    if (Object.keys(form.value.pluginOverrides[pluginId].middlewares).length === 0) {
      delete form.value.pluginOverrides[pluginId].middlewares
    }
    if (Object.keys(form.value.pluginOverrides[pluginId]).length === 0) {
      delete form.value.pluginOverrides[pluginId]
    }
  } else {
    form.value.pluginOverrides[pluginId].middlewares[mwName] = value
  }
}

const getMiddlewareStatusClass = (mw: MiddlewareInfo) => {
  const override = getMiddlewareEnabled(mw.configGroup || mw.name, mw.name)
  if (override !== undefined) {
    return override ? 'active override' : 'override'
  }
  return mw.enabled ? 'active' : ''
}

const getOverrideValue = (groupId: string, fieldKey: string) => {
  return form.value.pluginOverrides?.[groupId]?.[fieldKey]
}

const setOverrideValue = (groupId: string, fieldKey: string, value: any) => {
  if (!form.value.pluginOverrides) {
    form.value.pluginOverrides = {}
  }
  if (!form.value.pluginOverrides[groupId]) {
    form.value.pluginOverrides[groupId] = {}
  }
  if (value === undefined || value === null || value === '') {
    delete form.value.pluginOverrides[groupId][fieldKey]
    if (Object.keys(form.value.pluginOverrides[groupId]).length === 0) {
      delete form.value.pluginOverrides[groupId]
    }
  } else {
    form.value.pluginOverrides[groupId][fieldKey] = value
  }
}

const hasPluginOverride = (pluginId: string) => {
  const override = form.value.pluginOverrides?.[pluginId]
  return override && Object.keys(override).length > 0
}

const clearPluginOverride = (pluginId: string) => {
  if (form.value.pluginOverrides) {
    delete form.value.pluginOverrides[pluginId]
  }
}

const togglePluginExpand = (pluginId: string) => {
  if (expandedPlugins.value.has(pluginId)) {
    expandedPlugins.value.delete(pluginId)
  } else {
    expandedPlugins.value.add(pluginId)
  }
}

const shouldShowOverrideField = (plugin: PluginInfo, field: FieldDefinition) => {
  if (!field.showWhen) return true
  const { field: dependField, value } = field.showWhen
  const overrideValue = form.value.pluginOverrides?.[plugin.id]?.[dependField]
  const globalValue = plugin.config[dependField]
  const effectiveValue = overrideValue !== undefined ? overrideValue : globalValue
  return effectiveValue === value
}

// ============ ConfigRenderer 集成辅助函数 ============

// 获取插件的可覆盖字段（转换为 ConfigField 格式）
const getPluginOverrideFields = (plugin: PluginInfo): ConfigField[] => {
  if (!plugin.configFields) return []
  // 过滤 showWhen 条件
  return plugin.configFields.filter(field => shouldShowOverrideField(plugin, field))
}

// 获取插件的覆盖配置
const getPluginOverrideConfig = (pluginId: string): Record<string, any> => {
  return form.value.pluginOverrides?.[pluginId] || {}
}

// 更新插件的覆盖配置
const updatePluginOverrideConfig = (pluginId: string, config: Record<string, any>) => {
  if (!form.value.pluginOverrides) {
    form.value.pluginOverrides = {}
  }
  // 如果配置为空，删除该插件的覆盖
  if (Object.keys(config).length === 0) {
    delete form.value.pluginOverrides[pluginId]
  } else {
    form.value.pluginOverrides[pluginId] = config
  }
}

const handleConnectorChange = async (connectorId: string) => {
  // 仅在创建新渠道时自动填充连接器默认标签
  if (!isEdit.value && connectorId) {
    const connector = connectors.value.find(c => c.id === connectorId)
    const defaultTags = (connector as any)?.defaultTags || []
    if (defaultTags.length > 0) {
      form.value.tags = [...defaultTags]
    }
  }

  if (connectorId && !connectorFields.value[connectorId]) {
    connectorFieldsLoading.value = true
    try {
      const fields = await connectorApi.fields(connectorId)
      connectorFields.value[connectorId] = fields
    } catch (e) {
      console.error('Failed to load connector fields:', e)
    } finally {
      connectorFieldsLoading.value = false
    }
  }

  // 在加载完成后再清空配置，避免闪烁
  form.value.connectorConfig = {}
}

// 处理连接器选择
const handleConnectorSelect = (connector: ConnectorDefinition) => {
  form.value.connectorId = connector.id
  handleConnectorChange(connector.id)
}

const handleSave = async () => {
  if (!form.value.name) {
    message.error('请输入渠道名称')
    return
  }
  if (!form.value.connectorId) {
    message.error('请选择连接器')
    return
  }

  // 确保连接器字段已加载
  if (!connectorFields.value[form.value.connectorId]) {
    try {
      const fields = await connectorApi.fields(form.value.connectorId)
      connectorFields.value[form.value.connectorId] = fields
    } catch (e) {
      console.error('Failed to load connector fields:', e)
    }
  }

  // 填充连接器配置的默认值（确保所有字段都明确保存）
  const fields = currentConnectorFields.value
  const filledConfig = { ...form.value.connectorConfig }
  for (const field of fields) {
    if (filledConfig[field.key] === undefined && field.default !== undefined) {
      filledConfig[field.key] = field.default
    }
  }
  form.value.connectorConfig = filledConfig

  saving.value = true
  try {
    if (isEdit.value && props.channel?.id) {
      await channelApi.update(props.channel.id, form.value)
      message.success('保存成功')
    } else {
      await channelApi.create(form.value as Omit<ChannelConfig, 'id'>)
      message.success('创建成功')
    }
    emit('saved')
    visible.value = false
  } catch (e) {
    message.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    saving.value = false
  }
}

// 加载数据
const loadData = async () => {
  try {
    const [connectorsData, mwData, pluginsData] = await Promise.all([
      connectorApi.list(),
      middlewareApi.list(),
      pluginApi.list()
    ])
    connectors.value = connectorsData
    allMiddlewares.value = mwData
    allPlugins.value = pluginsData.filter(p =>
      (p.configFields && p.configFields.length > 0) ||
      (p.middlewares && p.middlewares.length > 0)
    )
  } catch (e) {
    console.error('Failed to load data:', e)
  }
}

// 监听
watch(() => props.modelValue, async (newVal) => {
  if (newVal) {
    await loadData()

    if (props.channel) {
      form.value = JSON.parse(JSON.stringify(props.channel))
      if (!form.value.pluginOverrides) {
        form.value.pluginOverrides = {}
      }
      if (!form.value.connectorConfig) {
        form.value.connectorConfig = {}
      }
      // 加载连接器字段（但不清空现有配置）
      if (form.value.connectorId && !connectorFields.value[form.value.connectorId]) {
        try {
          const fields = await connectorApi.fields(form.value.connectorId)
          connectorFields.value[form.value.connectorId] = fields
        } catch (e) {
          console.error('Failed to load connector fields:', e)
        }
      }
      // 默认展开有覆盖的插件
      for (const pluginId of Object.keys(form.value.pluginOverrides)) {
        expandedPlugins.value.add(pluginId)
      }
    } else {
      form.value = {
        name: '',
        enabled: true,
        connectorId: '',
        connectorConfig: {},
        pluginOverrides: {},
        tags: []
      }
    }
  } else {
    // 对话框关闭时重置状态
    activeTab.value = 'basic'
    expandedPlugins.value.clear()
  }
})
</script>

<style scoped>
/* ============ 整体容器布局 ============ */
.channel-config-container {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 251, 235, 0.7);
  backdrop-filter: blur(8px);
}

/* ============ 主对话框 ============ */
.main-dialog {
  position: relative;
  width: 800px;
  height: 80vh;
  max-height: 800px;
  background: var(--ml-surface, #ffffff);
  border: var(--ml-border, 3px solid #451a03);
  border-radius: var(--ml-radius-lg, 16px);
  box-shadow: var(--ml-shadow-lg, 6px 6px 0 #451a03);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: var(--ml-border, 3px solid #451a03);
  background: var(--ml-primary-light, #fde68a);
}

.dialog-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--ml-text, #451a03);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 2px solid var(--ml-border-color, #451a03);
  background: var(--ml-surface, #ffffff);
  border-radius: var(--ml-radius-sm, 8px);
  cursor: pointer;
  color: var(--ml-text, #451a03);
  transition: all 0.1s ease;
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.close-btn:hover {
  background: var(--ml-error-bg, #fee2e2);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--ml-border-color, #451a03);
}

.close-btn:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--ml-border-color, #451a03);
}

.dialog-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 560px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: var(--ml-border, 3px solid #451a03);
  background: var(--ml-bg-alt, #fef3c7);
}

/* ============ Tab 导航 ============ */
.tab-nav {
  width: 160px;
  flex-shrink: 0;
  background: var(--ml-bg-alt, #fef3c7);
  border-right: var(--ml-border, 3px solid #451a03);
  padding: 1rem 0;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  color: var(--ml-text-secondary, #92400e);
  transition: all 0.1s ease;
  border-left: 4px solid transparent;
  font-weight: 600;
}

.tab-item:hover {
  background: var(--ml-surface, #ffffff);
  color: var(--ml-text, #451a03);
}

.tab-item.active {
  background: var(--ml-surface, #ffffff);
  color: var(--ml-text, #451a03);
  border-left-color: var(--ml-primary, #fbbf24);
}

.tab-item .k-icon {
  font-size: 16px;
}

.tab-badge {
  margin-left: auto;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--ml-surface, #ffffff);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ml-text, #451a03);
}

.tab-item.active .tab-badge {
  background: var(--ml-primary, #fbbf24);
  border-color: var(--ml-border-color, #451a03);
  color: var(--ml-text, #451a03);
}

/* ============ 内容区 ============ */
.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  background: var(--ml-surface, #ffffff);
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.tab-content:hover {
  scrollbar-color: var(--ml-border-color, #451a03) transparent;
}

.tab-content::-webkit-scrollbar {
  width: 6px;
}

.tab-content::-webkit-scrollbar-track {
  background: transparent;
}

.tab-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.tab-content:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color, #451a03);
}

.content-section {
  max-width: 520px;
}

.section-header {
  margin-bottom: 1.5rem;
}

.section-header h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--ml-text, #451a03);
}

.section-header p {
  margin: 0;
  font-size: 13px;
  color: var(--ml-text-secondary, #92400e);
}

/* ============ 表单样式 ============ */
.form-group {
  margin-bottom: 1.25rem;
}

.form-row {
  display: flex;
  gap: 1.5rem;
}

.flex-1 {
  flex: 1;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--ml-text, #451a03);
  font-weight: 700;
}

.form-label.required::after {
  content: '*';
  color: var(--ml-error, #ef4444);
  margin-left: 4px;
}

.form-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--ml-text-secondary, #92400e);
}

/* 连接器显示 */
.connector-display {
  padding: 10px 12px;
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius-sm, 8px);
  background: var(--ml-bg-alt, #fef3c7);
}

.connector-name {
  font-weight: 700;
  color: var(--ml-text, #451a03);
}

.connector-placeholder {
  color: var(--ml-text-secondary, #92400e);
  font-style: italic;
}

.switch-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
}

.switch-label {
  font-size: 13px;
  color: var(--ml-text-secondary, #92400e);
}

.section-divider {
  display: flex;
  align-items: center;
  margin: 1.5rem 0 1rem;
  font-size: 13px;
  font-weight: 700;
  color: var(--ml-text, #451a03);
}

.section-divider::before,
.section-divider::after {
  content: '';
  flex: 1;
  height: 2px;
  background: var(--ml-border-color, #451a03);
}

.section-divider::before {
  margin-right: 12px;
}

.section-divider::after {
  margin-left: 12px;
}

/* 加载提示 */
.loading-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--ml-text-secondary, #92400e);
  font-size: 13px;
}

.loading-hint .k-icon.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.empty-config-hint {
  padding: 16px;
  color: var(--ml-text-secondary, #92400e);
  font-size: 13px;
  font-style: italic;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 3rem;
  color: var(--ml-text-secondary, #92400e);
}

.empty-hint .k-icon {
  font-size: 2rem;
  opacity: 0.5;
}

.override-hint-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--ml-bg-alt, #fef3c7);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius-sm, 8px);
  font-size: 13px;
  color: var(--ml-text, #451a03);
  margin-bottom: 1.5rem;
}

.override-hint-bar .k-icon {
  color: var(--ml-primary-dark, #d97706);
}

/* ============ 中间件流程 ============ */
.pipeline-flow {
  display: flex;
  flex-direction: column;
}

.phase-section {
  display: flex;
  flex-direction: column;
}

.phase-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--ml-surface, #ffffff);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius, 12px);
  transition: all 0.1s ease;
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.phase-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--ml-radius-sm, 8px);
  font-size: 16px;
  border: 2px solid;
}

.phase-prepare .phase-icon { background: #dbeafe; color: #3b82f6; border-color: #3b82f6; }
.phase-pre .phase-icon { background: #ede9fe; color: #8b5cf6; border-color: #8b5cf6; }
.phase-request .phase-icon { background: #dcfce7; color: #22c55e; border-color: #22c55e; }
.phase-post .phase-icon { background: #ffedd5; color: #f97316; border-color: #f97316; }
.phase-finalize .phase-icon { background: #e0e7ff; color: #6366f1; border-color: #6366f1; }

.phase-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.phase-name {
  font-size: 14px;
  font-weight: 800;
  color: var(--ml-text, #451a03);
}

.phase-desc {
  font-size: 11px;
  color: var(--ml-text-secondary, #92400e);
}

.phase-badge {
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  background: var(--ml-bg-alt, #fef3c7);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 800;
  color: var(--ml-text, #451a03);
  display: flex;
  align-items: center;
  justify-content: center;
}

.phase-middlewares {
  display: flex;
  flex-direction: column;
  margin-left: 24px;
  padding-left: 24px;
  border-left: 3px solid var(--ml-border-color, #451a03);
}

.mw-item {
  position: relative;
}

.mw-item::before {
  content: '';
  position: absolute;
  left: -25px;
  top: 50%;
  width: 12px;
  height: 3px;
  background: var(--ml-border-color, #451a03);
}

.mw-item.has-override::before {
  background: var(--ml-primary, #fbbf24);
}

.mw-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  margin: 6px 0;
  background: var(--ml-surface, #ffffff);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius-sm, 8px);
  transition: all 0.1s ease;
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.mw-item.has-override .mw-card {
  border-color: var(--ml-primary, #fbbf24);
  background: var(--ml-primary-light, #fde68a);
  box-shadow: 2px 2px 0 var(--ml-primary-dark, #d97706);
}

.mw-status {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--ml-text-secondary, #92400e);
  flex-shrink: 0;
  border: 2px solid var(--ml-border-color, #451a03);
}

.mw-status.active {
  background: #22c55e;
}

.mw-status.override {
  background: var(--ml-primary, #fbbf24);
}

.mw-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mw-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--ml-text, #451a03);
}

.mw-desc {
  font-size: 11px;
  color: var(--ml-text-secondary, #92400e);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mw-switch {
  width: 120px;
  flex-shrink: 0;
}

.empty-phase {
  margin-left: 24px;
  padding: 12px 24px;
  border-left: 3px dashed var(--ml-border-color, #451a03);
  color: var(--ml-text-secondary, #92400e);
  font-size: 12px;
  font-style: italic;
}

.phase-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
}

.connector-line {
  width: 3px;
  height: 8px;
  background: var(--ml-border-color, #451a03);
}

.connector-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--ml-text, #451a03);
  font-size: 12px;
}

.pipeline-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 1.5rem;
  padding: 12px 16px;
  background: var(--ml-bg-alt, #fef3c7);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius, 12px);
}

.footer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ml-text, #451a03);
  font-weight: 600;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--ml-text-secondary, #92400e);
  border: 2px solid var(--ml-border-color, #451a03);
}

.dot.active {
  background: #22c55e;
}

.dot.override {
  background: var(--ml-primary, #fbbf24);
}

/* ============ 插件配置 ============ */
.plugins-override-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plugin-override-card {
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius, 12px);
  overflow: hidden;
  transition: all 0.1s ease;
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.plugin-override-card.expanded {
  border-color: var(--ml-primary, #fbbf24);
  box-shadow: 3px 3px 0 var(--ml-primary-dark, #d97706);
}

.plugin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--ml-bg-alt, #fef3c7);
  cursor: pointer;
  transition: background 0.1s ease;
}

.plugin-header:hover {
  background: var(--ml-primary-light, #fde68a);
}

.plugin-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.plugin-name {
  font-weight: 700;
  color: var(--ml-text, #451a03);
}

.override-badge {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--ml-primary, #fbbf24);
  color: var(--ml-text, #451a03);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: 10px;
  font-weight: 700;
}

.plugin-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.plugin-config-fields {
  padding: 16px;
  background: var(--ml-surface, #ffffff);
  border-top: 2px solid var(--ml-border-color, #451a03);
}

/* ============ 右侧连接器选择面板 ============ */
.connector-side-panel {
  position: relative;
  width: 340px;
  height: 80vh;
  max-height: 800px;
  background: var(--ml-surface, #ffffff);
  border: var(--ml-border, 3px solid #451a03);
  border-radius: var(--ml-radius-lg, 16px);
  box-shadow: var(--ml-shadow-lg, 6px 6px 0 #451a03);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.side-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: var(--ml-border, 3px solid #451a03);
  background: var(--ml-primary-light, #fde68a);
  font-size: 15px;
  font-weight: 800;
  color: var(--ml-text, #451a03);
}

.side-panel-header .k-icon {
  font-size: 18px;
  color: var(--ml-text, #451a03);
}

/* 分类标签 */
.category-tabs {
  display: flex;
  gap: 6px;
  padding: 12px 16px;
  border-bottom: 2px solid var(--ml-border-color, #451a03);
  background: var(--ml-bg-alt, #fef3c7);
}

.category-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: var(--ml-radius, 12px);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: var(--ml-text, #451a03);
  background: var(--ml-surface, #ffffff);
  border: 2px solid var(--ml-border-color, #451a03);
  transition: all 0.1s ease;
  flex: 1;
  box-shadow: 1px 1px 0 var(--ml-border-color, #451a03);
}

.category-tab:hover {
  background: var(--ml-primary-light, #fde68a);
  transform: translate(-1px, -1px);
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.category-tab.active {
  background: var(--ml-primary, #fbbf24);
  transform: translate(1px, 1px);
  box-shadow: none;
}

.category-tab .k-icon {
  font-size: 14px;
}

.category-count {
  font-size: 10px;
  opacity: 0.8;
}

/* 搜索框 */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px;
  padding: 8px 12px;
  background: var(--ml-surface, #ffffff);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius-sm, 8px);
  transition: all 0.1s ease;
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.search-box:focus-within {
  border-color: var(--ml-primary, #fbbf24);
  box-shadow: 2px 2px 0 var(--ml-primary-dark, #d97706);
}

.search-box .k-icon {
  color: var(--ml-text-secondary, #92400e);
  font-size: 14px;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--ml-text, #451a03);
}

.search-input::placeholder {
  color: var(--ml-text-secondary, #92400e);
}

/* 连接器列表 */
.connector-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.connector-list:hover {
  scrollbar-color: var(--ml-border-color, #451a03) transparent;
}

.connector-list::-webkit-scrollbar {
  width: 4px;
}

.connector-list::-webkit-scrollbar-track {
  background: transparent;
}

.connector-list::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 2px;
}

.connector-list:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color, #451a03);
}

/* 连接器卡片 */
.connector-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--ml-surface, #ffffff);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius, 12px);
  cursor: pointer;
  transition: all 0.1s ease;
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.connector-card:hover {
  background: var(--ml-bg-alt, #fef3c7);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--ml-border-color, #451a03);
}

.connector-card.selected {
  background: var(--ml-primary-light, #fde68a);
  border-color: var(--ml-primary, #fbbf24);
  box-shadow: 3px 3px 0 var(--ml-primary-dark, #d97706);
}

.selected-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  background: var(--ml-primary, #fbbf24);
  border: 2px solid var(--ml-border-color, #451a03);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ml-text, #451a03);
  font-size: 10px;
}

/* Logo */
.card-logo {
  width: 40px;
  height: 40px;
  border-radius: var(--ml-radius-sm, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border: 2px solid;
}

.card-logo.logo-image {
  background: #dcfce7;
  border-color: #10b981;
}

.card-logo.logo-audio {
  background: #ede9fe;
  border-color: #8b5cf6;
}

.card-logo.logo-video {
  background: #ffedd5;
  border-color: #f59e0b;
}

.logo-svg {
  width: 24px;
  height: 24px;
}

.logo-svg :deep(svg) {
  width: 100%;
  height: 100%;
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.logo-icon {
  font-size: 20px;
}

.logo-image .logo-icon {
  color: #10b981;
}

.logo-audio .logo-icon {
  color: #8b5cf6;
}

.logo-video .logo-icon {
  color: #f59e0b;
}

/* 信息 */
.card-info {
  flex: 1;
  min-width: 0;
}

.card-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--ml-text, #451a03);
  margin-bottom: 4px;
}

.card-desc {
  font-size: 11px;
  color: var(--ml-text-secondary, #92400e);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 类型点 */
.card-types {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  padding-top: 4px;
}

.type-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--ml-text-secondary, #92400e);
  border: 2px solid var(--ml-border-color, #451a03);
}

.type-dot.image {
  background: #10b981;
}

.type-dot.audio {
  background: #8b5cf6;
}

.type-dot.video {
  background: #f59e0b;
}

/* 空状态 */
.empty-connectors {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--ml-text-secondary, #92400e);
  font-size: 13px;
}

.empty-connectors .k-icon {
  font-size: 32px;
  opacity: 0.4;
}

/* 底部 */
.side-panel-footer {
  padding: 12px 16px;
  border-top: var(--ml-border, 3px solid #451a03);
  background: var(--ml-bg-alt, #fef3c7);
  font-size: 12px;
  font-weight: 700;
  color: var(--ml-text, #451a03);
  text-align: center;
}

/* ============ 过渡动画 ============ */
.dialog-slide-enter-active,
.dialog-slide-leave-active {
  transition: all 0.3s ease;
}

.dialog-slide-enter-active .main-dialog,
.dialog-slide-enter-active .connector-side-panel,
.dialog-slide-leave-active .main-dialog,
.dialog-slide-leave-active .connector-side-panel {
  transition: all 0.3s ease;
}

.dialog-slide-enter-from,
.dialog-slide-leave-to {
  opacity: 0;
}

.dialog-slide-enter-from .main-dialog,
.dialog-slide-leave-to .main-dialog {
  transform: translateX(-30px);
  opacity: 0;
}

.dialog-slide-enter-from .connector-side-panel,
.dialog-slide-leave-to .connector-side-panel {
  transform: translateX(30px);
  opacity: 0;
}
</style>
