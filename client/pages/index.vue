<template>
  <!-- Media Luna 主容器 -->
  <div class="ml-app" :class="appClasses">
    <!-- 设置向导 -->
    <SetupWizard v-if="showSetupWizard" @complete="handleSetupComplete" />

    <!-- 主界面 -->
    <template v-else>
      <!-- 顶部导航栏 -->
      <header class="ml-header">
        <div class="ml-header-inner">
          <!-- Logo 区域 -->
          <div
            class="brand"
            @mouseenter="showVersionTooltip = true"
            @mouseleave="showVersionTooltip = false"
          >
            <div class="logo">🌙</div>
            <div class="brand-text">
              <h1>Media Luna</h1>
            </div>

            <!-- 版本提示 -->
            <Transition name="tooltip-fade">
              <div v-if="showVersionTooltip" class="version-tooltip pop-card no-hover">
                <div class="version-line">
                  <span>当前版本：</span>
                  <span class="version-num">v{{ versionInfo.current }}</span>
                </div>
                <template v-if="versionInfo.hasUpdate">
                  <div class="version-line has-update">
                    <span>🎉 新版本：</span>
                    <span class="version-num">v{{ versionInfo.latest }}</span>
                  </div>
                </template>
                <template v-else>
                  <div class="version-line up-to-date">✨ 已是最新版本</div>
                </template>
              </div>
            </Transition>

            <!-- 更新按钮 -->
            <button
              v-if="versionInfo.hasUpdate"
              class="update-dot"
              @click="openUpdateLink"
              title="有新版本可用，点击更新"
            >
              <span class="dot-ping"></span>
              <span class="dot-core"></span>
            </button>
          </div>

          <!-- 导航标签 -->
          <nav class="nav-tabs">
            <button
              v-for="item in menuItems"
              :key="item.id"
              class="nav-tab"
              :class="{ active: currentView === item.id }"
              @click="currentView = item.id"
            >
              <span class="tab-emoji">{{ item.emoji }}</span>
              <span class="tab-label">{{ item.label }}</span>
            </button>
          </nav>

          <!-- 右侧工具栏 -->
          <div class="header-actions">
            <!-- 帮助按钮 -->
            <button
              class="action-btn"
              @click="openHelp"
              title="查看使用帮助"
            >
              ❓
            </button>
            <!-- 朴素模式切换 -->
            <button
              class="action-btn plain-toggle"
              :class="{ active: plainMode }"
              @click="togglePlainMode"
              :title="plainMode ? '切换到波普风格' : '切换到朴素模式'"
            >
              {{ plainMode ? '🎨' : '📐' }}
            </button>
            <!-- 主题切换 -->
            <button
              class="action-btn theme-toggle"
              @click="toggleTheme"
              :title="`切换主题 (当前: ${currentTheme.label})`"
            >
              {{ currentTheme.icon }}
            </button>
          </div>
        </div>
        <!-- 手绘分割线 -->
        <div class="header-separator"></div>
      </header>

      <!-- 主内容区域 -->
      <main class="ml-main">
        <div class="ml-container">
          <keep-alive>
            <component :is="activeComponent" />
          </keep-alive>
        </div>
      </main>
    </template>

    <!-- Teleport 容器：用于 Lightbox、Dialog 等组件（放在最外层确保始终存在） -->
    <div id="ml-teleport-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, reactive } from 'vue'
import ChannelsView from '../components/ChannelsView.vue'
import PresetsView from '../components/PresetsView.vue'
import TasksView from '../components/TasksView.vue'
import GenerateView from '../components/GenerateView.vue'
import SettingsView from '../components/SettingsView.vue'
import SetupWizard from '../components/SetupWizard.vue'
import { setupApi, versionApi } from '../api'

const currentView = ref('generate')
const showSetupWizard = ref(false)
const showVersionTooltip = ref(false)

// 主题切换
const themes = [
  { id: 'material', icon: '⚪', label: '简约' },
  { id: 'nailong', icon: '☀️', label: '奶龙' },
  { id: 'sakura', icon: '🌸', label: '樱花' },
  { id: 'matcha', icon: '🍵', label: '抹茶' },
  { id: 'manga', icon: '✒️', label: '水墨' }
]

