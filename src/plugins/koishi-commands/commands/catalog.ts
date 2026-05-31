import type { Session } from 'koishi'

type CapabilityKey = 'img2img' | 'img2video' | 'text2img' | 'text2video' | 'text2audio'

interface RegisterCatalogCommandsOptions {
  ctx: any
  mediaLunaRef: any
  parentCommand: string
  capabilityGroups: Array<{ key: CapabilityKey; label: string }>
  capabilityKeys: Set<CapabilityKey>
}

export function registerCatalogCommands(options: RegisterCatalogCommandsOptions): Array<() => void> {
  const { ctx, mediaLunaRef, parentCommand, capabilityGroups, capabilityKeys } = options
  const disposables: Array<() => void> = []

  const parentCmd = ctx.command(parentCommand, 'Media Luna 多媒体生成')
    .action(() => {
      const lines: string[] = []
      lines.push('━━━━━━━━━━━━━━━━━━━━')
      lines.push('🎨 Media Luna 多媒体生成')
      lines.push('━━━━━━━━━━━━━━━━━━━━')
      lines.push('')
      lines.push('📋 查询指令：')
      lines.push('  models - 查看所有模型名')
      lines.push('  presets - 查看所有预设名')
      lines.push('  preset <预设名> - 查看具体预设内容')
      lines.push('  mytasks - 查看我的生成记录')
      lines.push('  taskinfo <ID> - 查看任务详情')
      lines.push('  redraw <ID> - 使用相同参数重新生成')
      lines.push('')
      lines.push('🖼️ 基础用法：')
      lines.push('  1. 渠道名 预设名 提示词 [图片]')
      lines.push('     - 图片≥2张: 直接触发生成')
      lines.push('     - 图片≤1张: 进入收集模式，发送"开始"触发')
      lines.push('  2. 渠道名 提示词 [图片]')
      lines.push('     - 不指定预设也可触发')
      lines.push('  3. 引用消息发指令')
      lines.push('     - 被引用消息和引用消息视为一条')
      lines.push('')
      lines.push('⚡ 高级用法：')
      lines.push('  • @用户 会自动获取该用户头像')
      lines.push('  • 使用 #lora名# 指定 LoRA (部分模型)')
      lines.push('  • 提示词包含"润色"自动优化 (部分模型)')
      lines.push('  • 支持 1024x1024/9:16/横屏 指定尺寸')
      lines.push('')
      lines.push('━━━━━━━━━━━━━━━━━━━━')

      return `<message forward><message>${lines.join('\n')}</message></message>`
    })
  disposables.push(() => parentCmd.dispose())

  const presetsCmd = ctx.command(`${parentCommand}.presets [tag:string]`, '查看可用预设')
    .alias('presets')
    .action(async (_: any, tag: string) => {
      const presetService = mediaLunaRef?.presets
      if (!presetService) return '预设服务不可用'

      let presets = await presetService.listEnabled()
      if (tag) {
        presets = presets.filter((p: any) => p.tags.includes(tag))
        if (presets.length === 0) return `没有找到标签为 [${tag}] 的预设`
      }
      if (presets.length === 0) return '没有可用的预设'

      const lines: string[] = []
      lines.push('━━━━━━━━━━━━━━')
      lines.push(tag ? `📂 标签 [${tag}] 下的预设` : '📂 可用预设列表')
      lines.push(`共 ${presets.length} 个预设`)
      lines.push('━━━━━━━━━━━━━━')
      lines.push('')

      for (const preset of presets) {
        if (preset.tags && preset.tags.length > 0) {
          lines.push(`• ${preset.name}  [${preset.tags.join(', ')}]`)
        } else {
          lines.push(`• ${preset.name}`)
        }
      }

      lines.push('')
      lines.push('━━━━━━━━━━━━━━')

      const content = lines.join('\n')
      if (content.length > 500) {
        return `<message forward><message>${content}</message></message>`
      }

      return content
    })
  disposables.push(() => presetsCmd.dispose())

  const presetCmd = ctx.command(`${parentCommand}.preset <name:string>`, '查看预设详情')
    .alias('preset')
    .action(async ({ session }: { session?: Session }, name: string) => {
      if (!name) return '请指定预设名称'

      const presetService = mediaLunaRef?.presets
      if (!presetService) return '预设服务不可用'

      const preset = await presetService.getByName(name)
      if (!preset) return `未找到预设: ${name}`

      const templateLength = preset.promptTemplate?.length || 0
      const hasRefImages = preset.referenceImages && preset.referenceImages.length > 0
      const useForward = templateLength > 200 || hasRefImages

      if (useForward) {
        const forwardMessages: string[] = []
        const basicLines: string[] = []
        basicLines.push('━━━━━━━━━━━━━━')
        basicLines.push(`📋 预设：${preset.name}`)
        basicLines.push('━━━━━━━━━━━━━━')
        if (preset.tags && preset.tags.length > 0) {
          basicLines.push(`🏷️ 标签: ${preset.tags.join(', ')}`)
        }
        if (hasRefImages) {
          basicLines.push(`🖼️ 参考图: ${preset.referenceImages.length} 张`)
        }
        basicLines.push('━━━━━━━━━━━━━━')
        forwardMessages.push(`<message>${basicLines.join('\n')}</message>`)

        if (preset.thumbnail) {
          forwardMessages.push(`<message>📷 预览图：\n<image url="${preset.thumbnail}"/></message>`)
        }

        if (hasRefImages) {
          for (let i = 0; i < preset.referenceImages.length; i++) {
            const refImg = preset.referenceImages[i]
            forwardMessages.push(`<message>🖼️ 参考图 ${i + 1}：\n<image url="${refImg}"/></message>`)
          }
        }

        if (preset.promptTemplate) {
          forwardMessages.push(`<message>📝 Prompt 模板：\n${preset.promptTemplate}</message>`)
        }

        return `<message forward>${forwardMessages.join('')}</message>`
      }

      const messages: string[] = []
      if (preset.thumbnail) {
        messages.push(`<image url="${preset.thumbnail}"/>`)
      }

      const lines: string[] = []
      lines.push('━━━━━━━━━━━━━━')
      lines.push(`📋 预设：${preset.name}`)
      lines.push('━━━━━━━━━━━━━━')

      if (preset.tags && preset.tags.length > 0) {
        lines.push(`🏷️ 标签: ${preset.tags.join(', ')}`)
      }
      if (preset.promptTemplate) {
        lines.push(`📝 模板: ${preset.promptTemplate}`)
      }

      lines.push('━━━━━━━━━━━━━━')
      messages.push(lines.join('\n'))
      return messages.join('\n')
    })
  disposables.push(() => presetCmd.dispose())

  const modelsCmd = ctx.command(`${parentCommand}.models [mode:string]`, '查看可用模型')
    .alias('models')
    .action(async (_argv: any, mode?: string) => {
      const channels = await mediaLunaRef.channels.listEnabled()
      if (!channels || channels.length === 0) return '没有可用的模型'

      const normalizedMode = (mode || '').trim().toLowerCase()
      const validModes = new Set(['all', 'dedupe', ...Array.from(capabilityKeys)])
      if (normalizedMode && !validModes.has(normalizedMode)) {
        return [
          `未知模式: ${mode}`,
          '可选模式: all, dedupe, text2img, img2img, text2audio, text2video, img2video'
        ].join('\n')
      }

      const toCapabilityLabel = (key: CapabilityKey) => capabilityGroups.find(group => group.key === key)?.label || key

      const getChannelCapabilities = (channel: any): CapabilityKey[] => {
        const channelTags = Array.isArray(channel.tags) ? channel.tags : []
        return capabilityGroups
          .map(group => group.key)
          .filter(key => channelTags.includes(key))
      }

      const getExtraTags = (channel: any): string[] => {
        const channelTags = Array.isArray(channel.tags) ? channel.tags : []
        return channelTags.filter((tag: string) => !capabilityKeys.has(tag as CapabilityKey))
      }

      const getCostInfo = (channel: any): string => {
        const cost = channel.pluginOverrides?.billing?.cost
        if (cost === 0) return '免费'
        if (cost !== undefined && cost > 0) {
          const currencyLabel = channel.pluginOverrides?.billing?.currencyLabel || '积分'
          return `${cost}${currencyLabel}/次`
        }
        return '未配置计费'
      }

      const getPrimaryCapability = (channel: any): CapabilityKey | null => {
        const capabilities = getChannelCapabilities(channel)
        return capabilities[0] || null
      }

      const formatChannelLine = (channel: any, primaryCapability?: CapabilityKey | null): string => {
        const parts: string[] = [channel.name]
        parts.push(getCostInfo(channel))

        if (primaryCapability) {
          parts.push(`主能力:${toCapabilityLabel(primaryCapability)}`)
        }

        const extraTags = getExtraTags(channel)
        if (extraTags.length > 0) {
          const shown = extraTags.slice(0, 2)
          const hiddenCount = extraTags.length - shown.length
          parts.push(`附加:${shown.join(', ')}${hiddenCount > 0 ? ` +${hiddenCount}` : ''}`)
        }

        return `  ${parts.join('  |  ')}`
      }

      const compareChannels = (a: any, b: any): number => {
        const aCost = a.pluginOverrides?.billing?.cost
        const bCost = b.pluginOverrides?.billing?.cost

        const normalizeCost = (cost: any) => {
          if (cost === 0) return 0
          if (typeof cost === 'number' && cost > 0) return cost
          return Number.MAX_SAFE_INTEGER
        }

        const diff = normalizeCost(aCost) - normalizeCost(bCost)
        if (diff !== 0) return diff
        return String(a.name).localeCompare(String(b.name), 'zh-CN')
      }

      const channelByCapability = new Map<CapabilityKey, any[]>()
      for (const group of capabilityGroups) {
        channelByCapability.set(group.key, [])
      }

      for (const channel of channels) {
        const capabilities = getChannelCapabilities(channel)
        for (const key of capabilities) {
          channelByCapability.get(key)?.push(channel)
        }
      }

      const lines: string[] = []
      lines.push('可用模型（按能力分组）')
      lines.push('')

      if (normalizedMode === 'dedupe') {
        lines.push('模式: 去重（图输入优先）')
        lines.push('')

        const grouped = new Map<CapabilityKey, any[]>()
        for (const group of capabilityGroups) {
          grouped.set(group.key, [])
        }

        for (const channel of channels) {
          const primary = getPrimaryCapability(channel)
          if (!primary) continue
          grouped.get(primary)?.push(channel)
        }

        for (const group of capabilityGroups) {
          const list = (grouped.get(group.key) || []).sort(compareChannels)
          if (list.length === 0) continue
          lines.push(`【${group.label}】`)
          for (const channel of list) {
            lines.push(formatChannelLine(channel, group.key))
          }
          lines.push('')
        }
      } else {
        const targetGroups = normalizedMode && normalizedMode !== 'all'
          ? capabilityGroups.filter(group => group.key === normalizedMode)
          : capabilityGroups

        for (const group of targetGroups) {
          const list = (channelByCapability.get(group.key) || []).sort(compareChannels)
          if (list.length === 0) continue

          lines.push(`【${group.label}】`)
          for (const channel of list) {
            const primary = getPrimaryCapability(channel)
            lines.push(formatChannelLine(channel, primary))
          }
          lines.push('')
        }
      }

      if (lines[lines.length - 1] === '') {
        lines.pop()
      }

      const uniqueCount = new Set(channels.map((channel: any) => channel.id)).size
      const allCapabilityCount = capabilityGroups.reduce(
        (sum, group) => sum + (channelByCapability.get(group.key)?.length || 0),
        0
      )

      lines.push('')
      if (normalizedMode === 'dedupe') {
        lines.push(`共 ${uniqueCount} 个模型（去重）`)
      } else if (normalizedMode && normalizedMode !== 'all') {
        const matched = channelByCapability.get(normalizedMode as CapabilityKey)?.length || 0
        lines.push(`共 ${matched} 个模型（${toCapabilityLabel(normalizedMode as CapabilityKey)}）`)
      } else {
        lines.push(`共 ${uniqueCount} 个模型（分组累计 ${allCapabilityCount}，同一模型可出现在多个分组）`)
      }
      lines.push('用法: 模型名 [预设名] 提示词')
      lines.push('筛选: medialuna.models <all|dedupe|text2img|img2img|text2audio|text2video|img2video>')

      const content = lines.join('\n')
      return `<message forward><message>${content}</message></message>`
    })
  disposables.push(() => modelsCmd.dispose())

  return disposables
}
