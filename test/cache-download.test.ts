import assert from 'node:assert/strict'
import test from 'node:test'
import { downloadAsset } from '../src/plugins/cache/middleware'

test('remote cache downloads use the Koishi HTTP client', async () => {
  let requestedUrl = ''
  let requestedTimeout = 0
  const mctx = {
    ctx: {
      http: {
        async get(url: string, options: any) {
          requestedUrl = url
          requestedTimeout = options.timeout
          return options.responseType(new Response(
            Uint8Array.from([1, 2, 3]),
            { status: 200, headers: { 'content-type': 'video/mp4' } }
          ))
        }
      }
    }
  } as any

  const result = await downloadAsset('https://temporary.example/video.mp4', mctx)
  assert.equal(requestedUrl, 'https://temporary.example/video.mp4')
  assert.equal(requestedTimeout, 120000)
  assert.equal(result.mime, 'video/mp4')
  assert.deepEqual([...result.buffer], [1, 2, 3])
})

test('cache download still handles data URIs without HTTP', async () => {
  const mctx = {
    ctx: {
      http: {
        get() {
          throw new Error('HTTP should not be called')
        }
      }
    }
  } as any

  const result = await downloadAsset('data:text/plain;base64,aGk=', mctx)
  assert.equal(result.mime, 'text/plain')
  assert.equal(result.buffer.toString(), 'hi')
})