const currentThemeIndex = ref(0)
const currentTheme = computed(() => themes[currentThemeIndex.value])

// 朴素模式
const plainMode = ref(false)

// 应用的 CSS 类
const appClasses = computed(() => {
  const classes = [`theme-${currentTheme.value.id}`]
  if (plainMode.value) {
    classes.push('theme-plain')
  }
  return classes
})

const toggleTheme = () => {
  currentThemeIndex.value = (currentThemeIndex.value + 1) % themes.length
  localStorage.setItem('ml-theme', currentTheme.value.id)
}

const togglePlainMode = () => {
  plainMode.value = !plainMode.value
  localStorage.setItem('ml-plain-mode', plainMode.value ? 'true' : 'false')
}

// 初始化主题
const initTheme = () => {
  const saved = localStorage.getItem('ml-theme')
  const index = themes.findIndex(t => t.id === saved)
  if (index !== -1) {
    currentThemeIndex.value = index
  }
  // 初始化朴素模式
  const savedPlainMode = localStorage.getItem('ml-plain-mode')
  plainMode.value = savedPlainMode === 'true'
}

// 版本信息
const versionInfo = reactive({
  current: '0.0.0',
  latest: '0.0.0',
  hasUpdate: false,
  npmUrl: ''
})

// 检查版本更新
const checkVersion = async () => {
  try {
    const info = await versionApi.check()
    versionInfo.current = info.current
    versionInfo.latest = info.latest
    versionInfo.hasUpdate = info.hasUpdate
    versionInfo.npmUrl = info.npmUrl
  } catch (e) {
    console.error('Failed to check version:', e)
  }
}

// 打开更新链接
const openUpdateLink = () => {
  window.location.href = '/dependencies'
}

// 打开帮助文档
const openHelp = () => {
  window.open('https://github.com/ziyi233/media-luna#readme', '_blank')
}

// 检查设置状态
const checkSetupStatus = async () => {
  try {
    const status = await setupApi.status()
    showSetupWizard.value = status.needsSetup
  } catch (e) {
    console.error('Failed to check setup status:', e)
    showSetupWizard.value = false
  }
}

// 设置完成
const handleSetupComplete = () => {
  showSetupWizard.value = false
}

const activeComponent = computed(() => {
  switch (currentView.value) {
    case 'generate': return GenerateView
    case 'channels': return ChannelsView
    case 'presets': return PresetsView
    case 'tasks': return TasksView
    case 'settings': return SettingsView
    default: return GenerateView
  }
})

const menuItems = [
  { id: 'generate', label: '生成', emoji: '🎨' },
  { id: 'channels', label: '渠道', emoji: '🔗' },
  { id: 'presets', label: '预设', emoji: '📦' },
  { id: 'tasks', label: '任务', emoji: '📋' },
  { id: 'settings', label: '设置', emoji: '⚙️' },
]

// 隐藏 Koishi 默认头部
let prevHeaderDisplay = ''
function hideHeader() {
  const el = document.querySelector('.layout-header') as HTMLElement
  if (el) { prevHeaderDisplay = el.style.display; el.style.display = 'none' }
}
function restoreHeader() {
  const el = document.querySelector('.layout-header') as HTMLElement
  if (el) el.style.display = prevHeaderDisplay || ''
}

onMounted(() => {
  hideHeader()
  initTheme()
  checkSetupStatus()
  checkVersion()
})
onBeforeUnmount(() => {
  restoreHeader()
})
</script>

<style lang="scss">
@use '../styles/theme.scss';
</style>

<style scoped lang="scss">
/* ============ 应用容器 ============ */
.ml-app {
  /* 关键：使用 absolute 定位填满父容器 */
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 0;
}

/* ============ 顶部导航栏 ============ */
.ml-header {
  flex-shrink: 0;
  height: 56px;
  background: var(--ml-header-bg, var(--ml-surface));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  /* border-bottom: var(--ml-border); */
  /* box-shadow: 0 3px 0 var(--ml-border-color); */ /* Removed for hand-drawn style */
  position: relative;
  z-index: 10;
}

