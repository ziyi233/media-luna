#!/usr/bin/env node
// NovelAI 连接器自测脚本
//
// 直接调用编译产物 lib/plugins/connector-novelai，不启动 Koishi：
//   - 默认（不传 --base-url）：在进程内起一个假 NovelAI 服务，跑全部场景并核对请求体，零消耗。
//   - 传 --token + 可选 --base-url：打真实 API，只跑基础文生图（参考图场景要加 --references，会消耗 Anlas）。
//
// 用法：
//   node scripts/test-novelai.mjs
//   node scripts/test-novelai.mjs --token pst-xxxx --model nai-diffusion-5-full --prompt "1girl, solo"
//   node scripts/test-novelai.mjs --base-url https://your-endpoint.example --token <key> --model nai-diffusion-4-5-full --resolution 512x768 --steps 20
//   node scripts/test-novelai.mjs --token pst-xxxx --references        # 额外跑氛围参考 / 角色参考
//
// 产物写到 external/media-luna/tmp/novelai-selftest/。
// token 也可用环境变量 NOVELAI_TOKEN（避免写进 shell 历史）。
// 裸 fetch 不读代理 env：需要走代理时用 NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 前缀。

import { createServer } from 'node:http'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zipSync } from 'fflate'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectDir = resolve(scriptDir, '..')
const outDir = join(projectDir, 'tmp', 'novelai-selftest')

/** Windows 下动态 import 必须用 file:// URL */
const loadBuilt = relativePath => import(pathToFileURL(join(projectDir, relativePath)).href)

const { NovelAIConnector } = (await loadBuilt('lib/plugins/connector-novelai/connector.js')).default
const { resolveParams, estimateAnlas } = (await loadBuilt('lib/plugins/connector-novelai/params.js')).default
const compatModule = (await loadBuilt('lib/plugins/connector-novelai/compat.js')).default
const middlewareModule = (await loadBuilt('lib/plugins/connector-novelai/middleware.js')).default

/** 8x8 纯色 PNG，作为假服务返回的图片与参考图素材 */
const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJklEQVR4AYXBAQEAIAyAMCSNIeyfwi6+gWzr7vP4kCBBggQJEiQMVIICT82SJ1wAAAAASUVORK5CYII=',
  'base64'
)

const options = parseOptions(process.argv.slice(2))
const failures = []
const captured = []

