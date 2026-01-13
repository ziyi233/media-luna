<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="500px"
    :close-on-click-modal="false"
    :teleported="false"
    @close="handleClose"
  >
    <div class="upload-form">
      <!-- 预览图 -->
      <div class="preview-section" v-if="previewUrl">
        <img :src="previewUrl" class="preview-image" />
      </div>

      <!-- 标题 -->
      <div class="form-item">
        <label class="form-label required">标题</label>
        <el-input
          v-model="form.title"
          placeholder="给作品起个名字"
          maxlength="100"
          show-word-limit
        />
      </div>

      <!-- 分类 -->
      <div class="form-item">
        <label class="form-label">发布到</label>
        <el-radio-group v-model="form.category">
          <el-radio-button value="gallery">画廊</el-radio-button>
          <el-radio-button value="template">模板库</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 作者 -->
      <div class="form-item">
        <label class="form-label">作者</label>
        <el-input
          v-model="form.author"
          placeholder="留空则显示为匿名"
          maxlength="50"
        />
      </div>

      <!-- 描述 -->
      <div class="form-item">
        <label class="form-label">描述</label>
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          placeholder="关于这个作品的更多说明（可选）"
          maxlength="500"
        />
      </div>

      <!-- 标签 -->
      <div class="form-item">
        <label class="form-label">标签</label>
        <el-select
          v-model="form.tags"
          multiple
          filterable
          allow-create
          default-first-option
          :teleported="false"
          placeholder="输入标签后回车添加"
          style="width: 100%"
        >
          <el-option
            v-for="tag in suggestedTags"
            :key="tag"
            :label="tag"
            :value="tag"
          />
        </el-select>
      </div>

      <!-- 提示词预览 -->
      <div class="form-item" v-if="prompt">
        <label class="form-label">Prompt</label>
        <div class="prompt-preview">{{ truncatePrompt(prompt) }}</div>
      </div>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="handleUpload" :disabled="!canUpload">
          上传
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { message } from '@koishijs/client'
import { presetApi } from '../api'

