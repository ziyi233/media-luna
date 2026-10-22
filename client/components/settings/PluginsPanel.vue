<template>
  <div class="plugins-panel">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state pop-card no-hover">
      <k-icon name="refresh" class="spin" />
      <span>加载中...</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="plugins.length === 0" class="empty-state pop-card no-hover">
      <k-icon name="apps" class="empty-icon" />
      <p>暂无扩展插件</p>
      <p class="hint">第三方扩展插件将在这里显示<br>内置功能请在"功能模块"中配置</p>
    </div>

    <!-- 插件列表 -->
    <template v-else>
      <div class="plugins-list">
        <div
          v-for="plugin in sortedPlugins"
          :key="plugin.id"
          class="plugin-card pop-card"
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
            <span v-if="plugin.connector" class="plugin-badge connector"><k-icon name="link" /> 连接器</span>
            <span v-if="plugin.middlewares?.length" class="plugin-badge middleware">
              <k-icon name="layer-group" /> {{ plugin.middlewares.length }} 个中间件
            </span>
            <span :class="plugin.enabled ? 'status-enabled' : 'status-disabled'">
              <k-icon :name="plugin.enabled ? 'check' : 'times-full'" />
            </span>
          </div>
        </div>
      </div>

      <!-- 插件详情 -->
      <div v-if="selectedPlugin" class="plugin-detail pop-card no-hover">
        <header class="detail-header">
          <div class="header-left">
            <h3>{{ selectedPlugin.name }}</h3>
            <span v-if="selectedPlugin.version" class="version">v{{ selectedPlugin.version }}</span>
          </div>
          <div class="header-actions">
            <button
              v-for="action in selectedPlugin.actions"
              :key="action.name"
              class="pop-btn small"
              :class="action.type === 'primary' ? 'primary' : ''"
              @click="executeAction(action)"
            >
              {{ action.label }}
            </button>
          </div>
        </header>

        <!-- 连接器信息 -->
        <div v-if="selectedPlugin.connector" class="connector-info">
          <h4><k-icon name="link" /> 连接器</h4>
          <div class="connector-meta">
            <span class="connector-id">{{ selectedPlugin.connector.id }}</span>
            <span class="connector-types">
              支持: {{ selectedPlugin.connector.supportedTypes?.join(', ') || '无' }}
            </span>
          </div>
        </div>

        <!-- 中间件列表 -->
        <div v-if="selectedPlugin.middlewares?.length" class="middlewares-list">
          <h4><k-icon name="layer-group" /> 中间件</h4>
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
          <h4><k-icon name="settings" /> 配置</h4>
          <ConfigRenderer
            :fields="selectedPlugin.configFields"
            v-model="pluginConfig"
            :presets-map="selectedPlugin.presets"
          />
          <div class="config-actions">
            <button class="pop-btn primary" @click="saveConfig" :disabled="saving">
              <template v-if="saving">保存中...</template>
              <template v-else><k-icon name="save" /> 保存配置</template>
            </button>
          </div>
        </div>

        <!-- 无配置提示 -->
        <div v-else class="no-config">
          <span class="no-config-icon"><k-icon name="info-full" /></span>
          <span>该插件暂无可配置项</span>
        </div>
      </div>

      <!-- 无选中提示 -->
      <div v-else class="no-selection pop-card no-hover">
        <k-icon name="apps" class="no-selection-icon" />
        <p>请从左侧选择一个插件查看详情</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { send } from '@koishijs/client'
import { pluginApi, PluginInfo } from '../../api'
import ConfigRenderer from '../ConfigRenderer.vue'

// 状态
const loading = ref(true)
const plugins = ref<PluginInfo[]>([])
const selectedPlugin = ref<PluginInfo | null>(null)

