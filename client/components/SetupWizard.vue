<template>
  <div class="setup-wizard">
    <div class="wizard-container">
      <!-- 头部 -->
      <div class="wizard-header">
        <h1>欢迎使用 Media Luna</h1>
        <p>在开始使用前，请完成以下基础配置</p>
      </div>

      <!-- 步骤指示器 -->
      <div class="steps-indicator">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          class="step-item"
          :class="{
            active: currentStep === index,
            completed: currentStep > index
          }"
        >
          <div class="step-number">
            <k-icon v-if="currentStep > index" name="check" />
            <span v-else>{{ index + 1 }}</span>
          </div>
          <span class="step-label">{{ step.label }}</span>
        </div>
      </div>

      <!-- 步骤内容 -->
      <div class="wizard-content">
        <transition name="fade" mode="out-in">
          <!-- 存储配置步骤 -->
          <SetupStorage
            v-if="currentStep === 0"
            key="storage"
            v-model="storageConfig"
            :saving="saving"
            @next="handleStorageNext"
          />

          <!-- 用户绑定步骤 -->
          <SetupAuth
            v-else-if="currentStep === 1"
            key="auth"
            :saving="saving"
            @complete="handleComplete"
          />

          <!-- 完成步骤 -->
          <div v-else-if="currentStep === 2" key="complete" class="step-complete">
            <div class="complete-icon">
              <k-icon name="check-circle" />
            </div>
            <h2>配置完成</h2>
            <p>您已完成 Media Luna 的初始设置，现在可以开始使用了。</p>
            <k-button type="primary" size="large" @click="finishSetup">
              开始使用
            </k-button>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from '@koishijs/client'
import { setupApi } from '../api'
import SetupStorage from './setup/SetupStorage.vue'
import SetupAuth from './setup/SetupAuth.vue'

const emit = defineEmits<{
  (e: 'complete'): void
}>()

// 步骤定义
const steps = [
  { id: 'storage', label: '存储配置' },
  { id: 'auth', label: '用户绑定' },
  { id: 'complete', label: '完成' }
]

// 当前步骤
const currentStep = ref(0)
const saving = ref(false)

// 存储配置（由 SetupStorage 组件动态加载和管理）
const storageConfig = ref<Record<string, any>>({})

// 处理存储配置完成
const handleStorageNext = async () => {
  saving.value = true
  try {
    await setupApi.updateStorageConfig(storageConfig.value)
    message.success('存储配置已保存')
    currentStep.value = 1
  } catch (e) {
    message.error('保存失败: ' + (e instanceof Error ? e.message : '未知错误'))
  } finally {
    saving.value = false
  }
}

// 处理用户绑定完成
const handleComplete = () => {
  currentStep.value = 2
}

// 完成设置
const finishSetup = async () => {
  try {
    await setupApi.complete()
    emit('complete')
  } catch (e) {
    // 忽略错误，直接完成
    emit('complete')
  }
}
</script>

<style scoped>
.setup-wizard {
  /* 只覆盖当前插件区域，不阻碍其他 Koishi 界面访问 */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--ml-bg, #fffbeb);
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: auto;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.setup-wizard:hover {
  scrollbar-color: var(--ml-border-color, #451a03) transparent;
}

.setup-wizard::-webkit-scrollbar {
  width: 6px;
}

.setup-wizard::-webkit-scrollbar-track {
  background: transparent;
}

.setup-wizard::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.setup-wizard:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color, #451a03);
}

.wizard-container {
  width: 100%;
  max-width: 900px;
  padding: 2rem;
  box-sizing: border-box;
}

.wizard-header {
  text-align: center;
  margin-bottom: 2rem;
}

.wizard-header h1 {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--ml-text, #451a03);
  margin: 0 0 0.5rem 0;
}

.wizard-header p {
  color: var(--ml-text-secondary, #92400e);
  margin: 0;
  font-weight: 600;
}

/* 步骤指示器 - 波普风格 */
.steps-indicator {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-bottom: 2rem;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  position: relative;
}

.step-item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: calc(50% + 20px);
  top: 16px;
  width: calc(2rem + 20px);
  height: 3px;
  background: var(--ml-border-color, #451a03);
}

.step-item.completed:not(:last-child)::after {
  background: var(--ml-success, #10b981);
}

.step-number {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.9rem;
  background: var(--ml-surface, #ffffff);
  color: var(--ml-text-muted, #92400e);
  border: 3px solid var(--ml-border-color, #451a03);
  transition: all 0.2s;
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.step-item.active .step-number {
  background: var(--ml-primary, #fbbf24);
  color: var(--ml-text, #451a03);
  border-color: var(--ml-border-color, #451a03);
}

.step-item.completed .step-number {
  background: var(--ml-success, #10b981);
  color: white;
  border-color: var(--ml-border-color, #451a03);
}

.step-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ml-text-muted, #92400e);
}

.step-item.active .step-label {
  color: var(--ml-text, #451a03);
  font-weight: 700;
}

.step-item.completed .step-label {
  color: var(--ml-success, #10b981);
}

/* 步骤内容 - 波普卡片 */
.wizard-content {
  background: var(--ml-surface, #ffffff);
  border: 3px solid var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius-lg, 16px);
  padding: 2rem;
  min-height: 400px;
  box-shadow: var(--ml-shadow, 4px 4px 0 #451a03);
}

/* 完成步骤 */
.step-complete {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3rem 0;
}

.complete-icon {
  font-size: 4rem;
  color: var(--ml-success, #10b981);
  margin-bottom: 1.5rem;
}

.step-complete h2 {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--ml-text, #451a03);
  margin: 0 0 0.75rem 0;
}

.step-complete p {
  color: var(--ml-text-secondary, #92400e);
  margin: 0 0 2rem 0;
  font-weight: 600;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
