import assert from 'node:assert/strict'
import test from 'node:test'
import type { FileData } from '../src/core'
import { buildCreateForm } from '../src/plugins/connector-openai-video/connector'

function image(): FileData {
  const bytes = Uint8Array.from([1, 2, 3])
  return { data: bytes.buffer, mime: 'image/png', filename: 'reference.png' }
}

test('OpenAI Video uses official multipart field names', () => {
  const form = buildCreateForm(
    { model: 'sora-2', size: '1280x720', seconds: 4 },
    [image()],
    'camera moves',
    { duration: 8, resolution: '720x1280', fps: 60, seed: 42 }
  )

  assert.equal(form.get('model'), 'sora-2')
  assert.equal(form.get('prompt'), 'camera moves')
  assert.equal(form.get('seconds'), '8')
  assert.equal(form.get('size'), '720x1280')
  assert.ok(form.get('input_reference') instanceof Blob)
  assert.equal(form.get('image'), null)
  assert.equal(form.get('fps'), null)
  assert.equal(form.get('seed'), null)
})
