<template>
  <Teleport to="#ml-teleport-container" defer>
    <div v-if="visible" class="modal-overlay" @click.self="close">
      <div class="modal-dialog pop-card no-hover">
        <div class="modal-header">
          <h3>{{ isEdit ? '编辑预设' : '新建预设' }}</h3>
          <button class="modal-close" @click="close">✕</button>
        </div>
        <div class="modal-body pop-scrollbar">
          <div class="form-group">
            <label class="form-label required">名称</label>
            <input
              v-model="form.name"
              :disabled="isEdit && form.source === 'api'"
              class="pop-input"
              placeholder="预设名称"
            />
          </div>

          <div class="form-group">
            <label class="form-label required">Prompt 模板</label>
            <textarea
              v-model="form.promptTemplate"
              class="pop-textarea"
              rows="4"
              placeholder="提示词模板，可用 {prompt} 指定用户输入位置"
            ></textarea>
          </div>

          <div class="form-group" v-if="form.source === 'user' || !isEdit">
            <label class="form-label">缩略图</label>
            <ImageUpload v-model="thumbnailList" :max-count="1" />
          </div>

          <div class="form-group">
            <label class="form-label">参考图</label>
            <ImageUpload v-model="referenceImagesList" :max-count="5" />
          </div>

          <div class="form-divider">
            <span>高级设置</span>
          </div>

          <div class="form-group">
            <label class="form-label">标签</label>
            <TagInput v-model="tagsList" placeholder="添加标签" />
          </div>

          <div class="form-group">
            <label class="form-label">参数覆盖</label>
            <JsonEditor v-model="form.parameterOverrides" :rows="3" />
          </div>

          <div class="form-group inline">
            <label class="form-label">启用</label>
            <label class="toggle-switch">
              <input type="checkbox" v-model="form.enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="pop-btn" @click="close">取消</button>
          <button class="pop-btn primary" @click="handleSubmit" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { PresetData } from '../types'
import { presetApi } from '../api'
import TagInput from './TagInput.vue'
import JsonEditor from './JsonEditor.vue'
import ImageUpload from './ImageUpload.vue'

interface Props {
  visible: boolean
  /** 编辑模式时传入预设数据 */
  preset?: PresetData | null
  /** 预填充数据（用于从其他地方快速创建预设） */
  prefill?: {
    name?: string
    promptTemplate?: string
    thumbnail?: string
    referenceImages?: string[]
    tags?: string[]
  }
}

const props = withDefaults(defineProps<Props>(), {
  preset: null,
  prefill: undefined
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved', preset: PresetData): void
  (e: 'close'): void
}>()

const saving = ref(false)

// 是否编辑模式
const isEdit = computed(() => !!props.preset?.id)

// 表单数据
const form = ref<Partial<PresetData>>({})
const thumbnailList = ref<string[]>([])
const referenceImagesList = ref<string[]>([])
const tagsList = ref<string[]>([])

// 初始化表单
const initForm = () => {
  if (props.preset) {
    // 编辑模式
    form.value = { ...props.preset }
    thumbnailList.value = props.preset.thumbnail ? [props.preset.thumbnail] : []
    referenceImagesList.value = props.preset.referenceImages || []
    tagsList.value = props.preset.tags || []
  } else if (props.prefill) {
    // 预填充模式（保存为预设）
    const defaultTags = ['text2img', 'img2img']
    form.value = {
      name: props.prefill.name || '',
      promptTemplate: props.prefill.promptTemplate || '',
      source: 'user',
      enabled: true,
      tags: props.prefill.tags?.length ? props.prefill.tags : defaultTags,
      referenceImages: props.prefill.referenceImages || [],
      parameterOverrides: {}
    }
    thumbnailList.value = props.prefill.thumbnail ? [props.prefill.thumbnail] : []
    referenceImagesList.value = props.prefill.referenceImages || []
    tagsList.value = props.prefill.tags?.length ? props.prefill.tags : defaultTags
  } else {
    // 新建模式
    const defaultTags = ['text2img', 'img2img']
    form.value = {
      name: '',
      promptTemplate: '',
      source: 'user',
      enabled: true,
      tags: defaultTags,
      referenceImages: [],
      parameterOverrides: {}
    }
    thumbnailList.value = []
    referenceImagesList.value = []
    tagsList.value = defaultTags
  }
}

// 监听 visible 变化初始化表单
watch(() => props.visible, (val) => {
  if (val) {
    initForm()
  }
})

// 监听 preset 变化更新表单
watch(() => props.preset, () => {
  if (props.visible) {
    initForm()
  }
})

const close = () => {
  emit('update:visible', false)
  emit('close')
}

const handleSubmit = async () => {
  if (!form.value.name?.trim()) {
    alert('请输入预设名称')
    return
  }
  if (!form.value.promptTemplate?.trim()) {
    alert('请输入 Prompt 模板')
    return
  }

  saving.value = true
  try {
    // 组装数据
    const data: Partial<PresetData> = {
      ...form.value,
      thumbnail: thumbnailList.value[0] || undefined,
      referenceImages: referenceImagesList.value,
      tags: tagsList.value
    }

    let result: PresetData
    if (isEdit.value && props.preset?.id) {
      result = await presetApi.update(props.preset.id, data)
      alert('保存成功')
    } else {
      result = await presetApi.create(data as PresetData)
      alert('创建成功')
    }
    emit('saved', result)
    close()
  } catch (e) {
    alert(isEdit.value ? '保存失败' : '创建失败')
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss">
@use '../styles/theme.scss';
</style>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 24px;
}

.modal-dialog {
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  animation: modal-pop 0.2s ease-out;
}

@keyframes modal-pop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: var(--ml-border);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--ml-text);
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--ml-text-muted);
  cursor: pointer;
  font-size: 18px;
  border-radius: 8px;
  transition: all 0.15s;
}

.modal-close:hover {
  background: var(--ml-danger);
  color: white;
}

.modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  /* 隐藏式滚动条 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.modal-body:hover {
  scrollbar-color: var(--ml-border-color) transparent;
}

.modal-body::-webkit-scrollbar {
  width: 6px;
}

.modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.modal-body::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
}

.modal-body:hover::-webkit-scrollbar-thumb {
  background-color: var(--ml-border-color);
}

.modal-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: var(--ml-border);
}

/* 表单 */
.form-group {
  margin-bottom: 20px;
}

.form-group.inline {
  display: flex;
  align-items: center;
  gap: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--ml-text);
  margin-bottom: 8px;
}

.form-group.inline .form-label {
  margin-bottom: 0;
}

.form-label.required::after {
  content: " *";
  color: var(--ml-danger);
}

.form-divider {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 24px 0;
}

.form-divider::before,
.form-divider::after {
  content: "";
  flex: 1;
  height: 2px;
  background: var(--ml-border-color);
}

.form-divider span {
  font-size: 12px;
  font-weight: 700;
  color: var(--ml-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* 开关 */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--ml-bg-alt);
  border: 2px solid var(--ml-border-color);
  border-radius: 26px;
  transition: 0.2s;
}

.toggle-slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--ml-text-muted);
  border-radius: 50%;
  transition: 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--ml-primary);
  border-color: var(--ml-primary-dark);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(22px);
  background-color: var(--ml-text);
}
</style>
