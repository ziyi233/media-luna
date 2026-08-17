import assert from 'node:assert/strict'
import test from 'node:test'
import type { FileData } from '../src/core'
import { buildRunwayRequest } from '../src/plugins/connector-runway/connector'

function image(): FileData {
  const bytes = Uint8Array.from([1, 2, 3])
  return { data: bytes.buffer, mime: 'image/png', filename: 'input.png' }
}

const config = {
  apiUrl: 'https://api.dev.runwayml.com/v1',
  model: 'gen4_turbo',
  mode: 'auto',
  duration: 5,
  aspectRatio: '16:9'
}

test('Runway uses official text and image endpoints', () => {
  const textRequest = buildRunwayRequest(config, [], 'clouds')
  assert.equal(textRequest.endpoint, 'https://api.dev.runwayml.com/v1/text_to_video')
  assert.equal(textRequest.body.ratio, '1280:720')

  const imageRequest = buildRunwayRequest(config, [image()], 'move')
  assert.equal(imageRequest.endpoint, 'https://api.dev.runwayml.com/v1/image_to_video')
  assert.match(imageRequest.body.promptImage, /^data:image\/png;base64,/)
})

test('Runway command parameters override channel defaults', () => {
  const request = buildRunwayRequest(config, [], 'clouds', {
    duration: 10,
    resolution: '720:1280',
    seed: 42
  })
  assert.equal(request.body.duration, 10)
  assert.equal(request.body.ratio, '720:1280')
  assert.equal(request.body.seed, 42)
})
