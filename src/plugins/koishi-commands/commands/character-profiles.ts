import { h, type Session } from 'koishi'
import type { CharacterProfileService } from '../../character-profile'
import type { CacheService } from '../../cache'
import type { CharacterProfileData } from '../../character-profile/service'
import { MessageExtractor, type CollectState } from '../services/message-extractor'
import type { KoishiCommandsConfig } from '../config'
import { deleteMessages } from '../services/generation-flow'

const PUBLIC_PROFILE_PAGE_SIZE = 10

interface RegisterCharacterProfileCommandsOptions {
  ctx: any
  logger: any
  parentCommand: string
  mediaLuna: any
  config: KoishiCommandsConfig
}

export function registerCharacterProfileCommands(options: RegisterCharacterProfileCommandsOptions): Array<() => void> {
  const { ctx, logger, parentCommand, mediaLuna, config } = options
  const disposables: Array<() => void> = []

  const helpCmd = ctx.command(`${parentCommand}.character.help`, '角色设定功能帮助')
    .alias('角色设定帮助')
    .action(() => {
      return [
        '【角色设定帮助】',
        '',
        '一、新增自己的设定',
        `1. 直接开始收集：新增设定`,
        `2. 一条消息直接完成：新增设定 <设定名> <描述> + 同条消息附图`,
        '3. 渐进式收集时，可以继续发送文字和图片',
        '4. 发送「完成」保存，发送「取消」放弃',
        '',
        '二、查看和管理自己的设定',
        '1. 设定列表',
        '2. 查看设定 <设定名>',
        '3. 删除设定 <设定名>',
        '',
        '三、开放自己的设定给别人使用',
        '1. 开放设定 <设定名> [公开简介]',
        '2. 关闭开放设定 <设定名>',
        '说明：开放后会得到公开编号，别人可通过公开列表查看并添加',
        '',
        '四、浏览和添加开放设定',
        '1. 开放设定列表 [关键词] [页码]',
        '2. 查看开放设定 <公开编号>',
        '3. 添加开放设定 <公开编号> [新名字]',
        '说明：别人开放的设定，必须先添加到自己名下，才会对自己的生成生效',
        '',
        '五、在提示词里引用设定',
        '1. 推荐写法：@设定名@',
        '2. 只要 prompt 里出现 @设定名@，就只尝试匹配这种显式引用',
        '3. 如果没有任何 @设定名@，才会退回普通名称匹配',
        '4. 默认可用 @@ 作为“跳过设定替换”标记，出现后会跳过替换并移除该标记（此标记可在插件配置中修改）',
        '',
        '六、补充说明',
        '1. 每个用户的设定集彼此独立',
        '2. 同一个设定在一条提示词里提到多次，也只会注入一次',
        '3. 查看设定会显示内部编号、是否开放、来源，并带设定图预览'
      ].join('\n')
    })
  disposables.push(() => helpCmd.dispose())

  const listCmd = ctx.command(`${parentCommand}.character.list`, '查看我的设定集')
    .alias('设定列表')
    .action(async ({ session }: { session?: Session }) => {
      const uid = (session as any)?.user?.id
      if (uid == null) return '请先登录后再使用设定集'

      const service = mediaLuna?.getService('character-profile') as CharacterProfileService | undefined
      if (!service) return '设定集服务不可用'

      const profiles = await service.listByUid(uid)
      if (profiles.length === 0) return '你还没有设定集'

      const ownerLabels = await resolveOwnerLabels(ctx, profiles.map((profile) => profile.sourceOwnerUid).filter((value): value is number => typeof value === 'number'))

      return profiles.map((profile: CharacterProfileData) => {
        const sourceLabel = profile.sourceOwnerUid ? (ownerLabels.get(profile.sourceOwnerUid) || `用户 ${profile.sourceOwnerUid}`) : '未知'
        const source = profile.sourceProfileId ? ` | 来源 ${sourceLabel} #${profile.sourceProfileId}` : ' | 原创'
        const visibility = profile.isPublic ? ` | 已开放(公开编号 #${profile.id})` : ''
        const summary = (profile.description || '无描述').trim()
        const shortSummary = summary.length > 24 ? `${summary.slice(0, 24)}...` : summary
        return `#${profile.id} 「${profile.name}」 | ${shortSummary} | ${profile.imageUrls.length}张图${source}${visibility}`
      }).join('\n')
    })
  disposables.push(() => listCmd.dispose())

  const createCmd = ctx.command(`${parentCommand}.character.create [...rest:string]`, '新增设定，进入渐进式收集')
    .alias('新增设定')
    .action(async ({ session }: { session?: Session }, ...rest: string[]) => {
      const uid = (session as any)?.user?.id
      if (uid == null) return '请先登录后再使用设定集'

      const service = mediaLuna?.getService('character-profile') as CharacterProfileService | undefined
      if (!service) return '设定集服务不可用'

      const rawInput = rest.join(' ').trim()
      const parsedInput = h.parse(rawInput)
      const textInput = extractText(parsedInput)
      let profileName = ''
      let initialDescription = ''

      if (textInput) {
        const [firstWord, ...remaining] = textInput.split(/\s+/)
        profileName = firstWord?.trim() || ''
        initialDescription = remaining.join(' ').trim()
      }

      if (!profileName) {
        await session?.send('请输入设定名称，5分钟内回复，发送「取消」退出')
        const repliedName = (await session?.prompt(300000))?.trim()
        if (!repliedName || repliedName.toLowerCase() === '取消' || repliedName.toLowerCase() === 'cancel') {
          return '已取消新增设定'
        }
        profileName = repliedName
      }

      return enterCharacterProfileCollectMode({
        ctx,
        session,
        logger,
        config,
        service,
        cache: mediaLuna?.getService('cache') as CacheService | undefined,
        parentCommand,
        profileName: profileName.trim(),
        initialDescription,
        allowImmediateSave: !!profileName
      })
    })
  disposables.push(() => createCmd.dispose())

  const showCmd = ctx.command(`${parentCommand}.character.show [name:string]`, '查看设定集详情')
    .alias('查看设定')
    .action(async ({ session }: { session?: Session }, name?: string) => {
      const uid = (session as any)?.user?.id
      if (uid == null) return '请先登录后再使用设定集'

      const service = mediaLuna?.getService('character-profile') as CharacterProfileService | undefined
      if (!service) return '设定集服务不可用'

      const resolvedName = await promptRequiredInput(session, name, '请输入要查看的设定名称，发送「取消」退出')
      if (!resolvedName) return '已取消查看设定'

      const profile = await service.getByUidAndName(uid, resolvedName)
      if (!profile) return `未找到设定集「${resolvedName}」`

      const ownerLabels = await resolveOwnerLabels(ctx, profile.sourceOwnerUid ? [profile.sourceOwnerUid] : [])
      const sourceLabel = profile.sourceOwnerUid ? (ownerLabels.get(profile.sourceOwnerUid) || `用户 ${profile.sourceOwnerUid}`) : '原创'

      const parts = [
        `内部编号：#${profile.id}`,
        `名称：${profile.name}`,
        `文本：${profile.description || '无'}`,
        `图片：${profile.imageUrls.length} 张`,
        `开放：${profile.isPublic ? '是' : '否'}`,
        profile.isPublic ? `公开编号：#${profile.id}` : '',
        profile.sourceProfileId ? `来源：${sourceLabel} 的公开设定 #${profile.sourceProfileId}` : '来源：原创'
      ]

      const messages = [`<message>${parts.filter(Boolean).join('\n')}</message>`]
      for (const imageUrl of profile.imageUrls) {
        messages.push(`<message><image url="${imageUrl}"/></message>`)
      }
      return `<message forward>${messages.join('')}</message>`
    })
  disposables.push(() => showCmd.dispose())

  const publicListCmd = ctx.command(`${parentCommand}.character.public-list [keyword:text] [page:number]`, '查看开放设定列表')
    .alias('开放设定列表')
    .action(async ({ session }: { session?: Session }, keyword?: string, page?: number) => {
      const service = mediaLuna?.getService('character-profile') as CharacterProfileService | undefined
      if (!service) return '设定集服务不可用'

      const profiles = await service.listPublic(keyword)
      if (profiles.length === 0) return '暂无开放设定'

      const ownerLabels = await resolveOwnerLabels(ctx, profiles.map((profile) => profile.uid))

      const totalPages = Math.max(1, Math.ceil(profiles.length / PUBLIC_PROFILE_PAGE_SIZE))
      const currentPage = Math.min(Math.max(1, page || 1), totalPages)
      const start = (currentPage - 1) * PUBLIC_PROFILE_PAGE_SIZE
      const pageItems = profiles.slice(start, start + PUBLIC_PROFILE_PAGE_SIZE)

      const lines = pageItems.map((profile) => {
        const summary = (profile.publicDescription || profile.description || '无简介').trim()
        const shortSummary = summary.length > 36 ? `${summary.slice(0, 36)}...` : summary
        const ownerLabel = ownerLabels.get(profile.uid) || `用户 ${profile.uid}`
        return `#${profile.id} 「${profile.name}」 by ${ownerLabel} | ${shortSummary} | ${profile.imageUrls.length}张图`
      })

      lines.push(`第 ${currentPage}/${totalPages} 页，共 ${profiles.length} 条`)
      lines.push(`使用「查看开放设定 <id>」查看详情，「添加开放设定 <id> [新名字]」复制到自己名下`)
      return lines.join('\n')
    })
  disposables.push(() => publicListCmd.dispose())

  const publicShowCmd = ctx.command(`${parentCommand}.character.public-show [id:number]`, '查看开放设定详情')
    .alias('查看开放设定')
    .action(async ({ session }: { session?: Session }, id?: number) => {
      const service = mediaLuna?.getService('character-profile') as CharacterProfileService | undefined
      if (!service) return '设定集服务不可用'

      const resolvedIdText = await promptRequiredInput(session, id !== undefined ? String(id) : '', '请输入要查看的开放设定编号，发送「取消」退出')
      if (!resolvedIdText) return '已取消查看开放设定'
      const resolvedId = Number(resolvedIdText)
      if (Number.isNaN(resolvedId)) return `无效的公开编号：${resolvedIdText}`

      const profile = await service.getById(resolvedId)
      if (!profile || !profile.isPublic) return `未找到开放设定 #${resolvedId}`

      const ownerLabels = await resolveOwnerLabels(ctx, [profile.uid])
      const ownerLabel = ownerLabels.get(profile.uid) || `用户 ${profile.uid}`

      const messages = [
        `<message>${[
          `编号：#${profile.id}`,
          `名称：${profile.name}`,
          `归属：${ownerLabel}`,
          `公开简介：${profile.publicDescription || '无'}`,
          `原始描述：${profile.description || '无'}`,
          `图片：${profile.imageUrls.length} 张`
        ].join('\n')}</message>`
      ]

      for (const imageUrl of profile.imageUrls) {
        messages.push(`<message><image url="${imageUrl}"/></message>`)
      }

      return `<message forward>${messages.join('')}</message>`
    })
  disposables.push(() => publicShowCmd.dispose())

  const publicAddCmd = ctx.command(`${parentCommand}.character.add-public [id:number] [targetName:string]`, '添加开放设定到自己名下')
    .alias('添加开放设定')
    .action(async ({ session }: { session?: Session }, id?: number, targetName?: string) => {
      const uid = (session as any)?.user?.id
      if (uid == null) return '请先登录后再使用设定集'

      const service = mediaLuna?.getService('character-profile') as CharacterProfileService | undefined
      if (!service) return '设定集服务不可用'

      const resolvedIdText = await promptRequiredInput(session, id !== undefined ? String(id) : '', '请输入要添加的开放设定编号，发送「取消」退出')
      if (!resolvedIdText) return '已取消添加开放设定'
      const resolvedId = Number(resolvedIdText)
      if (Number.isNaN(resolvedId)) return `无效的公开编号：${resolvedIdText}`

      try {
        const cloned = await service.clonePublicToUser(resolvedId, uid, targetName)
        if (!cloned) return `未找到开放设定 #${resolvedId}`
        return `已添加开放设定到你的设定集：「${cloned.name}」`
      } catch (error) {
        return error instanceof Error ? error.message : '添加开放设定失败'
      }
    })
  disposables.push(() => publicAddCmd.dispose())

  const publicOpenCmd = ctx.command(`${parentCommand}.character.publish [name:string] [summary:text]`, '开放自己的设定集')
    .alias('开放设定')
    .action(async ({ session }: { session?: Session }, name?: string, summary?: string) => {
      const uid = (session as any)?.user?.id
      if (uid == null) return '请先登录后再使用设定集'

      const service = mediaLuna?.getService('character-profile') as CharacterProfileService | undefined
      if (!service) return '设定集服务不可用'

      const resolvedName = await promptRequiredInput(session, name, '请输入要开放的设定名称，发送「取消」退出')
      if (!resolvedName) return '已取消开放设定'

      const profile = await service.setPublicState(uid, resolvedName, true, summary?.trim())
      if (!profile) return `未找到设定集「${resolvedName}」`
      return `已开放设定「${profile.name}」, 公开编号 #${profile.id}`
    })
  disposables.push(() => publicOpenCmd.dispose())

  const publicCloseCmd = ctx.command(`${parentCommand}.character.unpublish [name:string]`, '关闭设定集开放')
    .alias('关闭开放设定')
    .action(async ({ session }: { session?: Session }, name?: string) => {
      const uid = (session as any)?.user?.id
      if (uid == null) return '请先登录后再使用设定集'

      const service = mediaLuna?.getService('character-profile') as CharacterProfileService | undefined
      if (!service) return '设定集服务不可用'

      const resolvedName = await promptRequiredInput(session, name, '请输入要关闭开放的设定名称，发送「取消」退出')
      if (!resolvedName) return '已取消关闭开放设定'

      const profile = await service.setPublicState(uid, resolvedName, false, '')
      if (!profile) return `未找到设定集「${resolvedName}」`
      return `已关闭设定「${profile.name}」的开放状态`
    })
  disposables.push(() => publicCloseCmd.dispose())

  const removeCmd = ctx.command(`${parentCommand}.character.remove [name:string]`, '删除设定集')
    .alias('删除设定')
    .action(async ({ session }: { session?: Session }, name?: string) => {
      const uid = (session as any)?.user?.id
      if (uid == null) return '请先登录后再使用设定集'

      const service = mediaLuna?.getService('character-profile') as CharacterProfileService | undefined
      if (!service) return '设定集服务不可用'

      const resolvedName = await promptRequiredInput(session, name, '请输入要删除的设定名称，发送「取消」退出')
      if (!resolvedName) return '已取消删除设定'

      const profile = await service.getByUidAndName(uid, resolvedName)
      if (!profile) return `未找到设定集「${resolvedName}」`

      await service.delete(profile.id, uid)
      return `已删除设定集「${resolvedName}」`
    })
  disposables.push(() => removeCmd.dispose())

  const syncCmd = ctx.command(`${parentCommand}.character.sync-storage [name:string]`, '按当前存储优先级手动同步全局设定图')
    .alias('同步设定存储')
    .action(async ({ session }: { session?: Session }, name?: string) => {
      const service = mediaLuna?.getService('character-profile') as CharacterProfileService | undefined
      if (!service) return '设定集服务不可用'

      try {
        const result = await service.syncProfileStorage({ name: name?.trim() || undefined })
        return [
          `全局设定图同步完成`,
          `更新: ${result.updated}`,
          `跳过: ${result.skipped}`,
          `失败: ${result.failed}`,
          result.profiles.length > 0 ? `目标: ${result.profiles.join('、')}` : ''
        ].filter(Boolean).join('\n')
      } catch (error) {
        return error instanceof Error ? error.message : '同步设定存储失败'
      }
    })
  disposables.push(() => syncCmd.dispose())

  return disposables
}

