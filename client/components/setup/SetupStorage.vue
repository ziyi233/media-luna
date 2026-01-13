<template>
  <div class="setup-storage">
    <h3>存储配置</h3>
    <p class="step-desc">选择生成图片的存储方式。推荐使用本地存储或 S3 兼容存储。</p>

    <div v-if="loading" class="loading-state">
      <k-icon name="sync" class="spin" />
      <span>加载配置中...</span>
    </div>

    <template v-else>
      <!-- 使用 ConfigRenderer 渲染配置字段 -->
      <ConfigRenderer
        :fields="fields"
        v-model="localConfig"
      />

      <!-- 警告提示（当选择不使用时） -->
      <div v-if="localConfig.backend === 'none'" class="warning-box">
        <k-icon name="warning" />
        <div>
          <strong>注意</strong>
          <p>选择"不使用"将保留生成服务返回的原始 URL，这些 URL 可能会过期或无法访问。建议配置存储后端以确保图片长期可用。</p>
        </div>
      </div>

      <!-- 测试结果 -->
      <div v-if="testResult" :class="['test-result', testResult.success ? 'success' : 'error']">
        <k-icon :name="testResult.success ? 'check-circle' : 'times-circle'" />
        <div class="test-result-content">
          <strong>{{ testResult.success ? '连接成功' : '连接失败' }}</strong>
          <p>{{ testResult.message }}</p>
          <p v-if="testResult.duration !== undefined" class="test-duration">
            耗时: {{ testResult.duration }}ms
          </p>
        </div>
      </div>
    </template>

    <!-- 操作按钮 -->
    <div class="step-actions">
      <k-button
        v-if="localConfig.backend !== 'none'"
        :loading="testing"
        :disabled="loading || saving"
        @click="handleTest"
      >
        测试连接
      </k-button>
      <k-button type="primary" :loading="saving" :disabled="loading" @click="handleNextClick">
        下一步
      </k-button>
    </div>

    <!-- 上传验证弹窗 -->
    <el-dialog
      v-model="showUploadDialog"
      title="验证存储配置"
      width="500px"
      :close-on-click-modal="false"
      :teleported="false"
      class="upload-verify-dialog"
    >
      <div class="upload-verify-content">
        <p class="verify-desc">请上传一张测试图片，系统将自动验证图片能否正常显示。</p>

        <!-- 上传区域 -->
        <div
          class="upload-area"
          :class="{ dragging: isDragging, 'has-image': !!uploadedImageUrl }"
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop.prevent="handleDrop"
          @click="triggerFileInput"
        >
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            style="display: none"
            @change="handleFileSelect"
          />
          <template v-if="uploadedImageUrl">
            <img
              :src="uploadedImageUrl"
              class="preview-image"
              alt="预览"
              @load="imageLoadSuccess = true"
              @error="handleImageError"
            />
            <div v-if="imageLoadSuccess" class="image-overlay success">
              <k-icon name="check-circle" class="success-icon" />
              <span>图片加载成功，配置正确</span>
            </div>
            <div v-else-if="imageLoadError" class="image-overlay error">
              <k-icon name="times-circle" class="error-icon" />
              <span>图片加载失败，请检查存储访问地址配置</span>
            </div>
            <div v-else class="image-overlay loading">
              <k-icon name="sync" class="spin" />
              <span>验证图片显示中...</span>
            </div>
          </template>
          <template v-else-if="uploading">
            <k-icon name="sync" class="spin upload-icon" />
            <span>上传中...</span>
          </template>
          <template v-else>
            <k-icon name="upload" class="upload-icon" />
            <span>点击或拖拽图片到此处</span>
          </template>
        </div>

        <!-- 上传错误提示 -->
        <div v-if="uploadError" class="upload-error">
          <k-icon name="times-circle" />
          <span>{{ uploadError }}</span>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <k-button @click="showUploadDialog = false">取消</k-button>
          <k-button
            type="primary"
            :disabled="!imageLoadSuccess"
            @click="confirmAndProceed"
          >
            继续
          </k-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { setupApi, cacheApi } from '../../api'
import { message } from '@koishijs/client'
import type { ConfigField } from '../../types'
import ConfigRenderer from '../ConfigRenderer.vue'