async function main() {
  mkdirSync(outDir, { recursive: true })

  const fake = options.baseUrl ? null : await startFakeServer()
  const baseUrl = options.baseUrl ?? fake.url
  const token = options.token ?? (fake ? 'pst-fake-token' : '')
  const live = Boolean(options.baseUrl && options.token)

  console.log(`目标：${baseUrl}${live ? '（真实 API）' : '（进程内假服务）'}`)

  await checkDefaults()
  await checkAnlas()
  await checkCompatRobustness()
  await checkChatLayer(baseUrl, token)

  if (live) {
    // 真机模式只跑真实请求；下面那组断言依赖进程内假服务的请求捕获
    await checkLiveGeneration(baseUrl, token)
    if (options.references) await checkLiveReferences(baseUrl, token)
  } else {
    await checkLocalScenarios(baseUrl, token)
  }

  if (fake) await fake.close()

  console.log()
  if (failures.length === 0) {
    console.log(`全部通过。产物目录：${outDir}`)
    return
  }
  console.log(`${failures.length} 项失败：`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exitCode = 1
}

/** 2. 默认值与覆盖优先级 */
async function checkDefaults() {
  const defaults = resolveParams({ model: 'nai-diffusion-5-full' })
  assert(defaults.steps === 28 && defaults.scale === 4 && defaults.sampler === 'k_euler_ancestral',
    `V5 默认 steps/scale/sampler 应为 28/4/k_euler_ancestral，实际 ${defaults.steps}/${defaults.scale}/${defaults.sampler}`)
  assert(defaults.width === 512 && defaults.height === 768, `默认尺寸应为官方九档第一档 512x768，实际 ${defaults.width}x${defaults.height}`)
  assert(defaults.profile.paramsVersion === 4, `V5 的 params_version 应为 4，实际 ${defaults.profile.paramsVersion}`)
  assert(defaults.transparent === false, `透明通道默认应为关，实际 ${defaults.transparent}`)
  assert(defaults.confirmBefore === 'on', `生成前确认默认应为模式 2（要确认），实际 ${defaults.confirmBefore}`)
  // 端点完全由配置决定，不预置任何站点：留空走官方，填了原样用（去掉尾部斜杠）
  assert(resolveParams({ model: 'nai-diffusion-5-full' }).apiUrl === 'https://image.novelai.net',
    `未填地址时应落到官方端点，实际 ${resolveParams({ model: 'nai-diffusion-5-full' }).apiUrl}`)
  assert(resolveParams({ model: 'nai-diffusion-5-full', apiUrl: 'https://other.example/' }).apiUrl === 'https://other.example',
    '填了别的地址时应原样使用')
  assert(resolveParams({ model: 'nai-diffusion-5-full', confirmBefore: 'relay' }).confirmBefore === 'on'
    && resolveParams({ model: 'nai-diffusion-5-full', confirmBefore: 'always' }).confirmBefore === 'on'
    && resolveParams({ model: 'nai-diffusion-5-full', confirmBefore: 'off' }).confirmBefore === 'off',
    '旧值 relay/always 应归一到「要确认」，只有 off 是模式 1')

  // 尺寸选项 = NovelAI 官方客户端的九档，顺序即下拉顺序，默认第一档
  const { SIZE_PRESETS, DEFAULT_RESOLUTION, SIZE_WORDS } = (await loadBuilt('lib/plugins/connector-novelai/config.js')).default
  const officialSizes = ['512x768', '768x512', '640x640', '832x1216', '1216x832', '1024x1024', '1024x1536', '1536x1024', '1472x1472']
  assert(SIZE_PRESETS.map(preset => preset.size).join(',') === officialSizes.join(','),
    `尺寸选项应与官方九档一致且顺序相同，实际 ${SIZE_PRESETS.map(preset => preset.size).join(',')}`)
  assert(DEFAULT_RESOLUTION === officialSizes[0], `默认分辨率应是第一档，实际 ${DEFAULT_RESOLUTION}`)
  assert(SIZE_WORDS['小图竖幅'] === '512x768' && SIZE_WORDS['大图横幅'] === '1536x1024',
    '官方档位名应可在聊天里直接写')

  const medium = resolveParams({ model: 'nai-diffusion-5-full-medium', steps: 40, sampler: 'k_euler' })
  assert(medium.steps === 14 && medium.sampler === 'k_euler_ancestral' && medium.profile.cfgRescale === false,
    `Medium Effort 应固定 14 步 / k_euler_ancestral 且不支持 cfg_rescale，实际 ${medium.steps}/${medium.sampler}`)

  const overridden = resolveParams(
    { model: 'nai-diffusion-4-5-full', steps: 30, resolution: '1024x1024', referenceStrength: 0.6 },
    { steps: 12, resolution: '横屏', referenceStrength: 0.9, width: 1000, height: 1500 }
  )
  assert(overridden.steps === 12, `parameters.steps 应覆盖渠道配置，实际 ${overridden.steps}`)
  assert(overridden.width === 1024 && overridden.height === 1472,
    `显式宽高应对齐到 64 的倍数，实际 ${overridden.width}x${overridden.height}`)
  assert(overridden.referenceStrength === 0.9, `parameters 应覆盖参考强度，实际 ${overridden.referenceStrength}`)

  // 尺寸词的完整语法：-z（声明式 option 原样落进 parameters.resolution）、预设、正文免前缀词共用同一条解析
  const wordSize = resolveParams({ model: 'nai-diffusion-4-5-full', resolution: '1024x1024' }, { resolution: '2:3' })
  assert(wordSize.width === 832 && wordSize.height === 1216,
    `parameters.resolution='2:3' 应解成 832x1216，实际 ${wordSize.width}x${wordSize.height}`)
  const wordLandscape = resolveParams({ model: 'nai-diffusion-4-5-full' }, { resolution: '大横屏' })
  assert(wordLandscape.width === 1536 && wordLandscape.height === 1024,
    `parameters.resolution='大横屏' 应解成 1536x1024，实际 ${wordLandscape.width}x${wordLandscape.height}`)
  const wordPixels = resolveParams({ model: 'nai-diffusion-4-5-full' }, { resolution: '1088x1920' })
  assert(wordPixels.width === 1088 && wordPixels.height === 1920,
    `parameters.resolution='1088x1920' 应原样生效，实际 ${wordPixels.width}x${wordPixels.height}`)
  const badSize = resolveParams({ model: 'nai-diffusion-4-5-full', resolution: '832x1216' }, { resolution: '不是尺寸' })
  assert(badSize.width === 832 && badSize.height === 1216,
    `不认识的尺寸应退回渠道配置，实际 ${badSize.width}x${badSize.height}`)

  const clamped = resolveParams({ model: 'nai-diffusion-5-full' }, { width: 2048, height: 2048 })
  assert(clamped.width * clamped.height <= 3211264, `超限尺寸应缩到像素上限内，实际 ${clamped.width}x${clamped.height}`)

  const positions = resolveParams({ model: 'nai-diffusion-5-full', characters: [{ prompt: 'girl', position: 'A1' }, { prompt: 'boy' }] })
  assert(positions.characters.length === 2, '角色行应被保留')
  console.log('✓ 默认值与覆盖优先级')
}

/** 3. Anlas 估算 */
async function checkAnlas() {
  const profile = resolveParams({ model: 'nai-diffusion-5-full' }).profile
  const free = estimateAnlas({ width: 832, height: 1216, steps: 28, profile })
  assert(free.perImage === 30 && free.total === 0 && free.freeBand, `832x1216/28 步 V5 应在免费带内，实际 ${JSON.stringify(free)}`)

  const large = estimateAnlas({ width: 1024, height: 1536, steps: 28, profile })
  assert(large.perImage === 45, `1024x1536/28 步 V5 应为 45 Anlas，实际 ${large.perImage}`)

  const web = estimateAnlas({ width: 832, height: 1216, steps: 23, profile })
  assert(web.perImage === 26, `832x1216/23 步 V5 应为 26 Anlas（官网口径），实际 ${web.perImage}`)

  const withVibe = estimateAnlas({ width: 832, height: 1216, steps: 28, profile, vibeImages: 2 })
  assert(withVibe.total === 4, `2 张氛围参考编码应为 4 Anlas，实际 ${withVibe.total}`)
  console.log('✓ Anlas 估算（与官网两个实测点吻合）')
}

/** 2.5 可选计费接口的解析健壮性与生成后回执（不联网、不消耗） */
async function checkCompatRobustness() {
  let seq = 0
  const probe = (payload) => compatModule.fetchCompatAccount(
    { http: { get: async () => payload } },
    { apiUrl: `http://relay-probe-${seq++}.invalid`, apiToken: 'test-key', model: 'nai-diffusion-5-full', timeout: 5 }
  )

  // Number(null)=0 / Number(true)=1 / Number('')=0 都能过 Number.isFinite，必须逐类型拒绝
  for (const credits of [null, true, '', [], undefined]) {
    const result = await probe({ ok: true, credits })
    assert(!result.ok && result.error.includes('积分余额'),
      `credits=${JSON.stringify(credits)} 应被拒绝，实际 ${JSON.stringify(result)}`)
  }
  const numeric = await probe({ ok: true, credits: '12' })
  assert(numeric.ok && numeric.account.credits === 12, `数值字符串应接受，实际 ${JSON.stringify(numeric)}`)

  const priceNull = await probe({ ok: true, credits: 5, models: [{ id: 'nai-diffusion-5-full', price: null }] })
  assert(priceNull.ok && priceNull.account.price === undefined,
    `price=null 不应变成 0 积分，实际 ${JSON.stringify(priceNull.account)}`)
  const priceNumber = await probe({ ok: true, credits: 5, models: [{ id: 'nai-diffusion-5-full', price: 2 }] })
  assert(priceNumber.ok && priceNumber.account.price === 2, '正常 price 应保留')

  const noHttp = await compatModule.fetchCompatAccount({}, { apiUrl: 'http://x.invalid', apiToken: 'test-key', model: 'nai-diffusion-5-full', timeout: 5 })
  assert(!noHttp.ok && noHttp.error.includes('HTTP 服务不可用'), `缺少 http 服务应给人话，实际 ${JSON.stringify(noHttp)}`)

  // 生成后回执：用快照差报消耗，充值（余额上升）时不报消耗，关掉开关时整段静默
  const receipt = async (before, after, showAnlasCost = true) => {
    const hints = []
    const mctx = {
      channel: {
        connectorId: 'novelai',
        connectorConfig: { apiUrl: 'http://receipt.invalid', apiToken: 'test-key', model: 'nai-diffusion-4-5-full', showAnlasCost }
      },
      parameters: {},
      output: [{ kind: 'image', meta: { seed: 7 } }],
      ctx: { http: { get: async () => ({ ok: true, credits: after, models: [] }) } },
      addUserHint: (text, phase) => hints.push(`${phase}:${text}`),
      getMiddlewareLogs: () => ({ 'novelai-compat': { credits: before } })
    }
    await middlewareModule.createNovelAIResultInfoMiddleware().execute(mctx, async () => 'success')
    return hints
  }

  const spent = await receipt(100, 80)
  assert(spent.includes('after:消耗 20 积分 · 余 80 积分'), `应报本次消耗，实际 ${JSON.stringify(spent)}`)
  const toppedUp = await receipt(100, 120)
  assert(toppedUp.includes('after:余 120 积分') && !toppedUp.some(hint => hint.includes('消耗')),
    `余额上升（充值/并发）不应报消耗，实际 ${JSON.stringify(toppedUp)}`)
  const silent = await receipt(100, 80, false)
  assert(silent.every(hint => !hint.includes('积分')), `关闭 showAnlasCost 后不应有计费回执，实际 ${JSON.stringify(silent)}`)

  // 确认过价之后，预生成提示不再重复计费行（同一条流程只报一次价）
  const directiveHints = async (quoted) => {
    const hints = []
    const mctx = {
      channel: {
        connectorId: 'novelai',
        connectorConfig: { apiUrl: 'http://hint.invalid', apiToken: 'test-key', model: 'nai-diffusion-4-5-full', showAnlasCost: true }
      },
      prompt: '1girl',
      parameters: {},
      files: [],
      session: { platform: 'onebot', channelId: '1', userId: '42' },
      ctx: { http: { get: async () => ({ ok: true, credits: 100, models: [{ id: 'nai-diffusion-4-5-full', price: 1 }] }) } },
      getService: () => ({ get: () => ({}), takeEstimateShown: () => quoted }),
      addUserHint: (text) => hints.push(text),
      setMiddlewareLog: () => {},
      getMiddlewareLogs: () => ({})
    }
    await middlewareModule.createNovelAIDirectivesMiddleware().execute(mctx, async () => 'success')
    return hints
  }
  const withQuote = await directiveHints(false)
  assert(withQuote.some(hint => hint.includes('基础 1 积分/张')) && withQuote.some(hint => hint.includes('余 100 积分')),
    `未确认时应照旧报一次价，实际 ${JSON.stringify(withQuote)}`)
  const withoutQuote = await directiveHints(true)
  assert(withoutQuote.length === 1 && !withoutQuote[0].includes('积分'),
    `确认过价后只留生效参数、不重复计费行，实际 ${JSON.stringify(withoutQuote)}`)
  console.log('✓ 计费接口解析健壮性（数值强转护栏、降级文案）与生成后消耗回执')
}

/** 3.5 聊天指令解析与个人默认 */
async function checkChatLayer(baseUrl, token) {
  const { parseChatDirectives, stickySubset, applyOptionOverrides } = (await loadBuilt('lib/plugins/connector-novelai/chat-params.js')).default
  const { NovelAIChatState } = (await loadBuilt('lib/plugins/connector-novelai/chat-state.js')).default
  const { handleControl } = (await loadBuilt('lib/plugins/connector-novelai/control.js')).default
  const { parseCharacterFlags } = (await loadBuilt('lib/plugins/connector-novelai/chat-params.js')).default
  const { applyChatOverrides, describeEffective } = (await loadBuilt('lib/plugins/connector-novelai/chat-view.js')).default

  const parsedCases = [
    { input: '1girl 3:2 -t 24 -c 5.5', prompt: '1girl', resolution: '1216x832', steps: 24, scale: 5.5 },
    { input: '1girl 角色 0.8', prompt: '1girl', referenceMode: 'character', referenceStrength: 0.8 },
    { input: '1girl 氛围', prompt: '1girl', referenceMode: 'vibe', referenceStrength: 0.6 },
    { input: '1girl -s ea -d 12345', prompt: '1girl', sampler: 'k_euler_ancestral', seed: 12345 },
    { input: '1girl -s 7 -d 42 -n lowres, bad hands', prompt: '1girl', sampler: 'ddim_v3', seed: 42, negativePrompt: 'lowres, bad hands' },
    { input: '1girl -t 30 -n lowres -c 7', prompt: '1girl', steps: 30, scale: 7, negativePrompt: 'lowres' },
    { input: '1girl portrait landscape steps', prompt: '1girl portrait landscape steps' },
    { input: '2:3', prompt: '', resolution: '832x1216' },
    { input: '大横', prompt: '', resolution: '1536x1024' },
    { input: '1girl 1088x1920', prompt: '1girl', resolution: '1088x1920' },
    { input: '1girl 1000x1500', prompt: '1girl', resolution: '1024x1472' },
    { input: '1girl -z 2:3', prompt: '1girl', resolution: '832x1216' },
    { input: '-z 大横屏', prompt: '', resolution: '1536x1024' },
    { input: '1girl --size 1088x1920', prompt: '1girl', resolution: '1088x1920' },
    { input: '1girl -size 1000x1500', prompt: '1girl', resolution: '1024x1472' },
    { input: '1girl -z 不是尺寸', prompt: '1girl', unknown: true },
    { input: '1girl "2:3,"', prompt: '1girl', resolution: '832x1216' },
    { input: '1girl -t x', prompt: '1girl', unknown: true },
    { input: '1girl -t 99', prompt: '1girl', unknown: true },
    { input: '#二次元 1girl', prompt: '1girl', preset: '二次元' },
    { input: '1girl -noimg', prompt: '1girl', noImages: true },
    { input: '1girl 透明', prompt: '1girl', transparent: true },
    { input: '1girl 不透明', prompt: '1girl', transparent: false },
    { input: '1girl 大图横幅', prompt: '1girl', resolution: '1536x1024' },
    { input: '1girl 小图竖幅', prompt: '1girl', resolution: '512x768' },
    { input: '1girl -r 0.7', prompt: '1girl', cfgRescale: 0.7 },
    { input: '1girl -cr 0.5', prompt: '1girl', cfgRescale: 0.5 }
  ]

  for (const testCase of parsedCases) {
    const actual = parseChatDirectives(testCase.input)
    const okPrompt = testCase.prompt === undefined || actual.prompt === testCase.prompt
    const okKeys = Object.entries(testCase)
      .filter(([key]) => !['input', 'prompt', 'unknown', 'preset', 'noImages'].includes(key))
      .every(([key, value]) => actual.overrides[key] === value)
    const okUnknown = testCase.unknown === undefined ? actual.unknown.length === 0 : actual.unknown.length > 0
    const okPreset = testCase.preset === undefined ? actual.presetName === undefined : actual.presetName === testCase.preset
    const okNoImages = testCase.noImages === undefined ? actual.noImages === false : actual.noImages === true
    assert(okPrompt && okKeys && okUnknown && okPreset && okNoImages, `指令解析「${testCase.input}」→ ${JSON.stringify(actual)}`)
  }

  const fromOptions = {}
  applyOptionOverrides(fromOptions, { resolution: '大横屏', steps: 30 })
  assert(fromOptions.resolution === '1536x1024' && fromOptions.steps === 30,
    `argv.options 应把尺寸归一后并进覆盖值，实际 ${JSON.stringify(fromOptions)}`)

  const charRows = parseCharacterFlags('nai 1girl -k "aqua eyes, long hair@A1" -k "girl, red hair"')
  assert(charRows.length === 2 && charRows[0].position === 'A1' && charRows[0].prompt === 'aqua eyes, long hair'
    && charRows[1].prompt === 'girl, red hair' && charRows[1].position === undefined,
    `角色词回收应支持引号与 @位置，实际 ${JSON.stringify(charRows)}`)

  rmSync(join(outDir, 'state'), { recursive: true, force: true })
  const store = new NovelAIChatState({ baseDir: join(outDir, 'state') }, { info: () => {}, warn: () => {} })
  store.load()
  const session = { platform: 'onebot', channelId: '1000', userId: '42', event: { message: { elements: [] } } }
  const channel = {
    id: 1,
    name: 'nai',
    connectorId: 'novelai',
    connectorConfig: { apiUrl: baseUrl, apiToken: token, model: 'nai-diffusion-5-full' },
    tags: ['text2img']
  }
  const services = {
    channels: { getByName: async name => (name === 'nai' ? channel : null) },
    presets: { getMatchingPresets: async () => [{ name: '二次元', parameterOverrides: { steps: 20 } }] }
  }
  // 计费接口探测失败必须静默降级：这里给一个会抛错的 ctx，cost 之外的指令也不应被它拖垮
  const control = (text, options) => handleControl({
    ctx: { http: { get: async () => { throw new Error('计费接口不可用') } } },
    text,
    options,
    channel,
    session,
    services,
    state: store
  })

  const remembered = await control('默认 -t 24')
  assert(remembered?.includes('已记住') && remembered.includes('步数 24'), `「默认 -t 24」应回执保存值，实际「${remembered}」`)
  assert(Object.keys(store.get('onebot:1000:42')).length === 1, '个人默认应落库一条')

  const merged = applyChatOverrides({}, store.get('onebot:1000:42'), {})
  const params = resolveParams(channel.connectorConfig, merged)
  assert(params.steps === 24, `个人默认应生效，实际 ${params.steps}`)
  const shown = describeEffective(params, {
    message: {},
    parameters: {},
    sticky: store.get('onebot:1000:42'),
    config: channel.connectorConfig,
    hasImages: false
  })
  assert(shown.includes('步数 24（记住）'), `回显应带来源，实际「${shown}」`)

  const infoReply = await control('info')
  assert(infoReply?.includes('【生效】') && infoReply.includes('步数 24'), `「info」应回显生效值，实际「${infoReply}」`)
  assert(!infoReply.includes('预计消耗') && !infoReply.includes('积分'), 'info 不应混入计费信息')

  const estimated = await control('cost 大竖 -t 32')
  assert(estimated?.includes('预计消耗') && estimated.includes('1024×1536') && estimated.includes('步数 32'),
    `「cost」应给估算，实际「${estimated}」`)
  assert(!estimated.includes('【个人默认】') && !estimated.includes('【生效】'), 'cost 不应重复参数查询栏目')

  // 声明式 option 路径：Koishi 把 -z 摘走后只留 argv.options，尺寸必须照旧生效
  const sizedByOption = await control('cost', { resolution: '1088x1920', steps: 32 })
  assert(sizedByOption?.includes('1088×1920'), `-z（argv.options.resolution）应成为生效尺寸，实际「${sizedByOption}」`)
  const sizedByWord = await control('cost -z 大横屏')
  assert(sizedByWord?.includes('1536×1024'), `-z 的尺寸词应生效，实际「${sizedByWord}」`)

  const helpReply = await control('help')
  assert(helpReply?.includes('-t [1-64]') && helpReply.includes('-z [尺寸]') && helpReply.includes('本渠道'),
    `「help」应给参数表（含 -z），实际「${helpReply}」`)
  assert((await control('?'))?.includes('【NovelAI 出图】'), '「?」应等同 help')

  const bodyOnly = await control('-t 30')
  assert(bodyOnly?.includes('【生效】') && bodyOnly.includes('步数 30'), `只有参数没有正文时应回显而不是出图，实际「${bodyOnly}」`)
  assert(Object.keys(store.get('onebot:1000:42')).length === 1, '没有 set 时不应写入个人默认')

  assert((await control('1girl -t 40')) === null, '带正文的普通消息应放行去出图')
  assert((await control('1girl 默认')) === null, '正文里出现「默认」不应被当成子命令')

  const reset = await control('重置')
  assert(reset?.includes('已恢复默认'), `「重置」应回执，实际「${reset}」`)
  assert(Object.keys(store.get('onebot:1000:42')).length === 0, '重置后个人默认应为空')

  const seedRejected = await control('set -d 12345')
  assert(seedRejected?.includes('只能临时指定'), `种子不应被记住，实际「${seedRejected}」`)
  assert(store.get('onebot:1000:42').seed === undefined, '种子不应进个人默认')

  assert(Object.keys(stickySubset({ seed: 5, steps: 20 })).length === 1, 'stickySubset 应排除种子')

  // 落盘 + 重新载入：验证 respawn 后个人默认还在
  store.remember('onebot:1000:42', { steps: 33, scale: 6 })
  store.flush()
  const reloaded = new NovelAIChatState({ baseDir: join(outDir, 'state') }, { info: () => {}, warn: () => {} })
  reloaded.load()
  const afterReload = reloaded.get('onebot:1000:42')
  assert(afterReload.steps === 33 && afterReload.scale === 6, `重新载入后个人默认应保留，实际 ${JSON.stringify(afterReload)}`)
  reloaded.dispose()

  // 端点口径：余额与单价读可选计费接口；没有该接口时退回本地估算
  const relayChannel = { ...channel, connectorConfig: { ...channel.connectorConfig, apiUrl: 'https://compat.example' } }
  const relayPayload = {
    ok: true,
    credits: 1088,
    models: [
      { id: 'nai-diffusion-5-full', name: 'NovelAI V5 Full', price: 5 },
      { id: 'nai-diffusion-4-5-full', name: 'NovelAI V4.5 Full', price: 1 }
    ],
    service: { ready: true, admission: { paused: false, reason: '' } },
    message: 'Key 有效；此检查未生成图片、未扣积分。'
  }
  const relayCtx = { http: { get: async () => relayPayload } }
  const relayQuery = await handleControl({ ctx: relayCtx, text: 'cost', channel: relayChannel, session, services, state: store })
  assert(relayQuery?.includes('余 1088 积分') && relayQuery.includes('基础 5 积分/张') && relayQuery.includes('（NovelAI V5 Full）')
    && !relayQuery.includes('预计消耗'),
    `端点口径应回显余额与基础价而不是 Anlas，实际「${relayQuery}」`)
  // 氛围参考编码有报价接口；精准参考可能没有（取决于端点实现）
  const charCost = await handleControl({
    ctx: relayCtx, text: 'cost 角色 0.8', channel: relayChannel,
    session: { platform: 'onebot', channelId: '1000', userId: '42', event: { message: { elements: [{ type: 'img' }] } } },
    services, state: store
  })
  assert(charCost?.includes('参考图附加费按端点结算'), `参考图应标明附加费口径，实际「${charCost}」`)
  // 整单报价（POST /api/billing）：端点提供时直接用它，不自行推算。
  // 必须先测成功路径：报价接口一旦失败会进 5 分钟负缓存，后面的用例就走降级了。
  const quotaCtx = {
    http: {
      get: async () => relayPayload,
      post: async (url, body) => {
        assert(url.endsWith('/api/billing'), `整单报价应打 /api/billing，实际 ${url}`)
        assert(body.params?.precise?.length === 1 && body.params.size === '512x768',
          `报价 params 应带参考张数与尺寸（渠道未设尺寸时用官方第一档），实际 ${JSON.stringify(body.params).slice(0, 160)}`)
        return { cost: 14, validUntil: Date.now() + 60_000 }
      }
    }
  }
  const quotedCost = await handleControl({
    ctx: quotaCtx, text: 'cost 角色 0.8', channel: relayChannel,
    session: { platform: 'onebot', channelId: '1000', userId: '42', event: { message: { elements: [{ type: 'img' }] } } },
    services, state: store
  })
  assert(quotedCost?.includes('预计消耗 14 积分（端点报价）'), `有报价接口时应直接报端点价，实际「${quotedCost}」`)
  // 报价拿不到（端点未开放该组合）：只标基础价与附加费口径，不自己算
  const deniedCtx = {
    http: {
      get: async () => relayPayload,
      post: async () => {
        throw Object.assign(new Error('HTTP 400'), { response: { status: 400, data: { error: '报价参数无效，请检查模型、尺寸、步数及参考组合。' } } })
      }
    }
  }
  const deniedCost = await handleControl({
    ctx: deniedCtx, text: 'cost 角色 0.8', channel: relayChannel,
    session: { platform: 'onebot', channelId: '1000', userId: '42', event: { message: { elements: [{ type: 'img' }] } } },
    services, state: store
  })
  assert(deniedCost?.includes('基础 5 积分/张') && deniedCost.includes('参考图附加费按端点结算'),
    `报价不可用时应只标口径、不编数字，实际「${deniedCost}」`)
  const relayInfo = await handleControl({
    ctx: { http: { get: () => { throw new Error('info 不应请求账户接口') } } },
    text: 'info', channel: relayChannel, session, services, state: store
  })
  assert(relayInfo?.includes('【个人默认】') && !relayInfo.includes('积分') && !relayInfo.includes('【中转】'), 'cost 之外的 info 只显示参数信息')
  assert(!relayQuery.includes('【个人默认】') && !relayQuery.includes('【生效】'), 'cost 只显示计费信息')
  // 控制词本身不是预设名：存在同名预设（如叫 cost）时不得静默改掉查询的基准
  const trapPresets = { presets: { getMatchingPresets: async () => [{ name: 'cost', parameterOverrides: { steps: 50, resolution: '1024x1536' } }] } }
  for (const text of ['cost', 'info']) {
    const trapped = await handleControl({ ctx: relayCtx, text, channel: relayChannel, session, services: trapPresets, state: store })
    assert(!trapped.includes('步数 50') && !trapped.includes('1024×1536'),
      `「${text}」不应把控制词当预设名，实际「${trapped}」`)
  }
  // 生成前确认：作为「生成前置守卫」在命令层询问（位置＝收集模式之后、正在生成中之前）
  const { createNovelAIConfirmGuard } = (await loadBuilt('lib/plugins/connector-novelai/confirm.js')).default
  const confirmSession = (answer) => ({
    platform: 'onebot',
    channelId: '1000',
    userId: '42',
    sent: [],
    async send(text) { this.sent.push(text) },
    async prompt() { return answer }
  })
  const guardServices = {
    channels: { getByName: async name => (name === relayChannel.name ? relayChannel : name === channel.name ? channel : null) },
    presets: services.presets
  }
  const guard = createNovelAIConfirmGuard(relayCtx, guardServices, store, { debug: () => {} })
  const guardRequest = (session, text = '1girl', files = []) => ({ channel: relayChannel.name, prompt: text, files, parameters: {}, session })

  const accepted = confirmSession('y')
  assert(await guard(guardRequest(accepted)) === null, '回复「y」应放行去生成')
  assert(accepted.sent[0]?.includes('基础 5 积分/张') && accepted.sent[0].includes('回复「确认」或「y」'),
    `确认消息应带估价与回复提示，实际「${accepted.sent[0]}」`)
  assert(store.takeEstimateShown('onebot:1000:42') === true, '确认通过后应打上「已报过价」标记，避免重复计费行')

  const declined = confirmSession('算了')
  const aborted = await guard(guardRequest(declined))
  assert(aborted?.includes('已放弃本次生成') && aborted.includes('算了'), `非确认回复应放弃，实际「${aborted}」`)
  const timedOut = await guard(guardRequest(confirmSession(undefined)))
  assert(timedOut?.includes('等待确认超时'), `没有回复应超时放弃，实际「${timedOut}」`)

  // 端点没有计费接口时退回本地 Anlas 公式（官方 API 本来就没有询价端点）
  const noBillingCtx = { http: { get: async () => { throw new Error('HTTP 404') }, post: async () => { throw new Error('HTTP 404') } } }
  const officialGuard = createNovelAIConfirmGuard(noBillingCtx, {
    channels: { getByName: async () => ({ ...channel, connectorConfig: { ...channel.connectorConfig, apiUrl: 'https://no-billing.example' } }) },
    presets: services.presets
  }, store, { debug: () => {} })
  const asked = confirmSession('y')
  assert(await officialGuard(guardRequest(asked)) === null, '官方口径（模式 2）应确认后放行')
  assert(asked.sent[0]?.includes('本地估算') && asked.sent[0].includes('Anlas'),
    `没有计费接口时应给本地 Anlas 估算，实际「${asked.sent[0]}」`)
  // 模式 1：显式关闭后不再询问（与端点无关）
  const offChannel = { ...relayChannel, connectorConfig: { ...relayChannel.connectorConfig, confirmBefore: 'off' } }
  const offGuard = createNovelAIConfirmGuard(relayCtx, {
    channels: { getByName: async () => offChannel },
    presets: services.presets
  }, store, { debug: () => {} })
  const noAsk = confirmSession('不会用到')
  assert(await offGuard(guardRequest(noAsk)) === null && noAsk.sent.length === 0, '模式 1 不应询问')
  // 旧配置值（relay/always）仍按「要确认」处理
  const legacyGuard = createNovelAIConfirmGuard(relayCtx, {
    channels: { getByName: async () => ({ ...relayChannel, connectorConfig: { ...relayChannel.connectorConfig, confirmBefore: 'relay' } }) },
    presets: services.presets
  }, store, { debug: () => {} })
  const legacyAsked = confirmSession('y')
  assert(await legacyGuard(guardRequest(legacyAsked)) === null && legacyAsked.sent.length === 1, '旧值 relay 应继续确认')
  const noPromptSupport = { platform: 'onebot', channelId: '1000', userId: '42' }
  assert(await guard(guardRequest(noPromptSupport)) === null, '会话不支持等待回复时应直接放行，不阻断生成')
  const otherConnector = createNovelAIConfirmGuard(relayCtx, {
    channels: { getByName: async () => ({ ...relayChannel, connectorId: 'comfyui' }) },
    presets: services.presets
  }, store, { debug: () => {} })
  assert(await otherConnector(guardRequest(confirmSession('y'))) === null, '不是 novelai 渠道时不应介入')

  // 带覆盖参数的查询必须回显「按哪组参数算」，否则用户无法确认覆盖是否生效
  const relaySized = await handleControl({ ctx: relayCtx, text: 'cost 大竖 -t 32', channel: relayChannel, session, services, state: store })
  assert(relaySized?.startsWith('1024×1536 · 步数 32') && relaySized.includes('基础 5 积分/张'),
    `cost 应带生效尺寸与步数，实际「${relaySized}」`)

  const pausedCtx = {
    http: {
      get: async () => ({
        ...relayPayload,
        models: [{ id: 'nai-diffusion-4-5-curated', name: 'Curated', price: 1 }],
        service: { ready: true, admission: { paused: true, reason: '维护中' } }
      })
    }
  }
  const pausedQuery = await handleControl({
    ctx: pausedCtx,
    text: 'cost',
    channel: { ...relayChannel, connectorConfig: { ...relayChannel.connectorConfig, model: 'nai-diffusion-4-5-curated' } },
    session,
    services,
    state: store
  })
  assert(pausedQuery?.includes('已暂停受理：维护中'), `暂停受理应提示原因，实际「${pausedQuery}」`)

  const downQuery = await handleControl({
    ctx: { http: { get: async () => { throw new Error('HTTP 404') } } },
    text: 'cost',
    channel: { ...relayChannel, connectorConfig: { ...relayChannel.connectorConfig, model: 'nai-diffusion-4-5-full' } },
    session,
    services,
    state: store
  })
  assert(downQuery?.includes('未提供计费接口'), `读不到计费接口时应说明并退回本地估算，实际「${downQuery}」`)

  store.dispose()
  console.log('✓ 聊天指令：Flag 解析 / 比例尺寸 / 参考合并 / set·info·reset·cost·help / 种子护栏')
}

/** 4. 本地场景：请求体、参考图、错误路径 */
async function checkLocalScenarios(baseUrl, token) {
  const base = { apiUrl: baseUrl, apiToken: token, model: 'nai-diffusion-5-full', seed: 12345, showAnlasCost: true }
  const imageFiles = [{ data: toArrayBuffer(FIXTURE_PNG), mime: 'image/png', filename: 'ref.png' }]

  captured.length = 0
  const basic = await runConnector(base, [], '1girl, solo')
  const basicRequest = captured.at(-1)
  assert(basicRequest.path === '/ai/generate-image', `应打生成端点，实际 ${basicRequest.path}`)
  assert(basicRequest.body.model === 'nai-diffusion-5-full' && basicRequest.body.action === 'generate', 'body 顶层应为 model/action')
  assert(basicRequest.body.parameters.params_version === 4, 'V5 的 params_version 应为 4')
  const expectedPrompt = '1girl, solo'
  assert(basicRequest.body.input === expectedPrompt, `默认不应注入任何前缀，实际「${basicRequest.body.input}」`)
  assert(basicRequest.body.parameters.v4_prompt.caption.base_caption === expectedPrompt, 'v4_prompt 必须携带同一份提示词')
  assert(basicRequest.body.parameters.v4_negative_prompt !== undefined, 'V5 缺少 v4_negative_prompt 会 500，必须发送')
  assert(basicRequest.body.parameters.sm === undefined && basicRequest.body.parameters.sm_dyn === undefined, 'V5 不应发送 sm/sm_dyn')
  assert(basicRequest.body.parameters.straight_alpha === undefined, '默认不透明，不应发送 straight_alpha（V4 系与兼容端点会直接拒收）')
  assert(basicRequest.body.parameters.ucPresetId === 'heavy' && basicRequest.body.parameters.ucPreset === 0
    && basicRequest.body.parameters.tag_hint_uc_preset === 2, 'UC 预设三套编号应一致（heavy）')
  assert(basicRequest.body.parameters.seed === 12345, `seed 应沿用配置，实际 ${basicRequest.body.parameters.seed}`)
  assert(basic.outputs.length === 1 && basic.outputs[0].mime === 'image/png', '应解出 1 张 PNG')
  assert(basic.outputs[0].meta.anlas === 0 && basic.outputs[0].meta.opusFreeBand === true, '免费带内应记为 0 Anlas')
  assert(String(basic.outputs[0].url).startsWith('data:image/png;base64,'), '输出应是 data URL')
  writeFileSync(join(outDir, 'v5-basic.png'), Buffer.from(String(basic.outputs[0].url).split(',')[1], 'base64'))
  console.log('✓ V5 文生图请求体与响应解析')

  // 提示词前缀三态：off（默认）/ recommended / custom，并兼容旧配置
  for (const item of [
    { config: {}, expect: '1girl, solo', label: '默认不注入' },
    { config: { promptPrefixMode: 'recommended' }, expect: 'very aesthetic, masterpiece, no text, 1girl, solo', label: '模型推荐质量词' },
    { config: { promptPrefixMode: 'custom', promptPrefix: 'anime style' }, expect: 'anime style, 1girl, solo', label: '自定义前缀' },
    { config: { promptPrefix: 'legacy prefix' }, expect: 'legacy prefix, 1girl, solo', label: '旧配置只填文本＝自定义' },
    { config: { promptPrefix: '无' }, expect: '1girl, solo', label: '旧配置「无」＝不注入' }
  ]) {
    captured.length = 0
    await runConnector({ ...base, ...item.config }, [], '1girl, solo')
    const sent = captured.at(-1).body.input
    assert(sent === item.expect, `${item.label}：input 应为「${item.expect}」，实际「${sent}」`)
  }
  console.log('✓ 提示词前缀三态与旧配置迁移')

  // 透明通道：默认关；开了且模型支持才下发（V4 系会拒收该字段）
  for (const item of [
    { config: { transparent: true }, model: 'nai-diffusion-5-full', expect: true, label: 'V5 + 开启' },
    { config: {}, model: 'nai-diffusion-5-full', expect: undefined, label: 'V5 + 默认关' },
    { config: { transparent: true }, model: 'nai-diffusion-4-5-full', expect: undefined, label: 'V4.5 + 开启（不收）' }
  ]) {
    captured.length = 0
    await runConnector({ ...base, ...item.config, model: item.model }, [], '1girl')
    const sent = captured.at(-1).body.parameters.straight_alpha
    assert(sent === item.expect, `${item.label}：straight_alpha 应为 ${item.expect}，实际 ${sent}`)
  }
  console.log('✓ 透明通道门控（默认关 / 仅 V5 下发）')

  const recorded = await runConnector(base, [], '1girl')
  const recordedMeta = recorded.outputs[0].meta
  assert(recordedMeta.endpoint === baseUrl && recordedMeta.pricing === undefined && typeof recordedMeta.anlas === 'number',
    `结果记录应带端点与服务端 Anlas 估算、不带计费口径，实际 ${JSON.stringify(recordedMeta)}`)
  const recordedLog = NovelAIConnector.getRequestLog(base, [], '1girl', {})
  assert(recordedLog.endpoint === baseUrl && typeof recordedLog.parameters.estimatedAnlas === 'number',
    `请求日志应带端点与本地估算，实际 ${JSON.stringify(recordedLog)}`)
  console.log('✓ 结果记录只记端点与本地估算（不写死计费口径）')

  captured.length = 0
  const vibeError = await runConnector(base, imageFiles, 'cat')
  assert(vibeError.error?.includes('氛围参考') && vibeError.error?.includes('V4.5'),
    `V5 + 图片应明确报错并指出可用模型，实际「${vibeError.error}」`)
  assert(captured.length === 0, '报错时不应发出任何请求')

  const offError = await runConnector({ ...base, referenceMode: 'off' }, imageFiles, 'cat')
  assert(offError.error?.includes('不使用参考图'), `参考图模式为 off 时应明确报错，实际「${offError.error}」`)

  const unauthorized = await runConnector({ ...base, apiToken: 'pst-bad' }, [], '1girl')
  assert(unauthorized.error?.includes('401'), `401 应被翻译成可读错误，实际「${unauthorized.error}」`)

  const trialGate = await runConnector(base, [], 'trial-gate')
  assert(trialGate.error?.includes('试用档') && trialGate.error.includes('reCAPTCHA'),
    `试用档策略拒绝应给出可行动提示，实际「${trialGate.error}」`)

  const relayGate = await runConnector(base, [], 'relay-gate')
  assert(relayGate.error?.includes('邀请积分'), `中转通用拒绝应给出积分资格提示，实际「${relayGate.error}」`)
  console.log('✓ 错误路径（模型不支持参考图 / 参考图模式 off / 401）')

  captured.length = 0
  const characterRef = await runConnector(
    { ...base, model: 'nai-diffusion-4-5-full', referenceMode: 'character', referenceStrength: 0.8, referenceFidelity: 0.5 },
    imageFiles,
    '1girl, 2boys',
    { characterPrompts: [{ prompt: 'girl, red hair', position: 'A1' }, { prompt: 'boy, blue hair', position: '0.8,0.3' }] }
  )
  const characterRequest = captured.at(-1)
  const characterParams = characterRequest.body.parameters
  assert(characterParams.params_version === 3, 'V4.5 的 params_version 应为 3')
  assert(characterParams.straight_alpha === undefined, 'V4 系不应发送 straight_alpha（兼容端点会拒收，实测 400）')
  assert(characterParams.director_reference_images.length === 1
    && characterParams.director_reference_strength_values[0] === 0.8
    && characterParams.director_reference_secondary_strength_values[0] === 0.5, '角色参考参数应原样下发')
  assert(characterParams.use_coords === true && characterParams.characterPrompts.length === 2, '多角色应写入 characterPrompts')
  assert(JSON.stringify(characterParams.characterPrompts[0].center) === JSON.stringify({ x: 0.1, y: 0.1 })
    && JSON.stringify(characterParams.characterPrompts[1].center) === JSON.stringify({ x: 0.8, y: 0.3 }),
    `网格 A1 应换算成 0.1,0.1，连续坐标原样保留，实际 ${JSON.stringify(characterParams.characterPrompts.map(p => p.center))}`)
  assert(characterParams.v4_prompt.caption.char_captions.length === 2
    && characterParams.v4_prompt.caption.base_caption.endsWith('1girl, 2boys'),
    'v4_prompt 应同时带基准提示词与角色提示词')
  assert(characterRef.outputs[0].meta.characterCount === 2 && characterRef.outputs[0].meta.anlas >= 5, '角色参考应计入 Anlas')
  writeFileSync(join(outDir, 'v45-characters.png'), Buffer.from(String(characterRef.outputs[0].url).split(',')[1], 'base64'))
  console.log('✓ V4.5 角色参考 + 多角色位置控制')

  captured.length = 0
  const vibe = await runConnector(
    { ...base, model: 'nai-diffusion-4-5-full', referenceMode: 'vibe', referenceStrength: 0.7 },
    imageFiles,
    'style test'
  )
  const vibeRequestBody = captured.find(request => request.path === '/ai/generate-image').body
  assert(captured.filter(request => request.path === '/ai/encode-vibe').length === 1, '氛围参考应先编码')
  assert(vibeRequestBody.parameters.reference_image_multiple.length === 1
    && vibeRequestBody.parameters.reference_strength_multiple[0] === 0.7
    && vibeRequestBody.parameters.normalize_reference_strength_multiple === true, '氛围参考字段应齐全')
  assert(vibe.outputs[0].meta.anlas >= 2, '氛围参考编码应计入 Anlas')
  writeFileSync(join(outDir, 'v45-vibe.png'), Buffer.from(String(vibe.outputs[0].url).split(',')[1], 'base64'))
  console.log('✓ V4.5 氛围参考（encode-vibe → 生成）')

  const jpegBytes = jpeg.encode(PNG.sync.read(FIXTURE_PNG), 90).data
  const expectedPixels = jpeg.decode(jpegBytes).data
  // 故意给错误 MIME/扩展名，转换必须依据内容，而非附件标签。
  const jpegFiles = [{ data: toArrayBuffer(jpegBytes), mime: 'image/png', filename: 'wrong.png' }]
  for (const referenceMode of ['vibe', 'character']) {
    captured.length = 0
    const result = await runConnector({ ...base, model: 'nai-diffusion-4-5-full', referenceMode }, jpegFiles, 'reference conversion')
    assert(!result.error, `${referenceMode} JPEG 转换不应失败：${result.error}`)
    const sent = referenceMode === 'vibe'
      ? JSON.parse(captured.find(row => row.path === '/ai/encode-vibe').body).image
      : captured.find(row => row.path === '/ai/generate-image').body.parameters.director_reference_images[0]
    const png = PNG.sync.read(Buffer.from(sent, 'base64'))
    if (referenceMode === 'vibe') {
      assert(png.width === 8 && png.height === 8 && png.data.equals(expectedPixels), '氛围转换须保留 JPEG 解码后的尺寸与像素')
    } else {
      assert(png.width === 1472 && png.height === 1472, '角色方图必须规范为 1472×1472')
    }
    captured.length = 0
    const broken = await runConnector({ ...base, model: 'nai-diffusion-4-5-full', referenceMode }, [
      { data: toArrayBuffer(Buffer.from([0xff, 0xd8, 0x00])), mime: 'image/jpeg' }
    ], 'broken reference')
    assert(broken.error?.includes('JPEG 解码失败') && captured.length === 0, `${referenceMode} 损坏 JPEG 应在发请求前报错`)
    // 魔数合法但截断的 PNG：两条参考路径都必须本地报错，而不是发出去换个看不懂的 400
    const truncatedPng = PNG.sync.write({ width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4, 255) }).subarray(0, 40)
    captured.length = 0
    const brokenPng = await runConnector({ ...base, model: 'nai-diffusion-4-5-full', referenceMode }, [
      { data: toArrayBuffer(Buffer.from(truncatedPng)), mime: 'image/png' }
    ], 'broken png')
    assert(brokenPng.error?.includes('PNG 已损坏') && captured.length === 0,
      `${referenceMode} 损坏 PNG 应本地报错，实际「${brokenPng.error}」`)
    // 超过参考图上限（约 2.9MB base64 4e6 字符）的图：本地报错并给出可行动提示，不发请求
    let seed = 123456789
    const noisy = Buffer.alloc(1472 * 1472 * 4)
    for (let i = 0; i < noisy.length; i++) {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      noisy[i] = seed & 0xff
    }
    captured.length = 0
    const tooBig = await runConnector({ ...base, model: 'nai-diffusion-4-5-full', referenceMode }, [
      { data: toArrayBuffer(PNG.sync.write({ width: 1472, height: 1472, data: noisy })), mime: 'image/png' }
    ], 'oversized reference')
    assert(tooBig.error?.includes('参考图上限') && captured.length === 0,
      `${referenceMode} 超大参考图应本地报错，实际「${tooBig.error}」`)
  }
  console.log('✓ JPEG 参考图转 PNG（氛围/角色、内容识别、像素保持、损坏/超大图片拒绝）')

  for (const [width, height, targetWidth, targetHeight, edge] of [
    [2, 4, 1024, 1536, true], [4, 2, 1536, 1024, true],
    [1920, 1920, 1472, 1472, false], [1472, 1472, 1472, 1472, false]
  ]) {
    const data = Buffer.alloc(width * height * 4)
    for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 3] = 128 }
    const input = PNG.sync.write({ width, height, data })
    captured.length = 0
    await runConnector({ ...base, model: 'nai-diffusion-4-5-full', referenceMode: 'character' }, [
      { data: toArrayBuffer(input), mime: 'image/png' }
    ], 'reference geometry')
    const encoded = Buffer.from(captured.at(-1).body.parameters.director_reference_images[0], 'base64')
    const output = PNG.sync.read(encoded)
    assert(output.width === targetWidth && output.height === targetHeight, `角色参考 ${width}×${height} 画布尺寸错误`)
    if (width === targetWidth && height === targetHeight) {
      assert(encoded.equals(input), '已符合画布尺寸的 PNG 必须原样发送')
    } else {
      const center = (Math.floor(targetHeight / 2) * targetWidth + Math.floor(targetWidth / 2)) * 4
      assert(output.data.subarray(center, center + 4).equals(Buffer.from([128, 0, 0, 255])), '缩放须保持颜色并正确合成透明像素')
      if (edge) assert(output.data.subarray(0, 4).equals(Buffer.from([0, 0, 0, 255])), '长宽比不符时须补黑边而非拉伸')
    }
  }
  console.log('✓ 角色参考规范画布（横/竖/方、缩小/放大、补边、透明合成、合规 PNG 原样保留）')
}

