import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultVideoDurationEnhancerConfig } from '../src/plugins/video-duration-enhancer/config'
import { resolveDuration } from '../src/plugins/video-duration-enhancer/middleware'

function context(parameters: Record<string, any>, prompt: string, connectorConfig: Record<string, any>) {
  return {
    parameters,
    prompt,
    channel: {
      tags: ['text2video'],
      connectorId: 'example-video',
      connectorConfig
    }
  } as any
}

test('explicit command duration wins over prompt and channel defaults', () => {
  const result = resolveDuration(
    context({ duration: 8 }, 'a 5s clip', { duration: 3 }),
    defaultVideoDurationEnhancerConfig
  )
  assert.deepEqual(result, { seconds: 8, source: 'parameter' })
})

test('prompt duration wins over channel defaults', () => {
  const result = resolveDuration(
    context({}, 'a 5秒 clip', { duration: 3 }),
    defaultVideoDurationEnhancerConfig
  )
  assert.deepEqual(result, { seconds: 5, token: '5秒', source: 'prompt' })
})

test('duration can be derived from frame count and frame rate', () => {
  const result = resolveDuration(
    context({}, 'clip', { numFrames: 121, frameRate: 24 }),
    defaultVideoDurationEnhancerConfig
  )
  assert.deepEqual(result, { seconds: 5, source: 'channel-frames' })
})