async function enterCharacterProfileCollectMode(options: {
  ctx: any
  session: Session | undefined
  logger: any
  config: KoishiCommandsConfig
  service: CharacterProfileService
  cache?: CacheService
  parentCommand: string
  profileName: string
  initialDescription: string
  allowImmediateSave: boolean
}): Promise<string> {
  const { ctx, session, logger, config, service, cache, parentCommand, profileName, initialDescription, allowImmediateSave } = options
  if (!session) return '会话不可用'

  const uid = (session as any)?.user?.id
  if (uid == null) return '请先登录后再使用设定集'

  const existing = await service.getByUidAndName(uid, profileName)
  if (existing) {
    return `设定集「${profileName}」已存在，先删除或换个名字`
  }

  const state: CollectState = {
    files: [],
    processedUrls: new Set(),
    prompts: initialDescription ? [initialDescription] : [],
    presetName: undefined
  }

  const extractor = new MessageExtractor(ctx, logger, state, config, [`${parentCommand}.character.create`, '新增设定'])
  await extractor.extractMedia(session)

  if (allowImmediateSave && state.files.some(file => file.mime.startsWith('image/'))) {
    return await saveCharacterProfileFromState(service, cache, uid, profileName, state)
  }

  const hintMsgIds = await session.send(
    `已开始新增设定「${profileName}」\n继续发送文字描述和图片\n发送「完成」结束并保存，发送「取消」放弃\n当前已收集: ${state.prompts.join(' ').trim().length} 字描述, ${state.files.length} 张图片`
  )

  const timeoutMs = config.collectTimeout * 1000

  return new Promise<string>((resolve) => {
    let disposed = false
    const processedMessageIds = new Set<string>()

    const timeoutHandle = setTimeout(async () => {
      if (disposed) return
      disposed = true
      disposeMiddleware()
      await deleteMessages(session, hintMsgIds)
      resolve('新增设定超时，已取消')
    }, timeoutMs)

    const disposeMiddleware = ctx.middleware(async (sess: Session, next: () => Promise<void>) => {
      if (disposed) return next()
      if (sess.userId !== session.userId) return next()
      if (sess.channelId !== session.channelId) return next()
      if (sess.selfId !== session.selfId) return next()

      const messageId = sess.messageId
      if (messageId && processedMessageIds.has(messageId)) return
      if (messageId) processedMessageIds.add(messageId)

      const textContent = extractor.extractText(sess.elements || []).trim().toLowerCase()
      if (textContent === '完成' || textContent === 'done' || textContent === 'finish') {
        disposed = true
        clearTimeout(timeoutHandle)
        disposeMiddleware()
        await deleteMessages(session, hintMsgIds)

        if (state.files.length === 0) {
          resolve('至少需要一张设定图，已取消保存')
          return
        }

        resolve(await saveCharacterProfileFromState(service, cache, uid, profileName, state))
        return
      }

      if (textContent === '取消' || textContent === 'cancel') {
        disposed = true
        clearTimeout(timeoutHandle)
        disposeMiddleware()
        await deleteMessages(session, hintMsgIds)
        resolve('已取消新增设定')
        return
      }

      const prevFileCount = state.files.length
      const prevPromptCount = state.prompts.length
      extractor.resetResult()
      const text = await extractor.extractAll(sess)
      extractor.addPrompt(text)

      const imageCount = state.files.filter(file => file.mime.startsWith('image/')).length
      const descriptionLength = state.prompts.join(' ').trim().length
      if (state.files.length > prevFileCount || state.prompts.length > prevPromptCount) {
        await sess.send(`已收集: ${descriptionLength} 字描述, ${imageCount} 张图片\n继续发送内容，或发送「完成」保存`) 
      }
    }, true)
  })
}

