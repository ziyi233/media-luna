<template>
  <div class="tag-dropdown" ref="dropdownRef">
    <button
      class="dropdown-trigger"
      :class="{ active: isOpen || selectedTags.length > 0 }"
      @click="toggleDropdown"
    >
      <span class="trigger-icon"><k-icon name="tag" /></span>
      <span class="trigger-text">
        {{ selectedTags.length > 0 ? `标签 (${selectedTags.length})` : '标签' }}
      </span>
      <span class="trigger-arrow" :class="{ open: isOpen }">▼</span>
    </button>

    <Transition name="dropdown-fade">
      <div v-if="isOpen" class="dropdown-panel pop-card no-hover">
        <div class="panel-header">
          <span class="panel-title">筛选标签</span>
          <button v-if="selectedTags.length > 0" class="clear-btn" @click="clearAll">
            清除
          </button>
        </div>
        <div class="tags-list pop-scrollbar">
          <label
            v-for="tag in availableTags"
            :key="tag"
            class="tag-option"
            :class="{ selected: selectedTags.includes(tag) }"
          >
            <input
              type="checkbox"
              :checked="selectedTags.includes(tag)"
              @change="toggleTag(tag)"
            />
            <span class="tag-label">{{ tag }}</span>
          </label>
          <div v-if="availableTags.length === 0" class="empty-tags">
            暂无标签
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string[]
  allTags: string[]
  presetTags?: string[]
  maxTags?: number
}>(), {
  modelValue: () => [],
  presetTags: () => [],
  maxTags: 30
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
  (e: 'change', value: string[]): void
}>()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement>()

const selectedTags = computed({
  get: () => props.modelValue,
  set: (val) => {
    emit('update:modelValue', val)
    emit('change', val)
  }
})

// 合并预置标签和动态标签
const availableTags = computed(() => {
  const dynamicTags = props.allTags
    .filter(t => !props.presetTags.includes(t))
    .slice(0, props.maxTags)
  return [...props.presetTags, ...dynamicTags]
})

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const toggleTag = (tag: string) => {
  const current = [...selectedTags.value]
  const index = current.indexOf(tag)
  if (index >= 0) {
    current.splice(index, 1)
  } else {
    current.push(tag)
  }
  selectedTags.value = current
}

const clearAll = () => {
  selectedTags.value = []
}

// 点击外部关闭
const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped lang="scss">
.tag-dropdown {
  position: relative;
  display: inline-flex;
}

.dropdown-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: var(--ml-radius);
  border: 2px solid var(--ml-border-color);
  background-color: var(--ml-surface);
  color: var(--ml-text);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  box-shadow: 2px 2px 0 var(--ml-border-color);
}

.dropdown-trigger:hover {
  border-color: var(--ml-primary);
  background-color: var(--ml-cream);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--ml-border-color);
}

.dropdown-trigger.active {
  background-color: var(--ml-primary);
  border-color: var(--ml-primary-dark);
}

.trigger-icon {
  font-size: 14px;
}

.trigger-text {
  font-weight: 700;
}

.trigger-arrow {
  font-size: 8px;
  transition: transform 0.2s;
}

.trigger-arrow.open {
  transform: rotate(180deg);
}

.dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 180px;
  max-width: 280px;
  z-index: 1000;
  padding: 0;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 2px solid var(--ml-border-color);
  background: var(--ml-bg-alt);
}

.panel-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ml-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.clear-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border: none;
  background: var(--ml-danger);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.clear-btn:hover {
  filter: brightness(1.1);
}

.tags-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tag-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  border: 2px solid transparent;
}

.tag-option:hover {
  background: var(--ml-cream);
}

.tag-option.selected {
  background: var(--ml-primary-light);
  border-color: var(--ml-primary);
}

.tag-option input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--ml-primary-dark);
  cursor: pointer;
}

.tag-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ml-text);
}

.empty-tags {
  padding: 16px;
  text-align: center;
  color: var(--ml-text-muted);
  font-size: 13px;
}

/* 过渡动画 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
