const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true
    },
    fileName: filename
  })
  module._compile(output.outputText, filename)
}

const { CacheService } = require('../src/plugins/cache/service.ts')
const { sanitizeOrphanFileNames } = require('../src/core/api/cache-api.ts')
const { RemoteSyncService } = require('../src/plugins/preset/remote-sync.service.ts')
const { formatGenerationResult } = require('../src/plugins/koishi-commands/formatters/delivery.ts')

class MemoryDatabase {
  constructor() {
    this.tables = {
      medialuna_asset_cache: [],
      medialuna_character_profile: [],
      medialuna_preset: []
    }
    this.nextIds = new Map()
  }

  matches(record, query) {
    return Object.entries(query).every(([key, value]) => record[key] === value)
  }

  async get(table, query) {
    return this.tables[table].filter(record => this.matches(record, query))
  }

  async create(table, data) {
    const id = data.id || ((this.nextIds.get(table) || 0) + 1)
    this.nextIds.set(table, id)
    const record = { ...data, id }
    this.tables[table].push(record)
    return record
  }

  async set(table, query, update) {
    for (const record of this.tables[table]) {
      if (this.matches(record, query)) Object.assign(record, update)
    }
  }

  async remove(table, query) {
    this.tables[table] = this.tables[table].filter(record => !this.matches(record, query))
  }
}

test('orphan scan API does not expose server directory paths', () => {
  assert.deepEqual(
    sanitizeOrphanFileNames([
      'D:\\private\\media-luna\\cache\\orphan.png',
      '/srv/koishi/data/media-luna/cache/second.webp'
    ]),
    ['orphan.png', 'second.webp']
  )
})

function createFixture(overrides = {}, database = new MemoryDatabase(), setBaseUrl = true) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-luna-cache-'))
  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  const ctx = {
    baseDir,
    database,
    logger: () => logger,
    http: { get: async () => { throw new Error('unexpected HTTP request') } },
    get: () => null
  }
  const config = {
    enabled: true,
    backend: 'local',
    cacheDir: 'data/media-luna/cache',
    persistentDir: 'data/media-luna/assets',
    publicPath: '/media-luna/cache',
    publicBaseUrl: '',
    maxCacheSize: 500,
    maxFileSize: 20,
    expireDays: 30,
    ...overrides
  }
  const service = new CacheService(ctx, config)
  if (setBaseUrl) service.setBaseUrl('http://127.0.0.1:5141')
  return { baseDir, database, service, config, ctx }
}

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)
}

test('expiry and clear remove temporary cache but preserve referenced assets', async (t) => {
  const fixture = createFixture()
  t.after(() => fs.rmSync(fixture.baseDir, { recursive: true, force: true }))

  const temporary = await fixture.service.cache(Buffer.from('temporary'), 'image/png', 'temp.png')
  const persistent = await fixture.service.cache(Buffer.from('profile'), 'image/png', 'profile.png', undefined, { persistent: true })
  await fixture.database.create('medialuna_character_profile', {
    uid: 1,
    name: 'Alice',
    description: '',
    imageUrls: JSON.stringify([persistent.url]),
    isPublic: false,
    publicDescription: '',
    createdAt: new Date(),
    updatedAt: new Date()
  })

  const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
  await fixture.database.set('medialuna_asset_cache', {}, { lastAccessedAt: old })
  await fixture.service.initialize()

  assert.equal(await fixture.service.get(temporary.id), null)
  assert.ok(await fixture.service.get(persistent.id))
  assert.equal(await fixture.service.delete(persistent.id), false)
  assert.equal(await fixture.service.clearAll(), 0)
  assert.ok(await fixture.service.get(persistent.id))
  const stats = await fixture.service.getStats()
  assert.equal(stats.temporaryFiles, 0)
  assert.equal(stats.persistentFiles, 1)
})