async function saveCharacterProfileFromState(
  service: CharacterProfileService,
  cache: CacheService | undefined,
  uid: number,
  profileName: string,
  state: CollectState
): Promise<string> {
  const imageFiles = state.files.filter(file => file.mime.startsWith('image/'))
  const cachedUrls = await service.cacheFiles(imageFiles, cache)
  if (cachedUrls.length === 0) {
    return '设定图缓存失败，未能保存设定'
  }

  const finalDescription = state.prompts.join(' ').trim()
  await service.create({
    uid,
    name: profileName,
    description: finalDescription,
    imageUrls: cachedUrls
  })
  return `已新增设定「${profileName}」，描述 ${finalDescription.length} 字，图片 ${cachedUrls.length} 张`
}

function extractText(elements: any[]): string {
  return elements
    .filter((element) => element.type === 'text')
    .map((element) => element.attrs?.content || '')
    .join('')
    .trim()
}

async function promptRequiredInput(session: Session | undefined, initialValue: string | undefined, promptMessage: string): Promise<string | null> {
  const trimmed = initialValue?.trim()
  if (trimmed) return trimmed

  await session?.send(promptMessage)
  const input = (await session?.prompt(300000))?.trim()
  if (!input || input.toLowerCase() === '取消' || input.toLowerCase() === 'cancel') {
    return null
  }
  return input
}