.header-separator {
  position: absolute;
  bottom: -4px;
  left: 2%;
  width: 96%;
  height: 8px;
  background-color: var(--ml-border-color);
  opacity: 0.6;
  
  /* 波浪线遮罩 */
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='8' viewBox='0 0 20 8'%3E%3Cpath d='M0,4 Q5,8 10,4 T20,4' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='8' viewBox='0 0 20 8'%3E%3Cpath d='M0,4 Q5,8 10,4 T20,4' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E");
  -webkit-mask-repeat: repeat-x;
  mask-repeat: repeat-x;
  -webkit-mask-size: 20px 100%;
  mask-size: 20px 100%;

  /* 边缘渐变消失 (Composite Mask) */
  /* 既然 mask-composite 兼容性复杂，这里使用伪元素来实现渐变遮挡可能更稳妥，或者直接保留这种居中悬浮感 */
  /* 尝试使用 CSS mask 的多重背景 */
  mask-image: 
    linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='8' viewBox='0 0 20 8'%3E%3Cpath d='M0,4 Q5,8 10,4 T20,4' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E");
  -webkit-mask-image: 
    linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='8' viewBox='0 0 20 8'%3E%3Cpath d='M0,4 Q5,8 10,4 T20,4' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E");
  
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}

.ml-header-inner {
  max-width: 1400px;
  height: 100%;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

/* Logo 区域 */
.brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: default;
  flex-shrink: 0;

  .logo {
    font-size: 22px;
    width: 38px;
    height: 38px;
    background: var(--ml-primary);
    border: 2px solid var(--ml-border-color);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 2px 2px 0 var(--ml-border-color);
  }

  .brand-text {
    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 900;
      color: var(--ml-text);
      line-height: 1;
      letter-spacing: -0.5px;
    }
  }
}

/* 更新指示点 */
.update-dot {
  position: relative;
  width: 12px;
  height: 12px;
  margin-left: 4px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;

  .dot-core {
    position: absolute;
    inset: 0;
    background: var(--ml-error);
    border-radius: 50%;
  }

  .dot-ping {
    position: absolute;
    inset: -2px;
    background: var(--ml-error);
    border-radius: 50%;
    animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
    opacity: 0.75;
  }
}

@keyframes ping {
  75%, 100% {
    transform: scale(2);
    opacity: 0;
  }
}

/* 版本提示 */
.version-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 1000;
  padding: 10px 14px;
  font-size: 12px;
  white-space: nowrap;

  .version-line {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--ml-text-muted);
    font-weight: 600;

    &:not(:last-child) {
      margin-bottom: 4px;
    }
  }

  .version-num {
    color: var(--ml-text);
    font-weight: 700;
    font-family: monospace;
  }

  .has-update {
    color: var(--ml-primary-dark);
  }

  .up-to-date {
    color: var(--ml-success);
  }
}

.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 导航标签 */
.nav-tabs {
  display: flex;
  gap: 4px;
  margin-left: auto;
  background: var(--ml-bg-alt);
  padding: 4px;
  border-radius: 12px;
  border: 2px solid var(--ml-border-color);
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--ml-text-muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s;

  .tab-emoji {
    font-size: 14px;
  }

  &:hover {
    color: var(--ml-text);
    background: var(--ml-surface);
  }

  &.active {
    color: var(--ml-text);
    background: var(--ml-primary);
    box-shadow: 2px 2px 0 var(--ml-border-color);
  }
}

/* 右侧工具栏 */
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--ml-border-color);
  background: var(--ml-surface);
  border-radius: 10px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.15s;

  &:hover {
    background: var(--ml-cream);
    transform: translateY(-1px);
    box-shadow: 2px 2px 0 var(--ml-border-color);
  }

  &.theme-toggle:hover {
    background: var(--ml-primary-light);
  }
}

/* ============ 主内容区域 ============ */
.ml-main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ml-container {
  max-width: 1400px;
  height: 100%;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

/* ============ 暗色主题 ============ */
/* 
 * 这里的样式已移至 theme.scss 统一管理
 * 保留此类名以供 Vue 逻辑切换
 */
.dark-theme {
}
</style>
