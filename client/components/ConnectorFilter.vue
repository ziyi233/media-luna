<template>
  <div class="connector-filter">
    <el-dropdown trigger="click" :hide-on-click="false" @visible-change="onDropdownVisibleChange">
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

.filter-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 0.85rem;
  border-radius: 16px;
  border: 1px solid var(--k-color-border);
  background-color: transparent;
  color: var(--k-color-text-description);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.filter-trigger:hover {
  border-color: var(--k-color-active);
  color: var(--k-color-active);
}

.filter-trigger.active {
  background-color: var(--k-color-active);
  border-color: var(--k-color-active);
  color: white;
}

.trigger-text {
  font-weight: 500;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 9px;
  background-color: rgba(255, 255, 255, 0.3);
}

.arrow-icon {
  font-size: 0.7rem;
  transition: transform 0.2s;
}

/* 下拉面板样式 */
.connector-dropdown {
  width: 280px;
  max-height: 400px;
  overflow-y: auto;
  padding: 8px 0;
}

.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--k-color-border);
  margin-bottom: 8px;
}

.header-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--k-color-text);
}

.clear-btn {
  font-size: 0.75rem;
  color: var(--k-color-active);
  cursor: pointer;
}

.clear-btn:hover {
  text-decoration: underline;
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
  padding: 4px 16px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--k-color-text-description);
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
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.connector-item:hover {
  background-color: var(--k-color-bg-2);
}

.connector-item.selected {
  background-color: rgba(var(--k-color-active-rgb, 64, 158, 255), 0.1);
}

.connector-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  border-radius: 4px;
}

.connector-icon-fallback {
  width: 20px;
  height: 20px;
  color: var(--k-color-text-description);
}

.connector-name {
  flex: 1;
  font-size: 0.85rem;
  color: var(--k-color-text);
}

.check-icon {
  color: var(--k-color-active);
  font-size: 0.9rem;
}
</style>
