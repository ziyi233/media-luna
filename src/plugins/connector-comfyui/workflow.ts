import type { FileData } from '../../core'

const PROMPT_PLACEHOLDER = '{{prompt}}'

export interface PromptInjectionResult {
  workflow: Record<string, any>
  mode: 'placeholder' | 'node' | 'pre-applied'
  replacementCount: number
  nodeId?: string
  inputName?: 'text' | 'prompt'
}

export type PromptInjectionMode = 'inject' | 'pre-applied'

export interface ImageAssignmentPlan {
  imageFiles: FileData[]
  nodeIds: string[]
}

function replacePromptPlaceholders(value: any, prompt: string): { value: any; count: number } {
  if (typeof value === 'string') {
    const parts = value.split(PROMPT_PLACEHOLDER)
    if (parts.length === 1) return { value, count: 0 }
    return {
      value: parts.join(prompt),
      count: parts.length - 1
    }
  }

  if (Array.isArray(value)) {
    let count = 0
    const next = value.map((item) => {
      const replaced = replacePromptPlaceholders(item, prompt)
      count += replaced.count
      return replaced.value
    })
    return { value: next, count }
  }

  if (value && typeof value === 'object') {
    let count = 0
    const next: Record<string, any> = {}
    for (const [key, item] of Object.entries(value)) {
      const replaced = replacePromptPlaceholders(item, prompt)
      next[key] = replaced.value
      count += replaced.count
    }
    return { value: next, count }
  }

  return { value, count: 0 }
}

function resolvePromptInput(node: any): 'text' | 'prompt' | null {
  if (!node?.inputs || typeof node.inputs !== 'object') return null

  for (const inputName of ['text', 'prompt'] as const) {
    if (!Object.prototype.hasOwnProperty.call(node.inputs, inputName)) continue
    const value = node.inputs[inputName]
    if (!Array.isArray(value) && (typeof value === 'string' || value == null)) {
      return inputName
    }
  }

  return null
}

/** 安全地将提示词写入已解析的工作流，不执行 JSON 字符串拼接。 */
export function injectPromptIntoWorkflow(
  workflow: Record<string, any>,
  prompt: string,
  promptNodeId?: string
): PromptInjectionResult {
  const replaced = replacePromptPlaceholders(workflow, prompt)
  if (replaced.count > 0) {
    return {
      workflow: replaced.value,
      mode: 'placeholder',
      replacementCount: replaced.count
    }
  }

  const targetNodeId = String(promptNodeId || '').trim()
  if (targetNodeId) {
    const node = workflow[targetNodeId]
    if (!node) {
      throw new Error(`Prompt 节点不存在：${targetNodeId}`)
    }
    const inputName = resolvePromptInput(node)
    if (!inputName) {
      throw new Error(`Prompt 节点 ${targetNodeId} 没有可写入的 text 或 prompt 文本输入`)
    }
    node.inputs[inputName] = prompt
    return {
      workflow,
      mode: 'node',
      replacementCount: 0,
      nodeId: targetNodeId,
      inputName
    }
  }

  const automaticNodeId = Object.keys(workflow).find((nodeId) => {
    const node = workflow[nodeId]
    return node?.class_type === 'CLIPTextEncode' && resolvePromptInput(node) === 'text'
  })
  if (!automaticNodeId) {
    throw new Error('未找到 {{prompt}} 占位符或可写入的 CLIPTextEncode 节点')
  }

  workflow[automaticNodeId].inputs.text = prompt
  return {
    workflow,
    mode: 'node',
    replacementCount: 0,
    nodeId: automaticNodeId,
    inputName: 'text'
  }
}

/** 根据委托模式注入提示词，或保留上层连接器已经准备好的工作流。 */
export function applyPromptInjectionMode(
  workflow: Record<string, any>,
  prompt: string,
  promptNodeId?: string,
  mode: PromptInjectionMode | string = 'inject'
): PromptInjectionResult {
  if (mode === 'pre-applied') {
    return {
      workflow,
      mode: 'pre-applied',
      replacementCount: 0
    }
  }
  if (mode !== 'inject') {
    throw new Error(`提示词注入模式无效：${String(mode)}，应为 inject 或 pre-applied`)
  }
  return injectPromptIntoWorkflow(workflow, prompt, promptNodeId)
}

