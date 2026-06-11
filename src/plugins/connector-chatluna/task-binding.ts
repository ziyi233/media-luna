export type ChatLunaTaskBindingStatus = 'pending' | 'processing' | 'success' | 'failed'

export interface ChatLunaTaskBinding {
  conversationId: string
  messageId: string
  taskId: number
  status: ChatLunaTaskBindingStatus
  channelName?: string
  createdAt: number
  updatedAt: number
}

const BINDING_TTL_MS = 30 * 60 * 1000
const MAX_BINDINGS_PER_CONVERSATION = 20
const RECENT_COMPLETED_RENDER_WINDOW_MS = 5 * 60 * 1000

const bindingsByConversation = new Map<string, Map<string, ChatLunaTaskBinding>>()
const bindingsByTaskId = new Map<number, ChatLunaTaskBinding>()

function ensureConversationMap(conversationId: string): Map<string, ChatLunaTaskBinding> {
  let store = bindingsByConversation.get(conversationId)
  if (!store) {
    store = new Map()
    bindingsByConversation.set(conversationId, store)
  }
  return store
}

function trimConversationBindings(conversationId: string) {
  const store = bindingsByConversation.get(conversationId)
  if (!store) return

  const now = Date.now()
  const entries = Array.from(store.values())
    .filter((binding) => now - binding.updatedAt <= BINDING_TTL_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_BINDINGS_PER_CONVERSATION)

  store.clear()
  for (const entry of entries) {
    store.set(entry.messageId, entry)
    bindingsByTaskId.set(entry.taskId, entry)
  }

  const allowedTaskIds = new Set(entries.map((entry) => entry.taskId))
  for (const [taskId, binding] of bindingsByTaskId.entries()) {
    if (binding.conversationId === conversationId && !allowedTaskIds.has(taskId)) {
      bindingsByTaskId.delete(taskId)
    }
  }

  if (store.size === 0) {
    bindingsByConversation.delete(conversationId)
  }
}

export function bindChatLunaTask(input: {
  conversationId: string
  messageId: string
  taskId: number
  status: ChatLunaTaskBindingStatus
  channelName?: string
}) {
  const store = ensureConversationMap(input.conversationId)
  const existing = store.get(input.messageId)
  const binding: ChatLunaTaskBinding = {
    conversationId: input.conversationId,
    messageId: input.messageId,
    taskId: input.taskId,
    status: input.status,
    channelName: input.channelName,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now()
  }

  store.set(input.messageId, binding)
  bindingsByTaskId.set(input.taskId, binding)
  trimConversationBindings(input.conversationId)
}

export function updateChatLunaTaskBindingStatus(taskId: number, status: ChatLunaTaskBindingStatus) {
  const binding = bindingsByTaskId.get(taskId)
  if (!binding) return

  binding.status = status
  binding.updatedAt = Date.now()
  const store = bindingsByConversation.get(binding.conversationId)
  if (store) {
    store.set(binding.messageId, binding)
  }
}

export function getChatLunaBindingsForConversation(conversationId: string): ChatLunaTaskBinding[] {
  trimConversationBindings(conversationId)
  const store = bindingsByConversation.get(conversationId)
  if (!store) return []
  return Array.from(store.values()).sort((a, b) => a.updatedAt - b.updatedAt)
}

export function getRenderableChatLunaBindingsForConversation(conversationId: string): ChatLunaTaskBinding[] {
  const now = Date.now()
  return getChatLunaBindingsForConversation(conversationId)
    .filter((binding) => {
      if (binding.status === 'pending' || binding.status === 'processing') return true
      return now - binding.updatedAt <= RECENT_COMPLETED_RENDER_WINDOW_MS
    })
    .slice(-5)
}

export function getChatLunaBindingDebugSnapshot(conversationId: string): Array<{
  messageId: string
  taskId: number
  status: ChatLunaTaskBindingStatus
  updatedAt: number
}> {
  return getChatLunaBindingsForConversation(conversationId).map((binding) => ({
    messageId: binding.messageId,
    taskId: binding.taskId,
    status: binding.status,
    updatedAt: binding.updatedAt
  }))
}

export function clearChatLunaBindingsForConversation(conversationId: string) {
  const store = bindingsByConversation.get(conversationId)
  if (!store) return
  for (const binding of store.values()) {
    bindingsByTaskId.delete(binding.taskId)
  }
  bindingsByConversation.delete(conversationId)
}

export function clearAllChatLunaTaskBindings() {
  bindingsByConversation.clear()
  bindingsByTaskId.clear()
}
