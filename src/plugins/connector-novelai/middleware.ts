// NovelAI 的两个小中间件
//
// 1. novelai-directives：解析聊天里的中文指令（尺寸/参考用途/步数/CFG/强度/采样/种子/负面），
//    落实个人默认（「记住」），并在生成前回显「生效值 + 来源」与 Anlas 预告。
// 2. novelai-result-info：生成后回报实际种子与消耗，让群里的结果可复现。
//
// 只认中文关键词，不认 portrait / landscape 这类英文词：它们本身就是常用 NAI 标签。

import type { MiddlewareContext, MiddlewareDefinition, MiddlewareRunStatus } from '../../core'
import { parseCharacterFlags, parseChatDirectives, stickySubset } from './chat-params'
import { NovelAIChatState, chatStateKey, type ChatStateScope } from './chat-state'
import { applyChatOverrides, describeEffective, describeOverrides } from './chat-view'
import { resolveSizeText, resolveParams } from './params'
import { describeCompatSpend, fetchCompatAccount } from './compat'
import { describeEstimate } from './control'

function readScope(mctx: MiddlewareContext): ChatStateScope | null {
  const session = mctx.session
  if (!session?.platform || !session.channelId || !session.userId) return null
  return {
    platform: session.platform,
    channelId: String(session.channelId),
    userId: String(session.userId)
  }
}

/**
 * `#预设名` 必须在预设中间件之前落成 parameters.preset：
 * 「第一个词是预设名」的框架规则会误吃正文，显式 # 标记才无歧义。
 */
export function createNovelAIPresetMiddleware(): MiddlewareDefinition {
  return {
    name: 'novelai-preset',
    displayName: 'NovelAI 预设选择',
    description: '把消息里的 #预设名 落成 parameters.preset，并在预设不存在时明确提示（而不是静默忽略）',
    category: 'preset',
    phase: 'lifecycle-pre-request',
    before: ['preset'],
    configGroup: 'connector-novelai',

    async execute(mctx: MiddlewareContext, next: () => Promise<MiddlewareRunStatus>): Promise<MiddlewareRunStatus> {
      if (mctx.channel?.connectorId !== 'novelai') return next()

      const parsed = parseChatDirectives(mctx.prompt)
      // 只认 #预设名；不要改写 prompt（后面的 novelai-directives 还要解析 Flag 与尺寸）
      if (!parsed.presetName) return next()

      const service = mctx.getService<{ getByName(name: string): Promise<object | null> }>('preset')
      if (service && !(await service.getByName(parsed.presetName))) {
        mctx.addUserHint(`没有叫「${parsed.presetName}」的预设，已忽略 #${parsed.presetName}`, 'before')
        return next()
      }

      mctx.parameters = { ...mctx.parameters, preset: parsed.presetName }
      mctx.setMiddlewareLog('novelai-preset', { preset: parsed.presetName })
      return next()
    }
  }
}

