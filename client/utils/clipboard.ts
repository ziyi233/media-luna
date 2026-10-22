/**
 * 复制文本到剪贴板的健壮工具。
 *
 * 优先使用现代 Clipboard API（`navigator.clipboard.writeText`，需要安全上下文
 * Security Context，例如 https 或 localhost）。当 API 不可用 / 非安全上下文 /
 * 写入被拒绝时，降级到传统的 `document.execCommand('copy')`（配合隐藏 textarea）。
 *
 * 修复点：原代码直接 `navigator.clipboard.writeText(...)` 且不 await、无降级、
 * 无失败处理 —— 在 HTTP 或内嵌 iframe（无 `clipboard-write` 权限）场景下会静默失败，
 * 甚至仍弹出“已复制”提示。
 *
 * @param text 要复制的文本
 * @returns Promise<boolean> 是否复制成功
 */
export function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const fallback = () => {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        textarea.style.top = '-9999px'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(textarea)
        resolve(ok)
      } catch {
        resolve(false)
      }
    }

    // 现代 Clipboard API：仅在安全上下文且 API 存在时尝试
    if (typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof window !== 'undefined' &&
        window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => resolve(true))
        .catch(() => fallback())
    } else {
      fallback()
    }
  })
}