test('LRU quota evicts only temporary files', async (t) => {
  const fixture = createFixture({ expireDays: 0, maxCacheSize: 0.001 })
  t.after(() => fs.rmSync(fixture.baseDir, { recursive: true, force: true }))
  await fixture.service.initialize()

  const persistent = await fixture.service.cache(Buffer.alloc(700, 1), 'image/png', 'persistent.png', undefined, { persistent: true })
  await fixture.database.create('medialuna_character_profile', {
    uid: 1, name: 'Quota', description: '', imageUrls: JSON.stringify([persistent.url]),
    isPublic: false, publicDescription: '', createdAt: new Date(), updatedAt: new Date()
  })
  await fixture.service.repairReferences({ demoteUnreferenced: true })
  const first = await fixture.service.cache(Buffer.alloc(700, 2), 'image/png', 'first.png')
  const second = await fixture.service.cache(Buffer.alloc(700, 3), 'image/png', 'second.png')

  assert.equal(await fixture.service.get(first.id), null)
  assert.ok(await fixture.service.get(second.id))
  assert.ok(await fixture.service.get(persistent.id))
})

test('delete uses cachedKey and storagePath instead of the original filename', async (t) => {
  const fixture = createFixture({ expireDays: 0 })
  t.after(() => fs.rmSync(fixture.baseDir, { recursive: true, force: true }))

  await fixture.service.initialize()
  const cached = await fixture.service.cache(Buffer.from('delete-me'), 'image/png', 'friendly-name.png')
  assert.ok(fs.existsSync(cached.localPath))
  assert.equal(await fixture.service.delete(cached.id), true)
  assert.equal(fs.existsSync(cached.localPath), false)
  assert.equal(fixture.database.tables.medialuna_asset_cache.length, 0)
})