/** 聊天指令 + 个人默认 + Anlas 预告 */
export function createNovelAIDirectivesMiddleware(): MiddlewareDefinition {
  return {
    name: 'novelai-directives',
    displayName: 'NovelAI 聊天指令',
    description: '解析提示词里的中文指令（尺寸/参考/步数/CFG/强度/采样/种子/负面；记住/查询/重置/查点数），落实个人默认并预告 Anlas',
    category: 'transform',
    phase: 'lifecycle-pre-request',
    after: ['preset'],
    // modelscope 中间件默认对所有渠道生效，也会解析尺寸关键词，故抢在它前面消费指令
    before: ['modelscope'],
    configGroup: 'connector-novelai',

    async execute(mctx: MiddlewareContext, next: () => Promise<MiddlewareRunStatus>): Promise<MiddlewareRunStatus> {
      if (mctx.channel?.connectorId !== 'novelai') return next()

      const parsed = parseChatDirectives(mctx.prompt)
      const state = mctx.getService<NovelAIChatState>('novelai-chat')
      const scope = readScope(mctx)
      const scopeKey = state && scope ? chatStateKey(scope) : null
      const sticky = state && scopeKey ? state.get(scopeKey) : {}
      const stored = mctx.parameters

      if (state && scopeKey && parsed.remember) {
        const patch = stickySubset(parsed.overrides)
        if (Object.keys(patch).length > 0) {
          state.remember(scopeKey, patch)
          mctx.addUserHint(`已记住：${describeOverrides(patch)}`, 'before')
        }
        if (parsed.overrides.seed !== undefined) mctx.addUserHint('种子只能临时指定，不会记住', 'before')
      }

      mctx.prompt = parsed.prompt || mctx.prompt
      // -noimg：用户明确要求忽略附件图，直接在进请求前摘掉（不是“静默丢弃”，回执里会写）
      if (parsed.noImages) {
        const images = mctx.files.filter(file => file.mime?.startsWith('image/'))
        if (images.length > 0) {
          mctx.files = mctx.files.filter(file => !file.mime?.startsWith('image/'))
          mctx.addUserHint(`已按 -noimg 忽略 ${images.length} 张图片`, 'before')
        }
      }
      mctx.parameters = applyChatOverrides(stored, sticky, parsed.overrides)

      // 尺寸可能来自 -z（声明式 option 直接落进 parameters）、预设或记住的个人默认：
      // 取值不认识时明确提示并退回渠道默认，而不是静默按别的尺寸出图
      const sizeText = mctx.parameters?.resolution
      if (typeof sizeText === 'string' && sizeText && sizeText !== 'custom' && !resolveSizeText(sizeText)) {
        mctx.addUserHint(`尺寸「${sizeText}」不认识（例：2:3 / 大横屏 / 1088x1920），本次按渠道默认出图`, 'before')
        mctx.parameters = { ...mctx.parameters }
        delete mctx.parameters.resolution
      }

      // 角色词从原始消息回收（-ch … 可重复；Koishi 已把它从提示词里摘走）。
      // 必须写在 applyChatOverrides 之后，否则会被那次整体赋值覆盖。
      const rawContent = mctx.session?.content
      if (rawContent) {
        const characters = parseCharacterFlags(rawContent)
        if (characters.length > 0) {
          mctx.parameters = { ...mctx.parameters, characterPrompts: characters }
          mctx.addUserHint(`角色词 ${characters.length} 条${characters.some(row => row.position) ? '（含位置）' : ''}`, 'before')
        }
      }

      if (parsed.matched.length > 0 || parsed.unknown.length > 0) {
        mctx.setMiddlewareLog('novelai-directives', {
          matched: parsed.matched,
          unknown: parsed.unknown,
          overrides: parsed.overrides,
          sticky
        })
      }

      if (parsed.unknown.length > 0) {
        mctx.addUserHint(`没听懂：${parsed.unknown.join('、')}（已从提示词移除）`, 'before')
      }

      const params = resolveParams(mctx.channel.connectorConfig, mctx.parameters)
      const images = mctx.files.filter(file => file.mime?.startsWith('image/'))
      if (params.showAnlasCost) {
        const effective = describeEffective(params, {
          message: parsed.overrides,
          parameters: stored,
          sticky,
          config: mctx.channel.connectorConfig,
          hasImages: images.length > 0
        })
        // 生成前确认刚报过价：这里只回生效参数，不再重复计费行
        const quoted = state && scopeKey ? state.takeEstimateShown(scopeKey) : false
        if (quoted) {
          mctx.addUserHint(effective, 'before')
        } else {
          const estimate = await describeEstimate(mctx.ctx, params, images.length, mctx.prompt)
          mctx.addUserHint(`${effective} · ${estimate[1]}`, 'before')
          for (const line of estimate.slice(2)) mctx.addUserHint(line, 'before')
        }
        // 计费扩展是可选能力：命中 60 秒缓存，只是把余额留给生成后回执做差值
        const account = await fetchCompatAccount(mctx.ctx, params)
        if (account.ok) {
          mctx.setMiddlewareLog('novelai-compat', {
            credits: account.account.credits,
            price: account.account.price ?? null,
            model: params.model
          })
        }
      }

      return next()
    }
  }
}

/** 生成后回执：种子与消耗 */
export function createNovelAIResultInfoMiddleware(): MiddlewareDefinition {
  return {
    name: 'novelai-result-info',
    displayName: 'NovelAI 结果回执',
    description: '生成后回报实际种子与消耗，便于同种子复现',
    category: 'custom',
    phase: 'lifecycle-post-request',
    configGroup: 'connector-novelai',

    async execute(mctx: MiddlewareContext, next: () => Promise<MiddlewareRunStatus>): Promise<MiddlewareRunStatus> {
      if (mctx.channel?.connectorId !== 'novelai') return next()

      const meta = mctx.output?.find(asset => asset.kind === 'image')?.meta
      if (meta && meta.seed !== undefined) {
        const parts = [`种子 ${meta.seed}`]
        if (meta.anlas !== undefined) parts.push(`约 ${meta.anlas} Anlas`)
        if (meta.characterCount) parts.push(`角色 ${meta.characterCount}`)
        if (meta.referenceCount) parts.push(`参考图 ${meta.referenceCount}`)
        mctx.addUserHint(parts.join(' · '), 'after')
      }

      // 生成后取最新余额，对照生成前的快照报出本次消耗；没有快照（端点无计费接口）就整段跳过
      const params = resolveParams(mctx.channel.connectorConfig, mctx.parameters)
      if (params.showAnlasCost) {
        const logged = mctx.getMiddlewareLogs()['novelai-compat']
        const before = logged && typeof logged.credits === 'number' ? logged.credits : null
        if (before !== null) {
          const account = await fetchCompatAccount(mctx.ctx, params, { fresh: true })
          if (account.ok) mctx.addUserHint(describeCompatSpend(before, account.account), 'after')
        }
      }

      return next()
    }
  }
}