export function normalizeImageCount(value: unknown): number {
  if (
    (typeof value === 'string' && value.trim() === '')
    || (typeof value !== 'number' && typeof value !== 'string')
  ) {
    throw new Error(`接受图片数量配置无效：${String(value)}，应为 0 到 3 的整数`)
  }
  const count = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(count) || count < 0 || count > 3) {
    throw new Error(`接受图片数量配置无效：${String(value)}，应为 0 到 3 的整数`)
  }
  return count
}

function hasImageInput(node: any): boolean {
  return node?.class_type === 'LoadImage'
    && node.inputs
    && typeof node.inputs === 'object'
    && Object.prototype.hasOwnProperty.call(node.inputs, 'image')
}

/** 校验输入图片，并在任何上传发生前确定每张图片对应的 LoadImage 节点。 */
export function planImageAssignments(
  workflow: Record<string, any>,
  files: FileData[],
  expectedCountValue: unknown,
  configuredNodeIds: Array<string | undefined>
): ImageAssignmentPlan {
  const expectedCount = normalizeImageCount(expectedCountValue)
  const imageFiles = files.filter((file) => file.mime?.startsWith('image/'))

  if (imageFiles.length !== expectedCount) {
    throw new Error(`图片数量不符：需要 ${expectedCount} 张，实际提供了 ${imageFiles.length} 张`)
  }

  for (let index = 0; index < imageFiles.length; index++) {
    const data = imageFiles[index].data
    if (!data || data.byteLength === 0) {
      throw new Error(`第 ${index + 1} 张图片内容为空`)
    }
  }

  if (expectedCount === 0) {
    return { imageFiles, nodeIds: [] }
  }

  const loadImageNodeIds = Object.keys(workflow).filter((nodeId) => hasImageInput(workflow[nodeId]))
  const usedNodeIds = new Set<string>()
  const nodeIds: Array<string | undefined> = new Array(expectedCount)

  for (let index = 0; index < expectedCount; index++) {
    const nodeId = String(configuredNodeIds[index] || '').trim()
    if (!nodeId) continue

    const node = workflow[nodeId]
    if (!node) {
      throw new Error(`图片 ${index + 1} 的输入节点不存在：${nodeId}`)
    }
    if (!hasImageInput(node)) {
      throw new Error(`图片 ${index + 1} 的输入节点 ${nodeId} 不是有效的 LoadImage 节点`)
    }
    if (usedNodeIds.has(nodeId)) {
      throw new Error(`图片输入节点重复配置：${nodeId}`)
    }

    nodeIds[index] = nodeId
    usedNodeIds.add(nodeId)
  }

  let automaticIndex = 0
  for (let index = 0; index < expectedCount; index++) {
    if (nodeIds[index]) continue
    while (
      automaticIndex < loadImageNodeIds.length
      && usedNodeIds.has(loadImageNodeIds[automaticIndex])
    ) {
      automaticIndex++
    }

    const nodeId = loadImageNodeIds[automaticIndex]
    if (!nodeId) {
      throw new Error(`无法为第 ${index + 1} 张图片找到可用的 LoadImage 节点`)
    }
    nodeIds[index] = nodeId
    usedNodeIds.add(nodeId)
    automaticIndex++
  }

  return { imageFiles, nodeIds: nodeIds as string[] }
}

export function assignUploadedImages(
  workflow: Record<string, any>,
  nodeIds: string[],
  uploadedFilenames: string[]
): void {
  if (nodeIds.length !== uploadedFilenames.length) {
    throw new Error(`图片上传结果数量不符：需要 ${nodeIds.length} 个，实际得到 ${uploadedFilenames.length} 个`)
  }

  for (let index = 0; index < nodeIds.length; index++) {
    workflow[nodeIds[index]].inputs.image = uploadedFilenames[index]
  }
}
