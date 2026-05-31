// WebUI 认证插件入口

import { definePlugin } from '../../core'
import { WebuiAuthService } from './service'
import {
  webuiAuthConfigFields,
  defaultWebuiAuthConfig,
  type WebuiAuthConfig
} from './config'

export default definePlugin({
  id: 'webui-auth',
  name: 'WebUI 用户绑定',
  description: '将 WebUI 与 Koishi 用户绑定，支持指令绑定或直接配置 uid',
  version: '1.0.0',

  configFields: webuiAuthConfigFields,
  configDefaults: defaultWebuiAuthConfig,

  contributes: {
    services: [
      {
        name: 'webui-auth',
        factory: (pluginCtx) => new WebuiAuthService(pluginCtx)
      }
    ]
  },

  settingsActions: [
    {
      name: 'clear-bind',
      label: '清除绑定',
      type: 'error',
      apiEvent: 'media-luna/webui-auth/clear'
    }
  ],

  async onLoad(pluginCtx) {
    const ctx = pluginCtx.ctx
    const config = pluginCtx.getConfig<WebuiAuthConfig>()
    const authService = pluginCtx.getService<WebuiAuthService>('webui-auth')

    if (!authService) {
      pluginCtx.logger.error('Failed to get webui-auth service')
      return
    }

    // 注册 Koishi 指令
    const commandName = config.commandName || 'bindui'

    const dispose = ctx.command(commandName, '绑定 WebUI 用户')
      .action(async ({ session }) => {
        if (!session) {
          return '无法获取会话信息'
        }

        // 获取用户的 Koishi uid
        try {
          const bindings = await ctx.database.get('binding', {
            platform: session.platform,
            pid: session.userId
          })

          if (!bindings || bindings.length === 0) {
            return '未找到用户绑定信息，请先完成平台绑定'
          }

          const uid = bindings[0].aid

          ctx.logger('webui-auth').info('Processing bindui command for uid: %d', uid)

          // 生成验证码
          const code = authService.createBindCode(uid)

          // 通知前端
          const console = (ctx as any).console
          if (console) {
            const expiresIn = config.codeExpiry || 300
            console.broadcast('media-luna/webui-auth/bind-request', { uid, code, expiresIn })
          }

          // 提示用户输入验证码
          await session.send(`请在 ${config.codeExpiry || 300} 秒内输入控制台显示的验证码：`)

          // 等待用户输入
          const input = await session.prompt(config.codeExpiry ? config.codeExpiry * 1000 : 300000)

          if (!input) {
            return '验证码已过期，请重新发起绑定'
          }

          // 验证
          const result = authService.verifyCodeAndBind(input.trim(), uid)
          if (result.success) {
            return `绑定成功！WebUI 已关联到用户 ${uid}`
          } else {
            return `绑定失败: ${result.error}`
          }
        } catch (e) {
          pluginCtx.logger.error('Failed to bindui: %s', e)
          return '绑定失败，请稍后重试'
        }
      })

    pluginCtx.onDispose(() => dispose.dispose())

    // 注册 WebUI API
    const console = (ctx as any).console
    if (console) {
      // 获取当前绑定状态
      console.addListener('media-luna/webui-auth/status', async () => {
        const uid = authService.getUid()
        return {
          success: true,
          data: {
            bound: uid !== null,
            uid
          }
        }
      })

      // 清除绑定
      console.addListener('media-luna/webui-auth/clear', async () => {
        authService.clearBind()
        return { success: true }
      })
    }

    pluginCtx.logger.info('WebUI auth plugin loaded, command: %s', commandName)
  }
})

// 导出类型
export type { WebuiAuthConfig } from './config'
export { WebuiAuthService } from './service'
