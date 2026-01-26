<template>
  <div class="image-upload">
    <!-- 已上传的图片列表 -->
    <div class="image-list" v-if="images.length > 0">
      <div v-for="(img, index) in images" :key="img.url || index" class="image-item">
        <div class="image-preview">
          <img v-if="img.mime.startsWith('image/')" :src="img.previewUrl" :alt="img.filename" />
          <video v-else-if="img.mime.startsWith('video/')" :src="img.previewUrl" class="video-preview"></video>
          <div v-else class="unknown-file">❓</div>
          <div class="image-overlay">
            <k-button size="mini" class="remove-btn" @click.stop="removeImage(index)">
              <template #icon><k-icon name="delete"></k-icon></template>
            </k-button>
          </div>
        </div>
        <div class="image-name">{{ img.filename }}</div>
      </div>
    </div>

    <!-- 上传按钮 -->
    <div class="upload-area" @click="triggerUpload" @dragover.prevent @drop.prevent="handleDrop">
      <input
        ref="fileInput"
        type="file"
        accept="image/*,video/*"
        multiple
        style="display: none"
        @change="handleFileSelect"
      />
      <div class="upload-content">
        <k-icon name="add" class="upload-icon"></k-icon>
        <span class="upload-text">点击或拖拽上传图片/视频</span>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="uploading" class="upload-loading">
      <k-icon name="sync" class="loading-icon"></k-icon>
      上传中...
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { message } from '@koishijs/client'
import { cacheApi } from '../api'

export interface UploadedImage {
  url: string       // 缓存 URL（用于存储和 emit）
  filename: string
  mime: string
  previewUrl: string  // 预览 URL（可能与 url 相同，或是 data URL）
}

const props = defineProps<{
  modelValue: string[]  // 缓存 URL 列表
  maxCount?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
}>()

const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const images = ref<UploadedImage[]>([])

// 加载已有图片（从 URL 列表）
const loadImages = async () => {
  const newImages: UploadedImage[] = []

  for (const url of props.modelValue) {
    // 跳过空值
    if (!url) continue

    // 推断 mime type
    let mime = 'image/png'
    if (url.match(/\.(mp4|webm|mov|mkv)$/i)) mime = 'video/mp4'

    // 所有非空 URL 都应该可用（包括相对路径、http/https）
    newImages.push({
      url,
      filename: url.split('/').pop()?.split('?')[0] || (mime.startsWith('video/') ? 'video' : 'image'),
      mime,
      previewUrl: url
    })
  }

  images.value = newImages
}

// 监听 modelValue 变化
watch(() => props.modelValue, () => {
  loadImages()
}, { immediate: true })

// 触发文件选择
const triggerUpload = () => {
  fileInput.value?.click()
}

// 处理文件选择
const handleFileSelect = async (e: Event) => {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return

  await uploadFiles(Array.from(input.files))
  input.value = '' // 清空以便再次选择同一文件
}

// 处理拖拽
const handleDrop = async (e: DragEvent) => {
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  await uploadFiles(Array.from(files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')))
}

// 上传文件
const uploadFiles = async (files: File[]) => {
  if (files.length === 0) return

  const maxCount = props.maxCount || 10
  if (images.value.length + files.length > maxCount) {
    message.warning(`最多上传 ${maxCount} 张图片`)
    files = files.slice(0, maxCount - images.value.length)
  }

  uploading.value = true

  try {
    for (const file of files) {
      // 读取文件为 base64
      const base64 = await fileToBase64(file)

      // 上传到缓存，获取 URL
      const result = await cacheApi.upload(base64, file.type, file.name)

      if (!result.url) {
        message.error('缓存服务未配置 selfUrl，无法获取图片 URL')
        continue
      }

      images.value.push({
        url: result.url,
        filename: result.filename,
        mime: result.mime,
        previewUrl: result.url  // 使用缓存 URL 作为预览
      })
    }

    // 更新 modelValue（emit URL 列表）
    emit('update:modelValue', images.value.map(img => img.url))

  } catch (e) {
    message.error('上传失败')
    console.error(e)
  } finally {
    uploading.value = false
  }
}

// 文件转 base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // 移除 data:xxx;base64, 前缀
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 删除图片
const removeImage = (index: number) => {
  images.value.splice(index, 1)
  emit('update:modelValue', images.value.map(img => img.url))
}

onMounted(() => {
  loadImages()
})
</script>

<style scoped>
/* 图片上传 - 波普风格 */
.image-upload {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.image-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.image-item {
  width: 80px;
}

.image-preview {
  width: 80px;
  height: 80px;
  border-radius: var(--ml-radius-sm, 8px);
  overflow: hidden;
  position: relative;
  border: 2px solid var(--ml-border-color, #451a03);
  background-color: var(--ml-surface, #ffffff);
  box-shadow: 2px 2px 0 var(--ml-border-color, #451a03);
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(69, 26, 3, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.image-preview:hover .image-overlay {
  opacity: 1;
}

.remove-btn {
  background-color: var(--ml-error, #ef4444) !important;
  color: white !important;
  border: 2px solid var(--ml-border-color, #451a03) !important;
}

.image-name {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ml-text-secondary, #92400e);
  margin-top: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.upload-area {
  border: 3px dashed var(--ml-border-color, #451a03);
  border-radius: var(--ml-radius, 12px);
  padding: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: var(--ml-bg-alt, #fef3c7);
}

.upload-area:hover {
  border-color: var(--ml-primary, #fbbf24);
  background-color: var(--ml-primary-light, #fde68a);
  transform: translate(-1px, -1px);
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: var(--ml-text-secondary, #92400e);
}

.upload-icon {
  font-size: 1.5rem;
  color: var(--ml-primary-dark, #d97706);
}

.upload-text {
  font-size: 0.85rem;
  font-weight: 600;
}

.upload-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--ml-text-secondary, #92400e);
  font-size: 0.85rem;
  font-weight: 600;
}

.loading-icon {
  animation: spin 1s linear infinite;
  color: var(--ml-primary-dark, #d97706);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.video-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