const props = defineProps<{
  modelValue: Record<string, any>
  saving: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, any>): void
  (e: 'next'): void
}>()

const loading = ref(true)
const fields = ref<ConfigField[]>([])
const localConfig = ref<Record<string, any>>({})

// 测试状态
const testing = ref(false)
const testResult = ref<{ success: boolean, message: string, backend?: string, duration?: number } | null>(null)

// 上传验证弹窗状态
const showUploadDialog = ref(false)
const uploading = ref(false)
const uploadedImageUrl = ref('')
const uploadError = ref('')
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const imageLoadSuccess = ref(false)
const imageLoadError = ref(false)

// 处理图片加载失败
const handleImageError = () => {
  imageLoadError.value = true
  uploadError.value = '图片无法显示，请检查存储访问地址配置是否正确'
}

// 同步 localConfig 到父组件
watch(localConfig, (newVal) => {
  emit('update:modelValue', { ...newVal })
}, { deep: true })

// 当切换到本地存储时，自动填充外部访问地址
watch(() => localConfig.value.backend, (backend) => {
  if (backend === 'local' && !localConfig.value.publicBaseUrl) {
    const publicPath = localConfig.value.publicPath || '/media-luna/cache'
    localConfig.value.publicBaseUrl = window.location.origin + publicPath
  }
})

// 加载配置字段和当前值
const loadConfig = async () => {
  try {
    loading.value = true
    // 并行获取字段定义和当前配置
    const [fieldsResult, configResult] = await Promise.all([
      setupApi.getStorageFields(),
      setupApi.getStorageConfig()
    ])

    fields.value = fieldsResult

    // 合并当前配置（填充默认值）
    const newConfig: Record<string, any> = { ...props.modelValue }
    for (const field of fieldsResult) {
      if (configResult[field.key] !== undefined) {
        newConfig[field.key] = configResult[field.key]
      } else if (newConfig[field.key] === undefined && field.default !== undefined) {
        newConfig[field.key] = field.default
      }
    }

    // 自动填充本地存储的外部访问地址（使用当前浏览器访问地址）
    if (newConfig.backend === 'local' && !newConfig.publicBaseUrl) {
      const publicPath = newConfig.publicPath || '/media-luna/cache'
      newConfig.publicBaseUrl = window.location.origin + publicPath
    }

    localConfig.value = newConfig
  } catch (e) {
    console.error('Failed to load storage config:', e)
  } finally {
    loading.value = false
  }
}

// 点击下一步按钮
const handleNextClick = async () => {
  // 如果选择"不使用"，直接进入下一步
  if (localConfig.value.backend === 'none') {
    emit('next')
    return
  }

  // 先保存配置
  try {
    await setupApi.updateStorageConfig(localConfig.value)
  } catch (e) {
    message.error('保存配置失败: ' + (e instanceof Error ? e.message : '未知错误'))
    return
  }

  // 显示上传验证弹窗
  showUploadDialog.value = true
  uploadedImageUrl.value = ''
  uploadError.value = ''
  imageLoadSuccess.value = false
  imageLoadError.value = false
}

// 触发文件选择
const triggerFileInput = () => {
  if (uploading.value) return
  fileInputRef.value?.click()
}

// 处理文件选择
const handleFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    uploadFile(file)
  }
  // 清空 input 以便可以再次选择同一文件
  input.value = ''
}

// 处理拖放
const handleDrop = (e: DragEvent) => {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    uploadFile(file)
  } else {
    uploadError.value = '请拖放图片文件'
  }
}

// 上传文件
const uploadFile = async (file: File) => {
  uploading.value = true
  uploadError.value = ''
  uploadedImageUrl.value = ''
  imageLoadSuccess.value = false
  imageLoadError.value = false

  try {
    // 读取文件为 base64
    const reader = new FileReader()
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string
        // 移除 data:xxx;base64, 前缀
        const base64Data = result.split(',')[1]
        resolve(base64Data)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    // 调用上传 API
    const result = await cacheApi.upload(base64, file.type, file.name)

    // 使用返回的 URL 显示图片
    if (result.url) {
      uploadedImageUrl.value = result.url
      message.success('上传成功')
    } else {
      throw new Error('上传成功但未返回有效 URL')
    }
  } catch (e: any) {
    uploadError.value = e.message || '上传失败'
  } finally {
    uploading.value = false
  }
}

