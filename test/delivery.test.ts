import assert from 'node:assert/strict'
import test from 'node:test'
import type { GenerationResult } from '../src/core'
import { formatGenerationResult } from '../src/plugins/koishi-commands/formatters/delivery'

const videoResult: GenerationResult = {
  success: true,
  taskId: 42,
  duration: 2500,
  output: [{ kind: 'video', url: 'https://example.com/result.mp4', mime: 'video/mp4' }]
}

test('video delivery defaults to the original forward format on OneBot', () => {
  const output = formatGenerationResult(videoResult, { platform: 'onebot' })
  assert.match(output, /<message forward>/)
})

test('direct mode sends video without a forward wrapper on every platform', () => {
  for (const platform of ['onebot', 'discord']) {
    const output = formatGenerationResult(videoResult, {
      platform,
      config: { videoDeliveryMode: 'direct' }
    })
    assert.doesNotMatch(output, /<message forward>/)
    assert.match(output, /<video url="https:\/\/example\.com\/result\.mp4"\/>/)
    assert.match(output, /任务「42」/)
  }
})

test('auto mode only sends directly on OneBot-like platforms', () => {
  for (const platform of ['onebot', 'qq', 'red']) {
    const output = formatGenerationResult(videoResult, {
      platform,
      config: { videoDeliveryMode: 'auto' }
    })
    assert.doesNotMatch(output, /<message forward>/)
  }

  const discord = formatGenerationResult(videoResult, {
    platform: 'discord',
    config: { videoDeliveryMode: 'auto' }
  })
  assert.match(discord, /<message forward>/)
})

test('direct delivery keeps link mode as plain URLs', () => {
  const output = formatGenerationResult(videoResult, {
    platform: 'onebot',
    linkModeTag: 'nsfw',
    config: { videoDeliveryMode: 'direct' }
  })
  assert.match(output, /https:\/\/example\.com\/result\.mp4/)
  assert.doesNotMatch(output, /<video /)
})