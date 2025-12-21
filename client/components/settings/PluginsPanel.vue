<template>
  <div class="plugins-panel">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <k-icon name="sync" class="spin" />
      <span>加载中...</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="plugins.length === 0" class="empty-state">
      <k-icon name="apps" />
      <p>暂无扩展插件</p>
      <p class="hint">第三方扩展插件将在这里显示<br>内置功能请在"功能模块"中配置</p>
    </div>

    <!-- 插件列表 -->
    <template v-else>
      <div class="plugins-list">
        <div
          v-for="plugin in plugins"
          :key="plugin.id"
          class="plugin-card"
          :class="{ active: selectedPlugin?.id === plugin.id, disabled: !plugin.enabled }"
          @click="selectPlugin(plugin)"
        >
          <div class="plugin-info">
            <div class="plugin-header">
              <span class="plugin-name">{{ plugin.name }}</span>
              <span v-if="plugin.version" class="plugin-version">v{{ plugin.version }}</span>
            </div>
            <p class="plugin-description">{{ plugin.description || '暂无描述' }}</p>
          </div>
          <div class="plugin-status">
            <span v-if="plugin.connector" class="plugin-badge connector">连接器</span>
            <span v-if="plugin.middlewares?.length" class="plugin-badge middleware">
              {{ plugin.middlewares.length }} 个中间件
            </span>
            <k-icon
              :name="plugin.enabled ? 'check-circle' : 'close-circle'"
              :class="plugin.enabled ? 'enabled' : 'disabled'"
            />
          </div>
        </div>
      </div>

      <!-- 插件详情 -->
      <div v-if="selectedPlugin" class="plugin-detail">
        <header class="detail-header">
          <div class="header-left">
            <h3>{{ selectedPlugin.name }}</h3>
            <span v-if="selectedPlugin.version" class="version">v{{ selectedPlugin.version }}</span>
          </div>
          <div class="header-actions">
            <k-button
              v-for="action in selectedPlugin.actions"
              :key="action.name"
              :type="action.type || 'default'"
              size="small"
              @click="executeAction(action)"
            >
              <template v-if="action.icon" #icon>
                <k-icon :name="action.icon" />
              </template>
              {{ action.label }}
            </k-button>
          </div>
        </header>

        <!-- 连接器信息 -->
        <div v-if="selectedPlugin.connector" class="connector-info">
          <h4>连接器</h4>
          <div class="connector-meta">
            <span class="connector-id">{{ selectedPlugin.connector.id }}</span>
            <span class="connector-types">
              支持: {{ selectedPlugin.connector.supportedTypes?.join(', ') || '无' }}
            </span>
          </div>
        </div>

        <!-- 中间件列表 -->
        <div v-if="selectedPlugin.middlewares?.length" class="middlewares-list">
          <h4>中间件</h4>
          <div class="middleware-tags">
            <span
              v-for="mw in selectedPlugin.middlewares"
              :key="mw.name"
              class="middleware-tag"
              :class="{ enabled: mw.enabled }"
            >
              {{ mw.displayName || mw.name }}
              <span class="phase-badge">{{ phaseLabel(mw.phase) }}</span>
            </span>
          </div>
        </div>

        <!-- 配置表单 -->
        <div v-if="selectedPlugin.configFields?.length" class="config-section">
          <h4>配置</h4>
          <ConfigRenderer
            :fields="selectedPlugin.configFields"
            v-model="pluginConfig"
            :presets-map="selectedPlugin.presets"
          />
          <div class="config-actions">
            <k-button type="primary" @click="saveConfig" :loading="saving">
              <template #icon><k-icon name="save" /></template>
              保存配置
            </k-button>
          </div>
        </div>

        <!-- 无配置提示 -->
        <div v-else class="no-config">
          <k-icon name="info-circle" />
          <span>该插件暂无可配置项</span>
        </div>
      </div>

      <!-- 无选中提示 -->
      <div v-else class="no-selection">
        <k-icon name="apps" />
        <p>请从左侧选择一个插件查看详情</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message, send } from '@koishijs/client'
import { pluginApi, PluginInfo } from '../../api'
import ConfigRenderer from '../ConfigRenderer.vue'

// 状态
const loading = ref(true)
const plugins = ref<PluginInfo[]>([])
const selectedPlugin = ref<PluginInfo | null>(null)
const pluginConfig = ref<Record<string, any>>({})
const saving = ref(false)

// 阶段标签映射
const phaseLabels: Record<string, string> = {
  'lifecycle-prepare': '准备',
  'lifecycle-pre-request': '前置',
  'lifecycle-request': '请求',
  'lifecycle-post-request': '后置',
  'lifecycle-finalize': '完成'
}

const phaseLabel = (phase: string) => phaseLabels[phase] || phase

// 加载插件列表
const loadPlugins = async () => {
  try {
    loading.value = true
    plugins.value = await pluginApi.list()
  } catch (e) {
    console.error('Failed to load plugins:', e)
    plugins.value = []
  } finally {
    loading.value = false
  }
}