/** 5. 真实 API 文生图 */
async function checkLiveGeneration(baseUrl, token) {
  const official = /(^|\.)novelai\.net$/i.test(new URL(baseUrl).host)
  const config = {
    apiUrl: baseUrl,
    apiToken: token,
    model: options.model,
    resolution: options.resolution,
    seed: -1,
    showAnlasCost: true,
  }
  if (options.steps) config.steps = Number(options.steps)
  console.log(`模型 ${options.model} · ${options.resolution}${options.steps ? ` · ${options.steps} 步` : ''} · 端点 ${official ? '官方' : '兼容'}`)

  const result = await runConnector(config, [], options.prompt)
  if (result.error) {
    failures.push(`真实 API 文生图失败：${result.error}`)
    return
  }
  const meta = result.outputs[0].meta
  const file = join(outDir, `live-${Date.now()}.png`)
  writeFileSync(file, Buffer.from(String(result.outputs[0].url).split(',')[1], 'base64'))
  console.log(`✓ 真实 API 出图：${file}`)
  const cost = `本地估算 ${meta.anlas} Anlas（真实消耗以端点计费接口为准）`
  console.log(`  模型 ${meta.model} · ${meta.width}x${meta.height} · ${meta.steps} 步 · CFG ${meta.scale} · 种子 ${meta.seed} · ${cost}`)
}

