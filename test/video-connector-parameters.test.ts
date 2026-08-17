import assert from 'node:assert/strict'
import test from 'node:test'
import { OpenAIVideoConnector } from '../src/plugins/connector-openai-video/connector'
import { RunwayConnector } from '../src/plugins/connector-runway/connector'

test('OpenAI Video exposes only parameters supported by the official API', () => {
  const log = OpenAIVideoConnector.getRequestLog!(
    { apiUrl: 'https://api.openai.com/v1', model: 'sora-2', size: '1280x720', seconds: 4 },
    [],
    'camera moves',
    { duration: 8, resolution: '720x1280' }
  )

  assert.deepEqual(log.parameters, {
    size: '720x1280',
    seconds: 8,
    inputReference: undefined
  })
  assert.deepEqual(OpenAIVideoConnector.commandParameters, ['duration', 'resolution'])
})

test('Runway exposes mode and both standard ratio spellings', () => {
  assert.deepEqual(RunwayConnector.commandParameters, ['mode', 'duration', 'resolution', 'aspectRatio', 'seed'])
  const log = RunwayConnector.getRequestLog!(
    { apiUrl: 'https://example.com', model: 'legacy', duration: 5, aspectRatio: '16:9' },
    [],
    'clouds',
    { duration: 10, aspectRatio: '9:16', seed: 42 }
  )
  assert.deepEqual(log.parameters, {
    mode: 'text',
    duration: 10,
    ratio: '720:1280',
    seed: 42
  })
})