test('startup repairs an orphan referenced through an old local port', async (t) => {
  const fixture = createFixture({ expireDays: 0 })
  t.after(() => fs.rmSync(fixture.baseDir, { recursive: true, force: true }))

  const bytes = Buffer.from('orphan-reference')
  const id = hash(bytes)
  const cacheDir = path.join(fixture.baseDir, 'data/media-luna/cache')
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(path.join(cacheDir, `${id}.png`), bytes)
  await fixture.database.create('medialuna_character_profile', {
    uid: 1,
    name: 'Recovered',
    description: '',
    imageUrls: JSON.stringify([`http://127.0.0.1:5140/media-luna/cache/${id}.png`]),
    isPublic: false,
    publicDescription: '',
    createdAt: new Date(),
    updatedAt: new Date()
  })

  await fixture.service.initialize()
  const character = fixture.database.tables.medialuna_character_profile[0]
  const repairedUrl = JSON.parse(character.imageUrls)[0]
  assert.match(repairedUrl, /^http:\/\/127\.0\.0\.1:5141\//)
  assert.equal(fixture.database.tables.medialuna_asset_cache.length, 1)
  const record = fixture.database.tables.medialuna_asset_cache[0]
  assert.equal(record.persistent, true)
  assert.ok(fs.existsSync(path.resolve(fixture.baseDir, record.storagePath)))
  assert.equal(fs.existsSync(path.join(cacheDir, `${id}.png`)), false)
})

test('shared references remain protected until the final business reference is removed', async (t) => {
  const fixture = createFixture({ expireDays: 0 })
  t.after(() => fs.rmSync(fixture.baseDir, { recursive: true, force: true }))

  await fixture.service.initialize()
  const cached = await fixture.service.cache(Buffer.from('shared'), 'image/png', 'shared.png', undefined, { persistent: true })
  await fixture.database.create('medialuna_character_profile', {
    uid: 1, name: 'Shared', description: '', imageUrls: JSON.stringify([cached.url]),
    isPublic: false, publicDescription: '', createdAt: new Date(), updatedAt: new Date()
  })
  await fixture.database.create('medialuna_preset', {
    name: 'Shared preset', displayName: 'Shared preset', promptTemplate: '', tags: '[]',
    referenceImages: JSON.stringify([cached.url]), referenceImagesRemote: '[]', parameterOverrides: '{}',
    source: 'user', enabled: true, thumbnail: '', thumbnailRemote: '', createdAt: new Date(), updatedAt: new Date()
  })
  await fixture.service.repairReferences({ demoteUnreferenced: true })

  await fixture.database.remove('medialuna_character_profile', {})
  await fixture.service.repairReferences({ demoteUnreferenced: true })
  assert.equal(fixture.database.tables.medialuna_asset_cache[0].persistent, true)
  assert.ok(await fixture.service.loadReference(cached.url))

  await fixture.database.remove('medialuna_preset', {})
  await fixture.service.repairReferences({ demoteUnreferenced: true })
  assert.equal(fixture.database.tables.medialuna_asset_cache[0].persistent, false)
  assert.equal(await fixture.service.clearAll(), 1)
  assert.equal(fs.existsSync(cached.localPath), false)
})

test('restart migrates persistent assets when persistentDir changes', async (t) => {
  const database = new MemoryDatabase()
  const first = createFixture({ expireDays: 0 }, database)
  t.after(() => fs.rmSync(first.baseDir, { recursive: true, force: true }))
  await first.service.initialize()
  const cached = await first.service.cache(Buffer.from('move-dir'), 'image/png', 'move.png', undefined, { persistent: true })
  await database.create('medialuna_character_profile', {
    uid: 1, name: 'Move', description: '', imageUrls: JSON.stringify([cached.url]),
    isPublic: false, publicDescription: '', createdAt: new Date(), updatedAt: new Date()
  })
  await first.service.repairReferences()

  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  const ctx = {
    baseDir: first.baseDir,
    database,
    logger: () => logger,
    http: { get: async () => { throw new Error('unexpected HTTP request') } },
    get: () => null
  }
  const second = new CacheService(ctx, { ...first.config, persistentDir: 'data/media-luna/assets-v2' })
  second.setBaseUrl('http://127.0.0.1:5141')
  await second.initialize()

  const record = database.tables.medialuna_asset_cache[0]
  assert.match(record.storagePath.replace(/\\/g, '/'), /assets-v2/)
  assert.ok(fs.existsSync(path.resolve(first.baseDir, record.storagePath)))
  assert.ok(await second.loadReference(record.cachedUrl))
})

test('missing persistent references are reported and never auto-deleted', async (t) => {
  const fixture = createFixture({ expireDays: 0 })
  t.after(() => fs.rmSync(fixture.baseDir, { recursive: true, force: true }))
  const url = 'http://127.0.0.1:5140/media-luna/cache/aaaaaaaaaaaaaaaa.png'
  await fixture.database.create('medialuna_character_profile', {
    uid: 1, name: 'Broken', description: '', imageUrls: JSON.stringify([url]),
    isPublic: false, publicDescription: '', createdAt: new Date(), updatedAt: new Date()
  })

  const result = await fixture.service.repairReferences()
  assert.deepEqual(result.unrecoverable, ['人物设定「Broken」第 1 张图'])
  assert.equal(fixture.database.tables.medialuna_character_profile.length, 1)
  assert.equal(await fixture.service.loadReference(url), null)
})

test('remote preset references are not downloaded or promoted by repair', async (t) => {
  const fixture = createFixture({ expireDays: 0 })
  t.after(() => fs.rmSync(fixture.baseDir, { recursive: true, force: true }))
  const localUrl = 'http://127.0.0.1:5140/media-luna/cache/bbbbbbbbbbbbbbbb.png'
  const remoteUrl = 'https://example.test/reference.png'
  let requestCount = 0
  fixture.ctx.http.get = async () => { requestCount++; throw new Error('unexpected HTTP request') }
  await fixture.database.create('medialuna_preset', {
    name: 'Remote', displayName: 'Remote', promptTemplate: '', tags: '[]',
    referenceImages: JSON.stringify([localUrl]), referenceImagesRemote: JSON.stringify([remoteUrl]),
    parameterOverrides: '{}', source: 'api', enabled: true, thumbnail: '', thumbnailRemote: '',
    createdAt: new Date(), updatedAt: new Date()
  })

  const result = await fixture.service.repairReferences({ downloadRemote: true, demoteUnreferenced: true })
  assert.equal(result.redownloaded, 0)
  assert.equal(result.unrecoverable.length, 0)
  assert.equal(requestCount, 0)
  assert.equal(fixture.database.tables.medialuna_asset_cache.length, 0)
  assert.deepEqual(JSON.parse(fixture.database.tables.medialuna_preset[0].referenceImages), [localUrl])
})

test('server-ready URL rewrite keeps generated media temporary and sendable', async (t) => {
  const database = new MemoryDatabase()
  const fixture = createFixture({ expireDays: 0 }, database, false)
  t.after(() => fs.rmSync(fixture.baseDir, { recursive: true, force: true }))

  await fixture.service.initialize()
  const generated = await fixture.service.cache(Buffer.from('generated'), 'image/png', 'generated.png')
  assert.match(generated.url, /^\/media-luna\/cache\//)
  assert.equal(database.tables.medialuna_asset_cache[0].persistent, false)

  fixture.service.setBaseUrl('http://127.0.0.1:5141')
  assert.equal(
    fixture.service.resolvePublicUrl(generated.url),
    `http://127.0.0.1:5141${generated.url}`
  )
  assert.equal(await fixture.service.rewriteLocalUrls(), 1)
  assert.match(database.tables.medialuna_asset_cache[0].cachedUrl, /^http:\/\/127\.0\.0\.1:5141\//)
  assert.equal(database.tables.medialuna_asset_cache[0].persistent, false)
  assert.match(database.tables.medialuna_asset_cache[0].storagePath.replace(/\\/g, '/'), /media-luna\/cache\//)
})

test('delivery resolves relative generated media URLs before formatting', () => {
  const output = formatGenerationResult({
    success: true,
    output: [{ kind: 'image', url: '/media-luna/cache/generated.png' }]
  }, {
    platform: 'onebot',
    resolveAssetUrl: (url) => `http://127.0.0.1:5141${url}`
  })

  assert.match(output, /<image url="http:\/\/127\.0\.0\.1:5141\/media-luna\/cache\/generated\.png"\/>/)
})

test('remote sync stores source URLs and purges legacy remote media cache once', async () => {
  const records = []
  let reconciles = 0
  let removedSources = []
  const presetService = {
    async listByRemoteUrl() { return records.filter(item => item.remoteUrl === 'https://example.test/api') },
    async getByRemoteId(id, remoteUrl) { return records.find(item => item.remoteId === id && item.remoteUrl === remoteUrl) || null },
    async list() { return records },
    async create(data) { const record = { ...data, id: records.length + 1 }; records.push(record); return record },
    async update(id, patch) { const record = records.find(item => item.id === id); Object.assign(record, patch); return record },
    async delete() { return true },
    async reconcileReferences() { reconciles++ }
  }
  const cache = {
    async removeCachedSources(urls) { removedSources = urls; return urls.length }
  }
  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  const ctx = {
    scope: { isActive: true },
    logger: () => logger,
    http: { get: async () => { throw new Error('remote media must not be cached') } }
  }
  const service = new RemoteSyncService(ctx, presetService, () => cache)
  service.fetchRemoteTemplates = async () => ({
    notModified: false,
    templates: [{
      id: 7,
      title: 'Remote preset',
      prompt: '{prompt}',
      type: 'img2img',
      tags: [],
      category: 'template',
      file_path: 'https://cdn.example.test/main.png',
      thumbnail_path: 'https://cdn.example.test/thumb.webp',
      refs: [
        { id: 2, file_path: 'https://cdn.example.test/second.png', is_placeholder: false, position: 2 },
        { id: 1, file_path: 'https://cdn.example.test/first.png', is_placeholder: false, position: 1 }
      ],
      created_at: '2026-08-15'
    }]
  })

  const result = await service.sync('https://example.test/api')
  assert.equal(result.success, true)
  assert.equal(reconciles, 1)
  assert.deepEqual(records[0].referenceImages, [
    'https://cdn.example.test/first.png',
    'https://cdn.example.test/second.png'
  ])
  assert.equal(records[0].thumbnail, 'https://cdn.example.test/thumb.webp')
  assert.deepEqual(new Set(removedSources), new Set([
    'https://cdn.example.test/first.png',
    'https://cdn.example.test/second.png',
    'https://cdn.example.test/thumb.webp'
  ]))
})

test('orphan cleanup requires explicit confirmation', async (t) => {
  const fixture = createFixture({ expireDays: 0 })
  t.after(() => fs.rmSync(fixture.baseDir, { recursive: true, force: true }))
  const orphanPath = path.join(fixture.baseDir, 'data/media-luna/cache/orphan.png')
  fs.mkdirSync(path.dirname(orphanPath), { recursive: true })
  fs.writeFileSync(orphanPath, 'orphan')

  const scan = await fixture.service.scanOrphans()
  assert.deepEqual(scan.files, [orphanPath])
  await assert.rejects(() => fixture.service.cleanupOrphans(''), /明确确认/)
  assert.ok(fs.existsSync(orphanPath))
  const cleaned = await fixture.service.cleanupOrphans('DELETE_ORPHANS')
  assert.equal(cleaned.files.length, 1)
  assert.equal(fs.existsSync(orphanPath), false)
})
