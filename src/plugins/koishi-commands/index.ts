// Koishi 聊天指令插件入口
// 注册渠道名指令，支持收集模式
import { } from 'koishi-plugin-adapter-onebot'
import { definePlugin } from '../../core'
import type { PluginContext } from '../../core/types'
import {
  koishiCommandsConfigFields,
  defaultKoishiCommandsConfig,
  type KoishiCommandsConfig
} from './config'
import { registerTaskCommands } from './commands/tasks'
import { registerChannelCommand } from './commands/channel-generate'
import { registerCatalogCommands } from './commands/catalog'

type CapabilityKey = 'img2img' | 'img2video' | 'text2img' | 'text2video' | 'text2audio'

const CAPABILITY_GROUPS: Array<{ key: CapabilityKey; label: string }> = [
  { key: 'img2img', label: '图生图' },
  { key: 'img2video', label: '图生视频' },
  { key: 'text2img', label: '文生图' },
  { key: 'text2video', label: '文生视频' },
  { key: 'text2audio', label: '文生音频' }
]

const CAPABILITY_KEYS = new Set<CapabilityKey>(CAPABILITY_GROUPS.map(group => group.key))


export default definePlugin({
  id: 'koishi-commands',
  name: 'Koishi 聊天指令',
  description: '注册 Koishi 聊天指令，支持预设查询',
  version: '1.0.0',

  configFields: koishiCommandsConfigFields,
  configDefaults: defaultKoishiCommandsConfig,

  async onLoad(pluginCtx) {
    const ctx = pluginCtx.ctx
    const config = pluginCtx.getConfig<KoishiCommandsConfig>()
    const logger = pluginCtx.logger

    // 使用实例级 Map/Array 存储 dispose 函数，而不是模块级变量
    // 这样每次插件重载都会创建新的存储，避免状态残留
    // key: channel.id (string), value: { dispose, commandName }
    const channelCommandDisposables = new Map<string, { dispose: () => void; commandName: string }>()
    const presetCommandDisposables: Array<() => void> = []

    // 保存 mediaLuna 引用
    let mediaLunaRef: any = null

    // 父指令名称（固定）
    const PARENT_COMMAND = 'medialuna'

    // 获取系统保留指令名（不允许渠道使用这些名称）
    const getReservedCommandNames = (): Set<string> => {
      const reserved = new Set<string>()
      // 本插件注册的指令
      reserved.add(PARENT_COMMAND.toLowerCase())
      // Koishi 内置指令
      reserved.add('help')
      reserved.add('status')
      reserved.add('echo')
      reserved.add('broadcast')
      // LoRA 相关指令
      reserved.add('loras')
      return reserved
    }

    // 刷新生成指令的函数（清除重建策略）
    const refreshGenerateCommands = async () => {
      if (!mediaLunaRef) {
        logger.warn('MediaLuna service not available')
        return
      }

      // 第一步：清除所有已注册的渠道指令
      for (const [channelId, { dispose, commandName }] of channelCommandDisposables) {
        try {
          dispose()
        } catch (e) {
          // ignore
        }
        logger.debug(`Unregistered command: ${commandName} (channel: ${channelId})`)
      }
      channelCommandDisposables.clear()

      // 第二步：获取当前渠道-预设组合
      const combinations = await mediaLunaRef.getChannelPresetCombinations()

      // 第三步：获取保留指令名
      const reservedNames = getReservedCommandNames()

      // 第四步：记录本轮已注册的指令名（用于检测渠道间重名）
      const registeredInThisRound = new Set<string>()

      // 第五步：注册渠道指令
      for (const { channel, presets } of combinations) {
        const commandName = channel.name
        const commandNameLower = commandName.toLowerCase()

        // 检查渠道级配置是否禁用了 koishi-commands
        if (!mediaLunaRef.isPluginEnabledForChannel('koishi-commands', channel)) {
          logger.debug(`Channel ${commandName}: koishi-commands disabled, skipping`)
          continue
        }

        // 检查是否与保留指令冲突
        if (reservedNames.has(commandNameLower)) {
          logger.warn(`Channel "${commandName}" conflicts with reserved command, skipping`)
          continue
        }

        // 检查是否与其他渠道重名（同名只注册第一个）
        if (registeredInThisRound.has(commandNameLower)) {
          logger.warn(`Channel "${commandName}" (id: ${channel.id}) has duplicate name, skipping`)
          continue
        }

        // 注册渠道指令
        const dispose = registerChannelCommand({
          ctx,
          mediaLuna: mediaLunaRef,
          channel,
          presets,
          config,
          logger,
          parentCommand: PARENT_COMMAND
        })
        channelCommandDisposables.set(channel.id, { dispose, commandName })
        registeredInThisRound.add(commandNameLower)
      }

      logger.info(`Refreshed generate commands: ${channelCommandDisposables.size} channels registered`)
    }

    // 注册查询类命令的函数
    const registerCatalogAndTaskCommands = () => {
      presetCommandDisposables.push(...registerCatalogCommands({
        ctx,
        mediaLunaRef,
        parentCommand: PARENT_COMMAND,
        capabilityGroups: CAPABILITY_GROUPS,
        capabilityKeys: CAPABILITY_KEYS
      }))

      presetCommandDisposables.push(...registerTaskCommands({
        ctx,
        mediaLunaRef,
        config,
        logger,
        parentCommand: PARENT_COMMAND
      }))

      logger.info('Catalog and task commands registered')
    }

    // 等待 mediaLuna 服务就绪后注册指令
    ctx.on('ready', async () => {
      mediaLunaRef = ctx.mediaLuna
      await refreshGenerateCommands()
      // 预设查询指令使用全局配置
      if (mediaLunaRef.isPluginEnabledForChannel('koishi-commands', null)) {
        registerCatalogAndTaskCommands()
      }
    })

    // 监听渠道变化，动态刷新指令
    ctx.on('mediaLuna/channel-updated' as any, async () => {
      if (!mediaLunaRef) return
      logger.debug('Channel updated, refreshing commands...')
      await refreshGenerateCommands()
    })

    // 清理 - 注销所有指令
    pluginCtx.onDispose(() => {
      logger.debug('Disposing koishi-commands: %d channel commands, %d preset commands',
        channelCommandDisposables.size, presetCommandDisposables.length)

      for (const { dispose } of channelCommandDisposables.values()) {
        try {
          dispose()
        } catch (e) {
          // ignore
        }
      }
      channelCommandDisposables.clear()

      for (const dispose of presetCommandDisposables) {
        try {
          dispose()
        } catch (e) {
          // ignore
        }
      }
      presetCommandDisposables.length = 0

      logger.debug('koishi-commands disposed')
    })
  }
})

// 导出类型
export type { KoishiCommandsConfig } from './config'
