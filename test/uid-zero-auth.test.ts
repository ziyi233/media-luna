import assert from 'node:assert/strict'
import test from 'node:test'
import { getUidFromAuth, wrapAuthApiHandler } from '../src/core/api/api-utils'
import { registerSetupApi } from '../src/core/api/setup-api'
import { registerCharacterProfileCommands } from '../src/plugins/koishi-commands/commands/character-profiles'

test('auth helpers treat uid 0 as logged in', async () => {
  const ctx = {
    mediaLuna: {
      getService: () => ({ getUid: () => 0 })
    }
  } as any

  assert.equal(getUidFromAuth(ctx, { id: 0 }), 0)
  assert.equal(getUidFromAuth(ctx, null), 0)

  const handler = wrapAuthApiHandler(ctx, async (_params: {}, uid: number) => uid)
  assert.deepEqual(await handler.call({ auth: { id: 0 } }, {}), {
    success: true,
    data: 0
  })
})

test('character create command does not reject a OneBot session with uid 0', async () => {
  const commands: Array<{
    name: string
    aliases: string[]
    action?: (...args: any[]) => any
  }> = []

  const ctx = {
    command(name: string) {
      const record = { name, aliases: [] as string[], action: undefined as ((...args: any[]) => any) | undefined }
      commands.push(record)
      const command = {
        alias(...aliases: string[]) {
          record.aliases.push(...aliases)
          return command
        },
        action(action: (...args: any[]) => any) {
          record.action = action
          return command
        },
        dispose() {}
      }
      return command
    }
  } as any

  registerCharacterProfileCommands({
    ctx,
    logger: {},
    parentCommand: 'medialuna',
    mediaLuna: { getService: () => undefined },
    config: { collectTimeout: 120 }
  } as any)

  const create = commands.find(command => command.name.startsWith('medialuna.character.create'))
  assert.ok(create?.action)
  assert.deepEqual(create.aliases, ['新增设定'])

  const result = await create.action!({
    session: {
      user: { id: 0 }
    }
  }, '测试设定')

  assert.equal(result, '设定集服务不可用')
})
test('setup status treats auth uid 0 as bound', async () => {
  const listeners = new Map<string, (...args: any[]) => any>()
  const ctx = {
    console: {
      addListener(name: string, handler: (...args: any[]) => any) {
        listeners.set(name, handler)
      }
    },
    mediaLuna: {
      pluginLoader: {
        getPluginConfig: () => ({ backend: 'local' })
      },
      getService: () => undefined
    },
    database: {
      get: async () => []
    }
  } as any

  registerSetupApi(ctx)
  const status = await listeners.get('media-luna/setup/status')!.call({
    auth: { id: 0 }
  })

  assert.equal(status.success, true)
  assert.equal(status.data.userBound, true)
  assert.equal(status.data.boundUid, 0)
  assert.equal(status.data.needsSetup, false)
})