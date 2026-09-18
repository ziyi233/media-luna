/**
 * copyToClipboard 单元测试（简单 mock，无外部测试框架）
 * 运行：npx tsx client/utils/clipboard.test.ts   （或 node --experimental-strip-types）
 */
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { copyToClipboard } from './clipboard'

interface Env {
  secure?: boolean
  clipboard?: boolean
  writeText?: 'resolve' | 'reject'
  execCommand?: boolean
}

// 用 Object.defineProperty 覆盖全局，避免 Node 只读的 navigator 全局无法被直接赋值
function setGlobal(name: string, value: any) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

function setupEnv(opts: Env) {
  let captured: string | undefined
  const writeText = mock.fn((text: string) => {
    captured = text
    return opts.writeText === 'reject'
      ? Promise.reject(new Error('denied'))
      : Promise.resolve()
  })
  const execCommand = mock.fn(() => opts.execCommand !== false)

  setGlobal('window', { isSecureContext: opts.secure === true })
  setGlobal('navigator', {
    clipboard: opts.clipboard === true ? { writeText } : undefined,
  })
  setGlobal('document', {
    createElement: () => ({
      setAttribute: mock.fn(),
      style: {},
      value: '',
      focus: mock.fn(),
      select: mock.fn(),
    }),
    body: { appendChild: mock.fn(), removeChild: mock.fn() },
    execCommand,
  })

  return { writeText, execCommand, captured: () => captured }
}

test('安全上下文且 Clipboard API 可用：使用 writeText', async () => {
  const env = setupEnv({ secure: true, clipboard: true })
  const ok = await copyToClipboard('hello')
  assert.equal(ok, true)
  assert.equal(env.writeText.mock.calls.length, 1)
  assert.equal(env.captured(), 'hello')
  assert.equal(env.execCommand.mock.calls.length, 0)
})

test('非安全上下文：降级到 execCommand', async () => {
  const env = setupEnv({ secure: false, clipboard: true })
  const ok = await copyToClipboard('hello')
  assert.equal(ok, true)
  assert.equal(env.writeText.mock.calls.length, 0)
  assert.equal(env.execCommand.mock.calls.length, 1)
})

test('Clipboard API 写入被拒：降级到 execCommand', async () => {
  const env = setupEnv({ secure: true, clipboard: true, writeText: 'reject' })
  const ok = await copyToClipboard('hello')
  assert.equal(ok, true)
  assert.equal(env.writeText.mock.calls.length, 1)
  assert.equal(env.execCommand.mock.calls.length, 1)
})

test('两者都失败：返回 false', async () => {
  const env = setupEnv({ secure: false, clipboard: false, execCommand: false })
  const ok = await copyToClipboard('hello')
  assert.equal(ok, false)
  assert.equal(env.execCommand.mock.calls.length, 1)
})