// 确认并继续
const confirmAndProceed = () => {
  showUploadDialog.value = false
  emit('next')
}

// 测试存储连接
const handleTest = async () => {
  testing.value = true
  testResult.value = null
  try {
    // 先保存当前配置
    await setupApi.updateStorageConfig(localConfig.value)

    // 再测试连接
    const result = await cacheApi.test()
    testResult.value = {
      success: true,
      message: result.message,
      backend: result.backend,
      duration: result.duration
    }
  } catch (e: any) {
    testResult.value = {
      success: false,
      message: e.message || '测试失败'
    }
  } finally {
    testing.value = false
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.setup-storage h3 {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--ml-text, #451a03);
  margin: 0 0 0.5rem 0;
}

.step-desc {
  color: var(--ml-text-secondary, #92400e);
  margin: 0 0 1.5rem 0;
  font-weight: 600;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem;
  color: var(--ml-text-muted, #92400e);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 警告框 - 波普风格 */
.warning-box {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  margin-top: 1rem;
  background: var(--ml-warning-bg, #ffedd5);
  border: 2px solid var(--ml-warning, #f97316);
  border-radius: var(--ml-radius, 12px);
  color: var(--ml-warning, #f97316);
}

.warning-box strong {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 700;
}

.warning-box p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--ml-text, #451a03);
}

/* 操作按钮 */
.step-actions {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 2px solid var(--ml-border-color, #451a03);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

/* 测试结果 - 波普风格 */
.test-result {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  margin-top: 1rem;
  border-radius: var(--ml-radius, 12px);
  border: 2px solid;
}

.test-result.success {
  background: var(--ml-success-bg, #dcfce7);
  border-color: var(--ml-success, #10b981);
  color: var(--ml-success, #10b981);
}

.test-result.error {
  background: var(--ml-error-bg, #fee2e2);
  border-color: var(--ml-error, #ef4444);
  color: var(--ml-error, #ef4444);
}

.test-result-content {
  flex: 1;
}

.test-result-content strong {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 700;
}

.test-result-content p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--ml-text, #451a03);
}

.test-duration {
  margin-top: 0.25rem !important;
  color: var(--ml-text-secondary, #92400e) !important;
  font-size: 0.85rem !important;
}

/* 上传验证弹窗 */
.upload-verify-content {
  padding: 0.5rem 0;
}

.verify-desc {
  margin: 0 0 1.5rem 0;
  color: var(--ml-text-secondary, #92400e);
  font-size: 0.95rem;
  font-weight: 600;
}

.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 200px;
  border: 3px dashed var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius, 12px);
  background: var(--ml-bg-alt, #fef3c7);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.upload-area:hover {
  border-color: var(--ml-primary, #fbbf24);
  background: var(--ml-primary-light, #fde68a);
}

.upload-area.dragging {
  border-color: var(--ml-primary, #fbbf24);
  background: var(--ml-primary-light, #fde68a);
  box-shadow: inset 0 0 20px rgba(251, 191, 36, 0.3);
}

.upload-area.has-image {
  border-style: solid;
  border-color: var(--ml-success, #10b981);
}

.upload-icon {
  font-size: 2.5rem;
  color: var(--ml-text-muted, #92400e);
}

.preview-image {
  max-width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: var(--ml-radius-sm, 8px);
  border: 2px solid var(--ml-border-color, #451a03);
}

.image-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.75rem;
  background: linear-gradient(transparent, rgba(69, 26, 3, 0.8));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: white;
  font-size: 0.9rem;
  font-weight: 600;
}

.image-overlay.success {
  background: linear-gradient(transparent, rgba(16, 185, 129, 0.85));
}

.image-overlay.error {
  background: linear-gradient(transparent, rgba(239, 68, 68, 0.85));
}

.image-overlay.loading {
  background: linear-gradient(transparent, rgba(69, 26, 3, 0.7));
}

.success-icon {
  color: #dcfce7;
}

.error-icon {
  color: #fee2e2;
}

.upload-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: var(--ml-error-bg, #fee2e2);
  border: 2px solid var(--ml-error, #ef4444);
  border-radius: var(--ml-radius-sm, 8px);
  color: var(--ml-error, #ef4444);
  font-size: 0.9rem;
  font-weight: 600;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
</style>
