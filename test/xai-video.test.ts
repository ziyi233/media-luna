import assert from 'node:assert/strict'
import test from 'node:test'
import type { FileData } from '../src/core'
import {
  buildXaiVideoRequest,
  parseXaiCompletedResponse,
  resolveXaiEndpoint,
  resolveXaiMode
} from '../src/plugins/connector-xai-video/connector'

function file(mime: string, filename: string): FileData {
  const data = Uint8Array.from([1, 2, 3])
  return {
    data: data.buffer,
    mime,
    filename
  }
}

const image = () => file('image/png', 'reference.png')
const video = () => file('video/mp4', 'source.mp4')
const config = {
  apiUrl: 'https://api.x.ai/v1',
  model: 'grok-imagine-video',
  mode: 'auto',
  duration: 6,
  aspectRatio: '16:9',
  resolution: '480p'
}

test('resolves xAI endpoints from versioned and unversioned bases', () => {
  assert.equal(resolveXaiEndpoint('https://api.x.ai/v1/', '/videos/generations'), 'https://api.x.ai/v1/videos/generations')
  assert.equal(resolveXaiEndpoint('https://proxy.example', '/videos/generations'), 'https://proxy.example/v1/videos/generations')
})

test('auto mode maps text, one image, and multiple images safely', () => {
  assert.equal(resolveXaiMode('auto', undefined, []), 'text')
  assert.equal(resolveXaiMode('auto', undefined, [image()]), 'image')
  assert.equal(resolveXaiMode('auto', undefined, [image(), image()]), 'reference')
})

test('auto mode refuses ambiguous video input', () => {
  assert.throws(
    () => resolveXaiMode('auto', undefined, [video()]),
    /--mode edit.*--mode extend/
  )
})

test('image and reference requests use the generation endpoint', () => {
  const imageRequest = buildXaiVideoRequest(config.apiUrl, config, [image()], 'move')
  assert.equal(imageRequest.mode, 'image')
  assert.equal(imageRequest.endpoint, 'https://api.x.ai/v1/videos/generations')
  assert.match(imageRequest.body.image.url, /^data:image\/png;base64,/)
  assert.equal(imageRequest.body.aspect_ratio, undefined)

  const overriddenImageRequest = buildXaiVideoRequest(config.apiUrl, config, [image()], 'move', {
    aspectRatio: '9:16'
  })
  assert.equal(overriddenImageRequest.body.aspect_ratio, '9:16')

  const referenceRequest = buildXaiVideoRequest(config.apiUrl, config, [image(), image()], 'dance')
  assert.equal(referenceRequest.mode, 'reference')
  assert.equal(referenceRequest.body.reference_images.length, 2)
  assert.equal(referenceRequest.body.aspect_ratio, config.aspectRatio)
})

test('reference mode enforces image count and resolution limits', () => {
  assert.throws(
    () => buildXaiVideoRequest(config.apiUrl, config, Array.from({ length: 8 }, image), 'scene'),
    /1 至 7/
  )
  assert.throws(
    () => buildXaiVideoRequest(config.apiUrl, config, [image(), image()], 'scene', { resolution: '1080p' }),
    /720p/
  )
})

test('edit and extend route to distinct endpoints', () => {
  const edit = buildXaiVideoRequest(config.apiUrl, config, [video()], 'add rain', { mode: 'edit' })
  assert.equal(edit.endpoint, 'https://api.x.ai/v1/videos/edits')
  assert.equal(edit.body.duration, undefined)
  assert.equal(edit.body.aspect_ratio, undefined)

  const extend = buildXaiVideoRequest(config.apiUrl, config, [video()], 'continue', {
    mode: 'extend',
    duration: 8
  })
  assert.equal(extend.endpoint, 'https://api.x.ai/v1/videos/extensions')
  assert.equal(extend.body.duration, 8)
  assert.equal(extend.body.aspect_ratio, undefined)
})

test('edit mode rejects ignored output overrides', () => {
  assert.throws(
    () => buildXaiVideoRequest(config.apiUrl, config, [video()], 'edit', {
      mode: 'edit',
      resolution: '720p'
    }),
    /继承原视频/
  )
})
test('video edit and extension reject non-MP4 inputs', () => {
  const webm = file('video/webm', 'source.webm')
  assert.throws(
    () => buildXaiVideoRequest(config.apiUrl, config, [webm], 'edit', { mode: 'edit' }),
    /MP4/
  )
})

test('completed response reads nested video metadata and moderation', () => {
  assert.deepEqual(
    parseXaiCompletedResponse({
      status: 'done',
      video: {
        url: 'https://example.com/result.mp4',
        duration: 8,
        respect_moderation: true
      }
    }),
    {
      url: 'https://example.com/result.mp4',
      duration: 8,
      respectModeration: true
    }
  )

  assert.throws(
    () => parseXaiCompletedResponse({
      status: 'done',
      video: {
        url: 'https://example.com/rejected.mp4',
        respect_moderation: false
      }
    }),
    /内容审核/
  )
})