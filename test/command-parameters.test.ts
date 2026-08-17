import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from 'koishi'
import { registerConnectorOptions } from '../src/plugins/koishi-commands/commands/channel-generate'
import { normalizeCommandParameters } from '../src/plugins/koishi-commands/services/parameter-options'

test('normalizes legacy duration and fps aliases', () => {
  assert.deepEqual(
    normalizeCommandParameters({
      image: 'ignored',
      video: 'ignored',
      time: 7,
      framerate: 30,
      resolution: '720p',
      empty: undefined
    }),
    {
      duration: 7,
      fps: 30,
      resolution: '720p'
    }
  )
})

test('canonical parameters win over legacy aliases', () => {
  assert.deepEqual(
    normalizeCommandParameters({
      duration: 9,
      time: 5,
      fps: 24,
      framerate: 12
    }),
    {
      duration: 9,
      fps: 24
    }
  )
})

test('duration aliases share one canonical Koishi option', () => {
  const command: any = new Context().command('probe [...rest:string]')
  const warnings: string[] = []
  registerConnectorOptions(command, {
    id: 'example-video',
    commandParameters: ['duration', 'fps'],
    commandOptions: [{
      name: 'timeline',
      declaration: '--timeline <timeline:string>',
      description: 'Reference timeline'
    }]
  } as any, {
    warn(message: string) {
      warnings.push(message)
    }
  })

  assert.deepEqual(Object.keys(command._options), ['duration', 'fps', 'timeline'])
  assert.equal(command._options.duration.syntax, '-t, --duration, --time <duration>')
  assert.equal(command._namedOptions.t.name, 'duration')
  assert.equal(command._namedOptions.duration.name, 'duration')
  assert.equal(command._namedOptions.time.name, 'duration')
  assert.equal(command._options.resolution, undefined)
  assert.deepEqual(warnings, [])
})

test('connector options cannot reuse an existing command alias', () => {
  const command: any = new Context().command('probe [...rest:string]')
  command.option('existingTime', '--time <value:number>')
  const warnings: string[] = []

  registerConnectorOptions(command, {
    id: 'example-video',
    commandParameters: ['duration']
  } as any, {
    warn(message: string) {
      warnings.push(message)
    }
  })

  assert.equal(command._options.duration, undefined)
  assert.match(warnings[0], /conflicts with alias --time/)
})

test('image quality and count use shared command aliases', () => {
  const command: any = new Context().command('image-probe [...rest:string]')
  registerConnectorOptions(command, {
    id: 'example-image',
    commandParameters: ['quality', 'count']
  } as any, { warn() {} })

  assert.equal(command._options.quality.syntax, '-q, --quality <quality>')
  assert.equal(command._options.count.syntax, '-n, --count <count>')
  assert.equal(command._namedOptions.q.name, 'quality')
  assert.equal(command._namedOptions.quality.name, 'quality')
  assert.equal(command._namedOptions.n.name, 'count')
  assert.equal(command._namedOptions.count.name, 'count')
})

test('image parameter aliases still participate in collision detection', () => {
  const command: any = new Context().command('image-conflict [...rest:string]')
  command.option('existingCount', '-n <value:number>')
  const warnings: string[] = []

  registerConnectorOptions(command, {
    id: 'example-image',
    commandParameters: ['quality', 'count']
  } as any, {
    warn(message: string) {
      warnings.push(message)
    }
  })

  assert.ok(command._options.quality)
  assert.equal(command._options.count, undefined)
  assert.match(warnings[0], /conflicts with alias --n/)
})
