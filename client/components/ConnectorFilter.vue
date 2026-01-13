<template>
  <div class="connector-filter">
    <el-dropdown trigger="click" :hide-on-click="false" :teleported="false" @visible-change="onDropdownVisibleChange">
      <span class="filter-trigger" :class="{ active: selectedConnectors.length > 0 }">
        <k-icon name="link"></k-icon>
        <span class="trigger-text">连接器</span>
        <span v-if="selectedConnectors.length > 0" class="count-badge">{{ selectedConnectors.length }}</span>
        <k-icon name="arrow-down" class="arrow-icon"></k-icon>
      </span>
      <template #dropdown>
        <div class="connector-dropdown">
          <!-- 快捷操作 -->
          <div class="dropdown-header">
            <span class="header-title">按连接器筛选</span>
            <span v-if="selectedConnectors.length > 0" class="clear-btn" @click="clearSelection">清除</span>
          </div>

          <!-- 按类型分组 -->
          <div class="connector-groups">
            <template v-for="group in connectorGroups" :key="group.type">
              <div class="group-section" v-if="group.connectors.length > 0">
                <div class="group-header">
                  <span class="group-icon">{{ group.icon }}</span>
                  <span class="group-title">{{ group.title }}</span>
                </div>
                <div class="group-items">
                  <div
                    v-for="connector in group.connectors"
                    :key="connector.id"
                    class="connector-item"
                    :class="{ selected: selectedConnectors.includes(connector.id) }"
                    @click="toggleConnector(connector.id)"
                  >
                    <img
                      v-if="connector.iconUrl"
                      :src="connector.iconUrl"
                      class="connector-icon"
                      :alt="connector.name"
                    />
                    <k-icon v-else name="link" class="connector-icon-fallback"></k-icon>
                    <span class="connector-name">{{ connector.name }}</span>
                    <k-icon v-if="selectedConnectors.includes(connector.id)" name="check" class="check-icon"></k-icon>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ConnectorDefinition } from '../types'

const props = withDefaults(defineProps<{
  /** v-model 绑定值 */
  modelValue: string[]
  /** 所有连接器 */
  connectors: ConnectorDefinition[]
  /** 获取连接器图标 URL 的函数 */
  getIconUrl?: (connector: ConnectorDefinition) => string
}>(), {
  modelValue: () => [],
  connectors: () => [],
  getIconUrl: () => ''
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
  (e: 'change', value: string[]): void
}>()

const selectedConnectors = computed({
  get: () => props.modelValue,
  set: (val) => {
    emit('update:modelValue', val)
    emit('change', val)
  }
})

// 按媒体类型分组连接器
const connectorGroups = computed(() => {
  const groups = [
    { type: 'image', title: '图像', icon: '🖼️', connectors: [] as any[] },
    { type: 'audio', title: '音频', icon: '🔊', connectors: [] as any[] },
    { type: 'video', title: '视频', icon: '🎬', connectors: [] as any[] }
  ]

  for (const connector of props.connectors) {
    const iconUrl = props.getIconUrl?.(connector) || ''
    const item = { ...connector, iconUrl }

    // 根据 supportedTypes 分组
    if (connector.supportedTypes?.includes('image')) {
      groups[0].connectors.push(item)
    } else if (connector.supportedTypes?.includes('audio')) {
      groups[1].connectors.push(item)
    } else if (connector.supportedTypes?.includes('video')) {
      groups[2].connectors.push(item)
    } else {
      // 默认放到图像组
      groups[0].connectors.push(item)
    }
  }

  return groups
})

const toggleConnector = (connectorId: string) => {
  const current = [...selectedConnectors.value]
  const index = current.indexOf(connectorId)
  if (index >= 0) {
    current.splice(index, 1)
  } else {
    current.push(connectorId)
  }
  selectedConnectors.value = current
}

const clearSelection = () => {
  selectedConnectors.value = []
}

const onDropdownVisibleChange = (visible: boolean) => {
  // 可以在这里添加额外逻辑
}
</script>

<style scoped>
.connector-filter {
  display: inline-flex;
}

/* 筛选触发器 - 波普风格 */
.filter-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: var(--ml-radius, 12px);
  border: 2px solid var(--ml-border-color, #451a03);
  background-color: var(--ml-surface, #ffffff);
  color: var(--ml-text, #451a03);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.filter-trigger:hover {
  border-color: var(--ml-primary, #fbbf24);
  background-color: var(--ml-cream, #fffbeb);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--ml-border-color, #451a03);
}

.filter-trigger.active {
  background-color: var(--ml-primary, #fbbf24);
  border-color: var(--ml-border-color, #451a03);
  color: var(--ml-text, #451a03);
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--ml-border-color, #451a03);
}

.trigger-text {
  font-weight: 700;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  font-size: 0.75rem;
  font-weight: 800;
  border-radius: 10px;
  background-color: var(--ml-surface, #ffffff);
  border: 2px solid var(--ml-border-color, #451a03);
}

.filter-trigger.active .count-badge {
  background-color: var(--ml-surface, #ffffff);
}

.arrow-icon {
  font-size: 0.7rem;
  transition: transform 0.2s;
}

/* 下拉面板样式 - 波普风格 */
.connector-dropdown {
  width: 280px;
  max-height: 400px;
  overflow-y: auto;
  padding: 8px 0;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.connector-dropdown:hover {
  scrollbar-color: var(--ml-border-color, #451a03) transparent;
}

.connector-dropdown::-webkit-scrollbar {
  width: 6px;
}

.connector-dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.connector-dropdown::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.connector-dropdown:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color, #451a03);
}

.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 2px solid var(--ml-border-color, #451a03);
  margin-bottom: 8px;
}

.header-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ml-text, #451a03);
}

.clear-btn {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ml-primary-dark, #d97706);
  cursor: pointer;
}

.clear-btn:hover {
  text-decoration: underline;
  color: var(--ml-error, #ef4444);
}

/* 分组样式 */
.group-section {
  margin-bottom: 12px;
}

.group-section:last-child {
  margin-bottom: 0;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ml-text-muted, #92400e);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.group-icon {
  font-size: 0.9rem;
}

.group-items {
  display: flex;
  flex-direction: column;
}

.connector-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.15s;
}

.connector-item:hover {
  background-color: var(--ml-bg-alt, #fef3c7);
}

.connector-item.selected {
  background-color: var(--ml-primary-light, #fde68a);
}

.connector-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  border-radius: 6px;
  border: 2px solid var(--ml-border-color, #451a03);
}

.connector-icon-fallback {
  width: 22px;
  height: 22px;
  color: var(--ml-text-muted, #92400e);
}

.connector-name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ml-text, #451a03);
}

.check-icon {
  color: var(--ml-primary-dark, #d97706);
  font-size: 0.9rem;
}
</style>