// 排序后的插件列表：有 configFields 的排前面
const sortedPlugins = computed(() => {
  return [...plugins.value].sort((a, b) => {
    const aHasConfig = (a.configFields?.length ?? 0) > 0 ? 1 : 0
    const bHasConfig = (b.configFields?.length ?? 0) > 0 ? 1 : 0
    return bHasConfig - aHasConfig
  })
})
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
    alert('保存成功')
    await loadPlugins()
    // 更新当前选中的插件
    const updated = plugins.value.find(p => p.id === selectedPlugin.value?.id)
    if (updated) {
      selectedPlugin.value = updated
      pluginConfig.value = { ...updated.config }
    }
  } catch (e) {
    alert('保存失败')
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
        alert('数据未变化，无需更新')
      } else {
        alert(`同步完成：新增 ${added}，更新 ${updated}，删除 ${removed}`)
      }
    } else if (result?.data?.message) {
      alert(result.data.message)
    } else {
      alert(`${action.label} 完成`)
    }
    await loadPlugins()
  } catch (e) {
    alert(`${action.label} 失败: ${e instanceof Error ? e.message : '未知错误'}`)
  }
}

onMounted(loadPlugins)
</script>

<style lang="scss">
@use '../../styles/theme.scss';
</style>

<style scoped lang="scss">
.plugins-panel {
  display: flex;
  gap: 24px;
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
  color: var(--ml-text-muted);
  width: 100%;
}

.empty-icon,
.no-selection-icon,
.no-config-icon {
  font-size: 3rem;
}

.empty-state .hint {
  font-size: 12px;
  text-align: center;
}

.spin {
  font-size: 2rem;
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
  overflow-y: auto;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.plugins-list:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.plugins-list::-webkit-scrollbar {
  width: 6px;
}

.plugins-list::-webkit-scrollbar-track {
  background: transparent;
}

.plugins-list::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.plugins-list:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

.plugin-card {
  padding: 12px 16px;
  cursor: pointer;
}

.plugin-card.active {
  background: var(--ml-primary-light);
}

.plugin-card.active .plugin-name {
  color: var(--ml-text);
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
  gap: 8px;
  margin-bottom: 4px;
}

.plugin-name {
  font-weight: 700;
  color: var(--ml-text);
}

.plugin-version {
  font-size: 11px;
  color: var(--ml-text-muted);
  background: var(--ml-cream);
  padding: 2px 8px;
  border-radius: 8px;
  border: 1px solid var(--ml-border-color);
}

.plugin-description {
  font-size: 12px;
  color: var(--ml-text-muted);
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
  gap: 8px;
  flex-wrap: wrap;
}

.plugin-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 8px;
  background: var(--ml-cream);
  border: 1px solid var(--ml-border-color);
  color: var(--ml-text);
  font-weight: 600;
}

.plugin-badge.connector {
  background: var(--ml-info-bg);
  border-color: var(--ml-info-border);
  color: var(--ml-info);
}

.plugin-badge.middleware {
  background: var(--ml-success-bg);
  border-color: var(--ml-success-border);
  color: var(--ml-success);
}

.status-enabled,
.status-disabled {
  margin-left: auto;
  font-size: 16px;
}

.plugin-detail {
  flex: 1;
  min-width: 0;
  padding: 24px;
  overflow-y: auto;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.plugin-detail:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.plugin-detail::-webkit-scrollbar {
  width: 6px;
}

.plugin-detail::-webkit-scrollbar-track {
  background: transparent;
}

.plugin-detail::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.plugin-detail:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--ml-border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-left h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 900;
  color: var(--ml-text);
}

.header-left .version {
  font-size: 12px;
  color: var(--ml-text-muted);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.connector-info, .middlewares-list, .config-section {
  margin-bottom: 24px;
}

.connector-info h4, .middlewares-list h4, .config-section h4 {
  font-size: 14px;
  font-weight: 700;
  color: var(--ml-text);
  margin: 0 0 12px 0;
}

.connector-meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--ml-text-muted);
}

.connector-id {
  font-family: monospace;
  background: var(--ml-cream);
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--ml-border-color);
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
  padding: 6px 12px;
  background: var(--ml-cream);
  border: 2px solid var(--ml-border-color);
  border-radius: var(--ml-radius);
  font-size: 12px;
  color: var(--ml-text-muted);
  font-weight: 600;
}

.middleware-tag.enabled {
  color: var(--ml-text);
  background: var(--ml-surface);
}

.phase-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--ml-primary-light);
  border-radius: 6px;
  font-weight: 700;
  color: var(--ml-primary);
}

.config-actions {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 2px solid var(--ml-border-color);
}

.no-config, .no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 3rem;
  color: var(--ml-text-muted);
  font-weight: 600;
}

.no-selection {
  flex: 1;
}
</style>