// 选择插件
const selectPlugin = (plugin: PluginInfo) => {
  selectedPlugin.value = plugin
  pluginConfig.value = { ...plugin.config }
  // 填充默认值
  for (const field of plugin.configFields || []) {
    if (pluginConfig.value[field.key] === undefined && field.default !== undefined) {
      pluginConfig.value[field.key] = field.default
    }
  }
}

// 保存配置
const saveConfig = async () => {
  if (!selectedPlugin.value) return
  saving.value = true
  try {
    await pluginApi.updateConfig(selectedPlugin.value.id, pluginConfig.value)
    message.success('保存成功')
    await loadPlugins()
    // 更新当前选中的插件
    const updated = plugins.value.find(p => p.id === selectedPlugin.value?.id)
    if (updated) {
      selectedPlugin.value = updated
      pluginConfig.value = { ...updated.config }
    }
  } catch (e) {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

// 执行操作
const executeAction = async (action: { apiEvent: string; label: string }) => {
  try {
    const result = await send(action.apiEvent as any) as any
    if (result?.success === false) {
      throw new Error(result.error || '操作失败')
    }
    // 特殊处理同步结果
    if (action.apiEvent === 'media-luna/presets/sync' && result?.data) {
      const { added, updated, removed, notModified } = result.data
      if (notModified) {
        message.info('数据未变化，无需更新')
      } else {
        message.success(`同步完成：新增 ${added}，更新 ${updated}，删除 ${removed}`)
      }
    } else if (result?.data?.message) {
      message.success(result.data.message)
    } else {
      message.success(`${action.label} 完成`)
    }
    await loadPlugins()
  } catch (e) {
    message.error(`${action.label} 失败: ${e instanceof Error ? e.message : '未知错误'}`)
  }
}

onMounted(loadPlugins)
</script>

<style scoped>
.plugins-panel {
  display: flex;
  gap: 1.5rem;
  height: 100%;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 3rem;
  color: var(--k-color-text-description);
  width: 100%;
}

.loading-state .k-icon,
.empty-state .k-icon {
  font-size: 2rem;
  opacity: 0.5;
}

.empty-state .hint {
  font-size: 12px;
  opacity: 0.7;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.plugins-list {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

.plugin-card {
  background: var(--k-card-bg);
  border: 1px solid var(--k-color-border);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.plugin-card:hover {
  border-color: var(--k-color-active);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.plugin-card.active {
  border-color: var(--k-color-active);
  background: var(--k-color-active-bg);
}

.plugin-card.disabled {
  opacity: 0.6;
}

.plugin-info {
  margin-bottom: 8px;
}

.plugin-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.plugin-name {
  font-weight: 500;
  color: var(--k-color-text);
}

.plugin-version {
  font-size: 11px;
  color: var(--k-color-text-description);
  background: var(--k-color-bg-2);
  padding: 1px 6px;
  border-radius: 4px;
}

.plugin-description {
  font-size: 12px;
  color: var(--k-color-text-description);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.plugin-status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.plugin-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--k-color-bg-2);
  color: var(--k-color-text-description);
}

.plugin-badge.connector {
  background: rgba(var(--k-color-active-rgb), 0.15);
  color: var(--k-color-active);
}

.plugin-badge.middleware {
  background: rgba(var(--k-color-success-rgb), 0.15);
  color: var(--k-color-success);
}

.plugin-status .k-icon {
  margin-left: auto;
}

.plugin-status .enabled {
  color: var(--k-color-success);
}

.plugin-status .disabled {
  color: var(--k-color-text-description);
}

.plugin-detail {
  flex: 1;
  min-width: 0;
  background: var(--k-card-bg);
  border: 1px solid var(--k-color-border);
  border-radius: 12px;
  padding: 1.5rem;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--k-color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-left h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.header-left .version {
  font-size: 12px;
  color: var(--k-color-text-description);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.connector-info, .middlewares-list, .config-section {
  margin-bottom: 1.5rem;
}

.connector-info h4, .middlewares-list h4, .config-section h4 {
  font-size: 14px;
  font-weight: 500;
  color: var(--k-color-text);
  margin: 0 0 0.75rem 0;
}

.connector-meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--k-color-text-description);
}

.connector-id {
  font-family: monospace;
  background: var(--k-color-bg-2);
  padding: 2px 8px;
  border-radius: 4px;
}

.middleware-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.middleware-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--k-color-bg-2);
  border-radius: 6px;
  font-size: 12px;
  color: var(--k-color-text-description);
}

.middleware-tag.enabled {
  color: var(--k-color-text);
}

.phase-badge {
  font-size: 10px;
  padding: 1px 4px;
  background: var(--k-color-bg-1);
  border-radius: 3px;
}

.config-actions {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--k-color-border);
}

.no-config, .no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 3rem;
  color: var(--k-color-text-description);
}

.no-config .k-icon, .no-selection .k-icon {
  font-size: 2rem;
  opacity: 0.5;
}

.no-selection {
  flex: 1;
  background: var(--k-card-bg);
  border: 1px solid var(--k-color-border);
  border-radius: 12px;
}
</style>
