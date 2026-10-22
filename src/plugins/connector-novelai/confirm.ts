// 生成前确认：中转渠道（或配成「始终确认」）在出图前先报一次价，等用户回复确认才真正生成。
//
// 位置很关键：它是 core 的「生成前置守卫」，由命令层在真正调用生成前询问 ——
// 也就是落在 medialuna 原生的「已进入收集模式…」之后、「正在生成中…」之前。
// 不走管道中间件：pre-request 中间件返回 STOP 时管道会走「成功但空输出」分支，
// 交付层再补一句「生成完成，但没有输出」，比在命令层中止难看。

import type { Context } from 'koishi'
import type { GenerateGuard } from '../../core'
import { applyOptionOverrides, parseChatDirectives } from './chat-params'
import { NovelAIChatState, chatStateKey } from './chat-state'
import { describeEstimate, readScope, resolveForMessage, type ControlLogger, type ControlServices } from './control'

/** 等待窗口与「确认」词表（其它任何内容都算放弃） */
const CONFIRM_WINDOW = 60_000
const CONFIRM_WORDS = /^(y|yes|确认|确定|ok|go|生成|是|好的?)$/i

/** 会话上确认流程需要的能力（结构类型，测试可给桩对象） */
interface ConfirmSession {
  send?(content: string): Promise<unknown>
  prompt?(callback: (session: ConfirmIncoming) => string | undefined, options?: { timeout?: number }): Promise<string | undefined>
}

interface ConfirmIncoming {
  userId?: unknown
  content?: string
}

/**
 * 等本人在同一会话里的下一条消息。
 * Koishi 的 `session.prompt` 按会话（fid）过滤、不区分用户，而且第一条消息就让等待结束，
 * 所以这里循环调用并在回调里按 userId 过滤：别人的发言既不参与确认，也不打断等待。
 */
async function waitForAnswer(session: ConfirmSession, userId: string, deadline: number): Promise<string | undefined> {
  while (Date.now() < deadline) {
    const answer = await session.prompt?.((incoming: ConfirmIncoming) => (
      String(incoming?.userId ?? '') === userId ? String(incoming?.content ?? '').trim() : undefined
    ), { timeout: Math.max(1, deadline - Date.now()) })
    if (answer !== undefined) return answer
  }
  return undefined
}

export function createNovelAIConfirmGuard(
  ctx: Context,
  services: ControlServices,
  state: NovelAIChatState,
  logger: ControlLogger
): GenerateGuard {
  return async (request) => {
    const channelName = typeof request.channel === 'string' ? request.channel : ''
    if (!channelName) return null

    const channel = await services.channels.getByName(channelName)
    if (!channel || channel.connectorId !== 'novelai') return null

    const text = request.prompt ?? ''
    const parsed = parseChatDirectives(text)
    applyOptionOverrides(parsed.overrides, request.parameters ?? {})
    const scope = readScope(request.session)
    const scopeKey = scope ? chatStateKey(scope) : null
    const sticky = scopeKey ? state.get(scopeKey) : {}
    const { params } = await resolveForMessage(services, channel, sticky, parsed.overrides, text, parsed.presetName)

    // 模式 2：先估价再确认。估价来源跟随渠道的计费口径（官方公式 / 中转报价），与站点无关
    if (params.confirmBefore !== 'on') return null

    const session = request.session as ConfirmSession | null
    if (!scope || typeof session?.send !== 'function' || typeof session.prompt !== 'function') {
      logger.debug('[novelai] 会话不支持等待回复，跳过生成前确认')
      return null
    }

    const images = (request.files ?? []).filter(file => file.mime?.startsWith('image/')).length
    const estimate = await describeEstimate(ctx, params, images, text)
    await session.send(`${estimate.join('\n')}\n回复「确认」或「y」开始生成，其它任意内容视为放弃（${CONFIRM_WINDOW / 1000} 秒）`)

    const answer = await waitForAnswer(session, scope.userId, Date.now() + CONFIRM_WINDOW)
    if (!answer || !CONFIRM_WORDS.test(answer)) {
      return answer ? `已放弃本次生成（收到「${answer.slice(0, 20)}」）` : '等待确认超时，已放弃本次生成'
    }

    // 刚才已经报过价：后面的预生成提示不再重复计费行
    if (scopeKey) state.markEstimateShown(scopeKey)
    return null
  }
}
