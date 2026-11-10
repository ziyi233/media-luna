// 连接器查询 API

import { Context } from 'koishi'

/**
 * 注册连接器查询 API
 */
export function registerConnectorApi(ctx: Context): void {
  const console = ctx.console as any

  // 获取已注册连接器列表
  console.addListener('media-luna/connectors/list', async () => {
    try {
      const connectors = ctx.mediaLuna.connectors.listSummary()
      return { success: true, data: connectors }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取单个连接器详情
  console.addListener('media-luna/connectors/get', async ({ id }: { id: string }) => {
    try {
      const connector = ctx.mediaLuna.connectors.get(id)
      if (!connector) {
        return { success: false, error: 'Connector not found' }
      }
      return {
        success: true,
        data: {
          id: connector.id,
          name: connector.name,
          supportedTypes: connector.supportedTypes,
          fields: connector.fields,
          cardFields: connector.cardFields || []
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取连接器配置字段
  console.addListener('media-luna/connectors/fields', async ({ id }: { id: string }) => {
    try {
      const connector = ctx.mediaLuna.connectors.get(id)
      if (!connector) {
        return { success: false, error: 'Connector not found' }
      }
      return { success: true, data: connector.fields }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })

  // 获取连接器 Schema（用于动态表单）
  console.addListener('media-luna/connectors/schema', async () => {
    try {
      const list = ctx.mediaLuna.connectors.listSummary()
      return { success: true, data: list }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }, { authority: 3 })
}