async function resolveOwnerLabels(ctx: any, uids: number[]): Promise<Map<number, string>> {
  const uniqueUids = Array.from(new Set(uids.filter((uid) => typeof uid === 'number')))
  const result = new Map<number, string>()
  if (uniqueUids.length === 0) return result

  try {
    const bindings = await ctx.database.get('binding', { aid: uniqueUids } as any)
    const grouped = new Map<number, Array<{ platform: string; pid: string }>>()

    for (const binding of bindings || []) {
      if (!grouped.has(binding.aid)) {
        grouped.set(binding.aid, [])
      }
      grouped.get(binding.aid)!.push({ platform: binding.platform, pid: String(binding.pid) })
    }

    for (const uid of uniqueUids) {
      const items = grouped.get(uid) || []
      const onebotBinding = items.find((item) => item.platform === 'onebot')
      if (onebotBinding) {
        result.set(uid, `QQ ${onebotBinding.pid}`)
        continue
      }

      const fallback = items[0]
      if (fallback) {
        result.set(uid, `${fallback.platform} ${fallback.pid}`)
        continue
      }

      result.set(uid, `用户 ${uid}`)
    }
  } catch {
    for (const uid of uniqueUids) {
      result.set(uid, `用户 ${uid}`)
    }
  }

  return result
}