/** 6. 真实 API 参考图（会消耗 Anlas，需显式 --references） */
async function checkLiveReferences(baseUrl, token) {
  const imageFiles = [{ data: toArrayBuffer(FIXTURE_PNG), mime: 'image/png', filename: 'ref.png' }]
  const result = await runConnector(
    { apiUrl: baseUrl, apiToken: token, model: 'nai-diffusion-4-5-full', referenceMode: 'vibe', referenceStrength: 0.6, seed: -1 },
    imageFiles,
    options.prompt
  )
  if (result.error) {
    failures.push(`真实 API 氛围参考失败：${result.error}`)
    return
  }
  const file = join(outDir, `live-vibe-${Date.now()}.png`)
  writeFileSync(file, Buffer.from(String(result.outputs[0].url).split(',')[1], 'base64'))
  console.log(`✓ 真实 API 氛围参考出图：${file}`)
}

/** 走连接器本体，捕获异常为 error 字段 */
async function runConnector(config, files, prompt, parameters = {}) {
  try {
    const outputs = await NovelAIConnector.generate(fakeContext(), config, files, prompt, parameters)
    return { outputs }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function fakeContext() {
  return {
    http: {
      async post(url, data, config = {}) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(config.headers ?? {}) },
          body: JSON.stringify(data)
        })
        const buffer = Buffer.from(await response.arrayBuffer())
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`)
          error.response = { status: response.status, data: buffer }
          throw error
        }
        return toArrayBuffer(buffer)
      }
    }
  }
}

/** 进程内假 NovelAI 服务 */
async function startFakeServer() {
  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const raw = Buffer.concat(chunks)
      const path = request.url ?? '/'
      const authorization = request.headers.authorization ?? ''

      if (!authorization.startsWith('Bearer pst-') || authorization.includes('bad')) {
        response.writeHead(401, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ statusCode: 401, message: 'Unauthorized' }))
        return
      }

      if (path === '/ai/encode-vibe') {
        captured.push({ path, body: raw.toString('utf8') })
        response.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        response.end(Buffer.from('fake-vibe-token'))
        return
      }

      const body = JSON.parse(raw.toString('utf8'))
      captured.push({ path, body })

      if (typeof body.input === 'string' && body.input.includes('relay-gate')) {
        response.writeHead(400, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ statusCode: 400, message: '请求未完成，请提供问题编号联系管理员。', requestId: 'x' }))
        return
      }

      if (typeof body.input === 'string' && body.input.includes('trial-gate')) {
        response.writeHead(400, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ statusCode: 400, message: 'Recaptcha token is required for trial generation' }))
        return
      }

      if (typeof body.input === 'string' && body.input.includes('只允许一张')) {
        response.writeHead(429, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ statusCode: 429, message: 'Concurrent generation is locked' }))
        return
      }

      const missing = ['params_version', 'v4_prompt', 'v4_negative_prompt', 'width', 'height', 'steps', 'sampler']
        .filter(key => body.parameters?.[key] === undefined)
      if (missing.length > 0) {
        response.writeHead(400, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ statusCode: 400, message: `missing ${missing.join(',')}` }))
        return
      }

      response.writeHead(200, { 'Content-Type': 'application/x-zip-compressed' })
      response.end(Buffer.from(zipSync({ 'image_0.png': new Uint8Array(FIXTURE_PNG) })))
    })
  })

  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolveClose => server.close(resolveClose))
  }
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function assert(condition, message) {
  if (condition) return
  failures.push(message)
  console.error(`✗ ${message}`)
  const lastRequest = captured.at(-1)
  if (lastRequest) console.error(`  最近一次请求：${lastRequest.path} ${JSON.stringify(lastRequest.body).slice(0, 600)}`)
}

function parseOptions(args) {
  const parsed = {
    token: process.env.NOVELAI_TOKEN,
    resolution: '832x1216',
    steps: undefined,
    baseUrl: undefined,
    model: 'nai-diffusion-5-full',
    prompt: '1girl, solo, best quality',
    references: false
  }
  for (let index = 0; index < args.length; index++) {
    const key = args[index]
    if (key === '--token') parsed.token = args[++index]
    else if (key === '--base-url') parsed.baseUrl = args[++index]
    else if (key === '--model') parsed.model = args[++index]
    else if (key === '--resolution') parsed.resolution = args[++index]
    else if (key === '--steps') parsed.steps = args[++index]
    else if (key === '--prompt') parsed.prompt = args[++index]
    else if (key === '--references') parsed.references = true
  }
  return parsed
}

await main()