interface Props {
  modelValue: boolean
  /** 上传模式：preset（预设）或 task（任务） */
  mode: 'preset' | 'task'
  /** 预设数据（mode=preset 时必填） */
  presetData?: {
    name: string
    promptTemplate: string
    thumbnail?: string
    tags?: string[]
    referenceImages?: string[]
  }
  /** 任务数据（mode=task 时必填） */
  taskData?: {
    taskId: number
    assetIndex?: number
    imageUrl: string
    prompt: string
    tags?: string[]
  }
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'success': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const uploadConfig = ref<{ uploadUrl: string, defaultAuthor: string, enabled: boolean } | null>(null)

const form = ref({
  title: '',
  category: 'gallery' as 'gallery' | 'template',
  author: '',
  description: '',
  tags: [] as string[]
})

// 建议的标签
const suggestedTags = computed(() => {
  const baseTags = ['txt2img', 'img2img', 'portrait', 'landscape', 'anime', 'realistic', 'abstract']
  const existingTags = props.mode === 'preset' ? props.presetData?.tags : props.taskData?.tags
  if (existingTags) {
    return [...new Set([...existingTags, ...baseTags])]
  }
  return baseTags
})

const dialogTitle = computed(() => {
  return props.mode === 'preset' ? '上传预设到在线库' : '分享到在线预设库'
})

const previewUrl = computed(() => {
  if (props.mode === 'preset') {
    return props.presetData?.thumbnail
  }
  return props.taskData?.imageUrl
})

const prompt = computed(() => {
  if (props.mode === 'preset') {
    return props.presetData?.promptTemplate
  }
  return props.taskData?.prompt
})

const canUpload = computed(() => {
  return form.value.title.trim() && uploadConfig.value?.enabled
})

// 加载上传配置
async function loadUploadConfig() {
  try {
    uploadConfig.value = await presetApi.getUploadConfig()
    if (uploadConfig.value?.defaultAuthor) {
      form.value.author = uploadConfig.value.defaultAuthor
    }
  } catch (e) {
    console.error('Failed to load upload config:', e)
  }
}

// 初始化表单
function initForm() {
  if (props.mode === 'preset' && props.presetData) {
    form.value.title = props.presetData.name
    form.value.tags = props.presetData.tags ? [...props.presetData.tags] : []
    // 如果有参考图，默认选择模板
    if (props.presetData.referenceImages?.length) {
      form.value.category = 'template'
    }
  } else if (props.mode === 'task' && props.taskData) {
    form.value.title = ''
    form.value.tags = props.taskData.tags ? [...props.taskData.tags] : []
  }
}

// 上传（非阻塞式，提交后立即关闭对话框）
async function handleUpload() {
  if (!canUpload.value) return

  // 收集上传数据
  const uploadData = {
    title: form.value.title.trim(),
    category: form.value.category,
    author: form.value.author.trim() || undefined,
    description: form.value.description.trim() || undefined,
    tags: form.value.tags.length > 0 ? form.value.tags : undefined
  }

  // 立即关闭对话框，不阻塞用户操作
  handleClose()
  emit('success')

  // 显示提交中提示
  message.info(`正在上传「${uploadData.title}」...`)

  // 后台异步执行上传
  try {
    if (props.mode === 'preset' && props.presetData) {
      const hasRefImages = props.presetData.referenceImages && props.presetData.referenceImages.length > 0
      await presetApi.upload({
        ...uploadData,
        prompt: props.presetData.promptTemplate,
        imageUrl: props.presetData.thumbnail,
        type: hasRefImages ? 'img2img' : 'txt2img',
        referenceImages: hasRefImages
          ? props.presetData.referenceImages!.map(url => ({ url }))
          : undefined
      })
    } else if (props.mode === 'task' && props.taskData) {
      await presetApi.uploadTask({
        ...uploadData,
        taskId: props.taskData.taskId,
        assetIndex: props.taskData.assetIndex
      })
    }

    message.success(`「${uploadData.title}」上传成功`)
  } catch (e: any) {
    message.error(`「${uploadData.title}」上传失败: ${e.message || '未知错误'}`)
  }
}

function handleClose() {
  visible.value = false
  // 重置表单
  form.value = {
    title: '',
    category: 'gallery',
    author: uploadConfig.value?.defaultAuthor || '',
    description: '',
    tags: []
  }
}

function truncatePrompt(text: string, maxLen = 200): string {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

// 监听显示状态，初始化表单
watch(() => props.modelValue, (val) => {
  if (val) {
    loadUploadConfig()
    initForm()
  }
})

onMounted(() => {
  if (props.modelValue) {
    loadUploadConfig()
    initForm()
  }
})
</script>

<style scoped>
.upload-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preview-section {
  display: flex;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.preview-image {
  max-width: 200px;
  max-height: 150px;
  object-fit: contain;
  border-radius: var(--ml-radius, 12px);
  border: 2px solid var(--ml-border-color, #451a03);
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--ml-text, #451a03);
}

.form-label.required::after {
  content: ' *';
  color: var(--ml-error, #ef4444);
}

.prompt-preview {
  background: var(--ml-bg-alt, #fef3c7);
  padding: 0.75rem;
  border-radius: var(--ml-radius-sm, 8px);
  border: 2px solid var(--ml-border-color, #451a03);
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--ml-text-secondary, #92400e);
  max-height: 80px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.prompt-preview:hover {
  scrollbar-color: var(--ml-border-color, #451a03) transparent;
}

.prompt-preview::-webkit-scrollbar {
  width: 4px;
}

.prompt-preview::-webkit-scrollbar-track {
  background: transparent;
}

.prompt-preview::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 2px;
}

.prompt-preview:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color, #451a03);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
