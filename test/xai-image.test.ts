import assert from 'node:assert/strict'
import test from 'node:test'
import type { FileData } from '../src/core'
import {
  XaiImageConnector,
  buildXaiImageRequest,
  parseXaiImageResponse,
  resolveXaiImageEndpoint
} from '../src/plugins/connector-xai-image/connector'

const config = {
  apiUrl: 'https://api.x.ai/v1',
  apiKey: 'secret',
  model: 'grok-imagine-image-2.0',
  aspectRatio: '16:9',
  resolution: '1k',
  quality: 'medium',
  count: 1,
  responseFormat: 'url',
  timeout: 600
}

function image(value = 1, mime = 'image/png'): FileData {
  return {
    data: Uint8Array.from([value]).buffer,
    mime,
    filename: `image-${value}.${mime.split('/')[1] || 'bin'}`
  }
}

test('resolves xAI image endpoints from bases and explicit image endpoints', () => {
  assert.equal(
    resolveXaiImageEndpoint('https://api.x.ai', 'generation'),
    'https://api.x.ai/v1/images/generations'
  )
  assert.equal(
    resolveXaiImageEndpoint('https://api.x.ai/v1/', 'edit'),
    'https://api.x.ai/v1/images/edits'
  )
  assert.equal(
    resolveXaiImageEndpoint('https://proxy.example/v1/images/edits', 'generation'),
    'https://proxy.example/v1/images/generations'
  )
})

test('builds text-to-image requests with command overrides', () => {
  const request = buildXaiImageRequest(config.apiUrl, {
    ...config,
    responseFormat: 'b64_json'
  }, [], '  sunrise  ', {
    resolution: '2K',
    aspectRatio: '9:16',
    quality: 'low',
    count: 10
  })

  assert.equal(request.mode, 'generation')
  assert.equal(request.endpoint, 'https://api.x.ai/v1/images/generations')
  assert.deepEqual(request.body, {
    model: 'grok-imagine-image-2.0',
    prompt: 'sunrise',
    n: 10,
    resolution: '2k',
    response_format: 'b64_json',
    aspect_ratio: '9:16',
    quality: 'low'
  })
})

test('single-image edits preserve input ratio and omit configured quality', () => {
  const request = buildXaiImageRequest(config.apiUrl, config, [image(1)], 'add rain')

  assert.equal(request.mode, 'edit')
  assert.equal(request.endpoint, 'https://api.x.ai/v1/images/edits')
  assert.equal(request.body.aspect_ratio, undefined)
  assert.equal(request.body.quality, undefined)
  assert.equal(request.body.images, undefined)
  assert.match(request.body.image.url, /^data:image\/png;base64,/)
  assert.equal(request.body.n, 1)
  assert.equal(request.body.resolution, '1k')
})

test('explicit aspect ratio overrides edit inheritance', () => {
  const request = buildXaiImageRequest(config.apiUrl, config, [image(1)], 'crop it', {
    aspectRatio: '1:1',
    resolution: '2k',
    count: 2
  })

  assert.equal(request.body.aspect_ratio, '1:1')
  assert.equal(request.body.resolution, '2k')
  assert.equal(request.body.n, 2)
})

test('multi-image edits preserve input order', () => {
  const request = buildXaiImageRequest(config.apiUrl, config, [
    image(1, 'image/jpeg'),
    image(2, 'image/webp'),
    image(3, 'image/png')
  ], 'combine them')

  assert.equal(request.body.image, undefined)
  assert.equal(request.body.images.length, 3)
  assert.match(request.body.images[0].url, /^data:image\/jpeg;base64,AQ==$/)
  assert.match(request.body.images[1].url, /^data:image\/webp;base64,Ag==$/)
  assert.match(request.body.images[2].url, /^data:image\/png;base64,Aw==$/)
})

test('validates prompt, image count, MIME type, size, and edit quality', () => {
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [], '   '),
    /需要提示词/
  )
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [image(), image(), image(), image()], 'edit'),
    /最多接受 3 张/
  )
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [image(1, 'image/gif')], 'edit'),
    /仅接受 JPEG、PNG 或 WebP/
  )
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [image(1, 'video/mp4')], 'edit'),
    /仅接受 JPEG、PNG 或 WebP/
  )
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [{
      data: new ArrayBuffer(20 * 1024 * 1024 + 1),
      mime: 'image/png',
      filename: 'large.png'
    }], 'edit'),
    /超过 20 MiB/
  )
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [image()], 'edit', { quality: 'low' }),
    /尚未声明 quality/
  )
})

