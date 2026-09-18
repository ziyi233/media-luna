<template>
  <!-- Media Luna 主容器 -->
  <div class="ml-app" :class="appClasses" :style="userAccentStyle">
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
            <div class="logo">
              <k-icon name="luna-crescent" />
            </div>
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
                    <k-icon name="update" />
                    <span>新版本：</span>
                    <span class="version-num">v{{ versionInfo.latest }}</span>
                  </div>
                </template>
                <template v-else>
                  <div class="version-line up-to-date">已是最新版本</div>
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
              <k-icon :name="item.icon" />
              <span class="tab-label">{{ item.label }}</span>
            </button>
          </nav>

          <!-- 右侧工具栏 -->
          <div class="header-actions">
            <!-- 帮助按钮 -->
            <button class="action-btn" @click="openHelp" title="查看使用帮助">
              <k-icon name="help" />
            </button>

            <!-- 主题预设：统一入口（下拉，固定位置） -->
            <div class="theme-control" ref="themeControlRef">
              <button
                class="action-btn theme-toggle"
                @click="themePopoverOpen = !themePopoverOpen"
                :title="`主题设置 (当前: ${currentTheme.label})`"
              >
                <span class="theme-swatch"></span>
              </button>

              <Transition name="theme-pop">
                <div v-if="themePopoverOpen" class="theme-popover" @click.stop>
                  <div class="theme-popover-title">主题预设</div>
                  <div class="theme-options">
                    <div
                      v-for="t in themes"
                      :key="t.id"
                      class="theme-option"
                      :class="{ active: currentTheme.id === t.id }"
                      @click="selectTheme(t.id)"
                    >
                      <span class="theme-option-swatch" :style="{ background: themeAccent(t.id) }"></span>
                      <span class="theme-option-label">{{ t.label }}</span>
                    </div>
                  </div>

                  <div class="theme-popover-divider"></div>

                  <label class="theme-row" @click="togglePlainMode">
                    <span>朴素模式</span>
                    <span class="mini-toggle" :class="{ on: plainMode }"></span>
                  </label>
                  <label v-if="currentTheme.id === 'obsidian'" class="theme-row" @click="toggleDarkMode">
                    <span>深色模式</span>
                    <span class="mini-toggle" :class="{ on: darkMode }"></span>
                  </label>
                  <label v-if="currentTheme.id === 'obsidian'" class="theme-row">
                    <span>主题色</span>
                    <input type="color" v-model="accentColor" @change="applyAccent" class="color-input" />
                  </label>
                </div>
              </Transition>
            </div>
          </div>
        </div>
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

// 主题预设（Obsidian 为默认，兼容原多主题机制）
const themes = [
  { id: 'obsidian', label: 'Obsidian' },
  { id: 'material', label: '简约' },
  { id: 'nailong', label: '奶龙' },
  { id: 'sakura', label: '樱花' },
  { id: 'matcha', label: '抹茶' },
]
const currentThemeIndex = ref(0)
const currentTheme = computed(() => themes[currentThemeIndex.value])

// 深色模式（仅 Obsidian 生效）
const darkMode = ref(false)
// 朴素模式
const plainMode = ref(false)

// 主题预设下拉
const themePopoverOpen = ref(false)
const themeControlRef = ref<HTMLElement | null>(null)
// 用户自定义主题色（仅 Obsidian）
const accentColor = ref('#8b5cf6')

// 应用的 CSS 类
const appClasses = computed(() => {
  const classes = [`theme-${currentTheme.value.id}`]
  if (plainMode.value) classes.push('theme-plain')
  if (currentTheme.value.id === 'obsidian' && darkMode.value) classes.push('theme-dark')
  return classes
})

const toggleTheme = () => {
  currentThemeIndex.value = (currentThemeIndex.value + 1) % themes.length
  localStorage.setItem('ml-theme', currentTheme.value.id)
}

const toggleDarkMode = () => {
  darkMode.value = !darkMode.value
  localStorage.setItem('ml-dark', darkMode.value ? 'true' : 'false')
}

const togglePlainMode = () => {
  plainMode.value = !plainMode.value
  localStorage.setItem('ml-plain-mode', plainMode.value ? 'true' : 'false')
}

// 选择主题
const selectTheme = (id: string) => {
  const idx = themes.findIndex(t => t.id === id)
  if (idx !== -1) currentThemeIndex.value = idx
  localStorage.setItem('ml-theme', currentTheme.value.id)
}

// 各主题主色（用于下拉色块预览）
const themeAccent = (id: string) => {
  const map: Record<string, string> = {
    material: '#212121',
    nailong: '#fbbf24',
    sakura: '#f472b6',
    matcha: '#84cc16',
  }
  return id === 'obsidian' ? accentColor.value : (map[id] || '#8b5cf6')
}

// —— hex 颜色工具（用于主题色派生主色的深/浅变体）——
const clamp = (n: number) => Math.max(0, Math.min(255, n))
const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '')
  const d = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(d, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => clamp(Math.round(v)).toString(16).padStart(2, '0')).join('')
const mix = (a: number, b: number, t: number) => a + (b - a) * t

// 根据用户主色派生 --ml-primary / primary-dark / primary-light（按深浅模式区分）
const computeAccentStyle = () => {
  const c = hexToRgb(accentColor.value)
  if (darkMode.value) {
    // 深色：primary-light 用深色变体（选中/激活底），primary-dark 用更亮变体（文字/悬停）
    const light = rgbToHex(mix(c.r, 27, 0.5), mix(c.g, 27, 0.5), mix(c.b, 31, 0.5))
    const soft = rgbToHex(mix(c.r, 27, 0.3), mix(c.g, 27, 0.3), mix(c.b, 31, 0.3))
    const dark = rgbToHex(mix(c.r, 255, 0.28), mix(c.g, 255, 0.28), mix(c.b, 255, 0.28))
    return {
      '--ml-primary': accentColor.value,
      '--ml-primary-dark': dark,
      '--ml-primary-light': light,
      '--ml-primary-soft': soft,
    }
  }
  // 浅色：primary-light 变浅，primary-dark 变深
  const dark = rgbToHex(mix(c.r, 0, 0.25), mix(c.g, 0, 0.25), mix(c.b, 0, 0.25))
  const light = rgbToHex(mix(c.r, 255, 0.82), mix(c.g, 255, 0.82), mix(c.b, 255, 0.82))
  const soft = rgbToHex(mix(c.r, 255, 0.55), mix(c.g, 255, 0.55), mix(c.b, 255, 0.55))
  return {
    '--ml-primary': accentColor.value,
    '--ml-primary-dark': dark,
    '--ml-primary-light': light,
    '--ml-primary-soft': soft,
  }
}
const userAccentStyle = computed(() => {
  if (currentTheme.value.id !== 'obsidian') return {}
  return computeAccentStyle()
})
// 主题色变化时持久化
const applyAccent = () => {
  localStorage.setItem('ml-accent', accentColor.value)
}