test('validates generation parameter ranges and enums', () => {
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [], 'draw', { count: 0 }),
    /生成数量必须是 1 到 10/
  )
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [], 'draw', { count: 11 }),
    /生成数量必须是 1 到 10/
  )
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [], 'draw', { resolution: '4k' }),
    /不支持的分辨率/
  )
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [], 'draw', { aspectRatio: '21:9' }),
    /不支持的宽高比/
  )
  assert.throws(
    () => buildXaiImageRequest(config.apiUrl, config, [], 'draw', { quality: 'high' }),
    /不支持的生成质量/
  )
})

test('parses URL and Base64 outputs with actual MIME and metadata', () => {
  const outputs = parseXaiImageResponse({
    model: 'grok-imagine-image-2.0-20260813',
    respect_moderation: true,
    usage: { cost_in_usd_ticks: 4 },
    data: [
      {
        url: 'https://imgen.x.ai/temporary.jpeg',
        mime_type: 'image/jpeg',
        revised_prompt: 'revised'
      },
      {
        b64_json: 'aW1hZ2U=',
        mime_type: 'image/png',
        file_output: {
          file_id: 'file_123',
          filename: 'result.png'
        }
      }
    ]
  })

  assert.equal(outputs[0].url, 'https://imgen.x.ai/temporary.jpeg')
  assert.equal(outputs[0].mime, 'image/jpeg')
  assert.equal(outputs[0].meta?.temporaryUrl, true)
  assert.equal(outputs[0].meta?.revisedPrompt, 'revised')
  assert.equal(outputs[1].url, 'data:image/png;base64,aW1hZ2U=')
  assert.equal(outputs[1].mime, 'image/png')
  assert.equal(outputs[1].meta?.fileId, 'file_123')
  assert.deepEqual(outputs[1].meta?.usage, { cost_in_usd_ticks: 4 })
})

test('prefers persistent Files API URLs when present', () => {
  const [output] = parseXaiImageResponse({
    data: [{
      url: 'https://imgen.x.ai/temporary.webp',
      mime_type: 'image/webp',
      file_output: {
        file_id: 'file_456',
        filename: 'result.webp',
        public_url: 'https://files-cdn.x.ai/result.webp',
        public_url_expires_at: 123
      }
    }]
  })

  assert.equal(output.url, 'https://files-cdn.x.ai/result.webp')
  assert.equal(output.meta?.temporaryUrl, false)
  assert.equal(output.meta?.publicUrlExpiresAt, 123)
})

test('rejects moderation failures, API errors, and empty responses', () => {
  assert.throws(
    () => parseXaiImageResponse({ respect_moderation: false, data: [] }),
    /内容审核/
  )
  assert.throws(
    () => parseXaiImageResponse({ data: [{ respect_moderation: false }] }),
    /内容审核/
  )
  assert.throws(
    () => parseXaiImageResponse({ error: { message: 'invalid model' } }),
    /invalid model/
  )
  assert.throws(
    () => parseXaiImageResponse({ data: [] }),
    /没有生成结果/
  )
})

test('connector sends JSON requests and exposes only image generation parameters', async () => {
  let captured: any
  const ctx = {
    http: {
      async post(endpoint: string, body: any, options: any) {
        captured = { endpoint, body, options }
        return {
          data: [{ url: 'https://imgen.x.ai/result.jpeg', mime_type: 'image/jpeg' }]
        }
      }
    }
  } as any

  const outputs = await XaiImageConnector.generate(ctx, config, [], 'draw a city', {
    count: 2,
    resolution: '2k'
  })

  assert.equal(captured.endpoint, 'https://api.x.ai/v1/images/generations')
  assert.equal(captured.options.headers['Content-Type'], 'application/json')
  assert.equal(captured.body.n, 2)
  assert.equal(outputs.length, 1)
  assert.deepEqual(XaiImageConnector.commandParameters, ['resolution', 'aspectRatio', 'quality', 'count'])
  assert.deepEqual(XaiImageConnector.defaultTags, ['text2img'])
})