// 初始化主题：优先本地偏好，否则深色跟随系统
const initTheme = () => {
  const savedTheme = localStorage.getItem('ml-theme')
  const tIndex = themes.findIndex(t => t.id === savedTheme)
  if (tIndex !== -1) currentThemeIndex.value = tIndex
  const savedDark = localStorage.getItem('ml-dark')
  if (savedDark !== null) {
    darkMode.value = savedDark === 'true'
  } else {
    darkMode.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  plainMode.value = localStorage.getItem('ml-plain-mode') === 'true'
  const savedAccent = localStorage.getItem('ml-accent')
  if (savedAccent) accentColor.value = savedAccent
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
  { id: 'generate', label: '生成', icon: 'generate' },
  { id: 'channels', label: '渠道', icon: 'channels' },
  { id: 'presets', label: '预设', icon: 'presets' },
  { id: 'tasks', label: '任务', icon: 'tasks' },
  { id: 'settings', label: '设置', icon: 'settings' },
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

// 点击主题下拉外部时关闭
function onDocClick(e: MouseEvent) {
  if (themeControlRef.value && !themeControlRef.value.contains(e.target as Node)) {
    themePopoverOpen.value = false
  }
}

onMounted(() => {
  hideHeader()
  initTheme()
  checkSetupStatus()
  checkVersion()
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  restoreHeader()
  document.removeEventListener('click', onDocClick)
})
</script>

<style lang="scss">
@use '../styles/theme.scss';
</style>

<style scoped lang="scss">
/* ============ 应用容器 ============ */
.ml-app {
  /* 固定定位：不能依赖 body / #app 的百分比高度——控制台里任一插件的全局样式
     （如 chatluna-sandbox 的 `html,body,#app{min-height:100%}`）都会把它压成 0，
     整个界面就此不可见。同时对齐控制台内容区，避开左侧活动栏与底部状态栏。 */
  position: fixed;
  top: 0;
  left: var(--activity-width, 4rem);
  right: 0;
  bottom: var(--footer-height, 1.75rem);
  width: auto;
  height: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 0;
}

/* 控制台在窄屏隐藏状态栏，这里同步收回底部留白 */
@media screen and (max-width: 768px) {
  .ml-app {
    bottom: 0;
  }
}

/* ============ 顶部导航栏 ============ */
.ml-header {
  flex-shrink: 0;
  height: 56px;
  background: var(--ml-header-bg, var(--ml-surface));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--ml-border-color);
  position: relative;
  z-index: 10;
}

.ml-header-inner {
  max-width: 1400px;
  height: 100%;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 20px;
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
    width: 34px;
    height: 34px;
    background: var(--ml-primary-light);
    color: var(--ml-primary);
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;

    .k-icon {
      width: 20px;
      height: 20px;
    }
  }

  .brand-text {
    h1 {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
      color: var(--ml-text);
      line-height: 1;
      letter-spacing: -0.3px;
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
  top: calc(100% + 10px);
  left: 0;
  z-index: 1000;
  padding: 10px 14px;
  font-size: 12px;
  white-space: nowrap;
  box-shadow: var(--ml-shadow-lg);
  border: 1px solid var(--ml-border-color);

  .version-line {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ml-text-muted);
    font-weight: 500;

    .k-icon {
      width: 14px;
      height: 14px;
    }

    &:not(:last-child) {
      margin-bottom: 4px;
    }
  }

  .version-num {
    color: var(--ml-text);
    font-weight: 600;
    font-family: "SFMono-Regular", Consolas, monospace;
  }

  .has-update {
    color: var(--ml-primary);
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
  gap: 2px;
  margin-left: auto;
  background: var(--ml-bg-alt);
  padding: 3px;
  border-radius: 10px;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border: none;
  background: transparent;
  color: var(--ml-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 7px;
  transition: background-color 0.15s, color 0.15s, box-shadow 0.15s;

  .k-icon {
    width: 15px;
    height: 15px;
  }

  &:hover {
    color: var(--ml-text);
    background: var(--ml-surface);
  }

  &.active {
    color: var(--ml-primary);
    background: var(--ml-surface);
    box-shadow: 0 1px 2px rgba(30, 33, 38, 0.08);
  }
}

/* 右侧工具栏 */
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--ml-text-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;

  .k-icon {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: var(--ml-bg-alt);
    color: var(--ml-text);
  }

  &.theme-toggle:hover {
    background: var(--ml-primary-light);
    color: var(--ml-primary);
  }

  &.active {
    color: var(--ml-primary);
  }
}

/* 主题色块指示（颜色随当前主题令牌变化） */
.theme-swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--ml-primary);
  display: inline-block;
}

/* ============ 主题预设下拉 ============ */
.theme-control {
  position: relative;
}

.theme-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 1000;
  width: 240px;
  background: var(--ml-surface);
  border: 1px solid var(--ml-border-color);
  border-radius: var(--ml-radius-lg);
  box-shadow: var(--ml-shadow-lg);
  padding: 12px;
  overflow: hidden;
}

.theme-popover-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ml-text-muted);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.theme-options {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: var(--ml-radius);
  cursor: pointer;
  color: var(--ml-text-secondary);
  transition: background-color 0.15s, color 0.15s;
}

.theme-option:hover {
  background: var(--ml-bg-alt);
  color: var(--ml-text);
}

.theme-option.active {
  background: var(--ml-primary-light);
  color: var(--ml-primary);
}

.theme-option-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}

.theme-option-label {
  font-size: 13px;
  font-weight: 500;
}

.theme-popover-divider {
  height: 1px;
  background: var(--ml-border-color);
  margin: 8px 0;
}

.theme-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ml-text-secondary);
  border-radius: var(--ml-radius);
  cursor: pointer;
  transition: background-color 0.15s;
}

.theme-row:hover {
  background: var(--ml-bg-alt);
}

.mini-toggle {
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: 999px;
  background: var(--ml-bg-alt);
  border: 1px solid var(--ml-border-color);
  transition: background-color 0.2s, border-color 0.2s;
  flex-shrink: 0;
}

.mini-toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--ml-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s;
}

.mini-toggle.on {
  background: var(--ml-primary);
  border-color: var(--ml-primary);
}

.mini-toggle.on::after {
  transform: translateX(16px);
}

.color-input {
  width: 34px;
  height: 22px;
  border: 1px solid var(--ml-border-color);
  border-radius: var(--ml-radius-sm);
  background: transparent;
  padding: 1px;
  cursor: pointer;
}

.theme-pop-enter-active,
.theme-pop-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.theme-pop-enter-from,
.theme-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
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
</style>
