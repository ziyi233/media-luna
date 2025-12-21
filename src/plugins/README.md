# Media Luna 插件开发指南

## 概述

Media Luna 采用插件化架构，所有功能（缓存、预设、计费、连接器等）都以插件形式实现。本文档介绍如何开发 Media Luna 插件。

## 快速开始

### 最小插件示例

```typescript
import { definePlugin } from '../core'

export default definePlugin({
  id: 'my-plugin',
  name: '我的插件',
  description: '插件描述',
  version: '1.0.0',

  async onLoad(ctx) {
    ctx.logger.info('插件已加载')
  }
})
```

### 插件目录结构

```
src/plugins/my-plugin/
├── index.ts        # 插件入口，导出 definePlugin()
├── config.ts       # 配置类型和字段定义
├── service.ts      # 服务类（可选）
├── middleware.ts   # 中间件定义（可选）
└── README.md       # 插件文档（可选）
```

---

## 插件定义 (PluginDefinition)

### 完整接口

```typescript
interface PluginDefinition {
  // ===== 基础信息 =====
  id: string                    // 唯一标识符（必须）
  name: string                  // 显示名称（必须）
  description?: string          // 描述
  version?: string              // 版本号
  dependencies?: string[]       // 依赖的其他插件 ID

  // ===== 配置 =====
  configFields?: ConfigField[]  // 配置字段定义（自动生成 UI）
  configDefaults?: Record<string, any>  // 默认配置值

  // ===== 功能注册 =====
  services?: ServiceDefinition[]      // 服务
  middlewares?: MiddlewareDefinition[] // 中间件
  connector?: ConnectorDefinition     // 连接器（每个插件最多一个）

  // ===== UI =====
  settingsActions?: SettingsAction[]  // 设置面板操作按钮

  // ===== 生命周期 =====
  onLoad?: (ctx: PluginContext) => Promise<void> | void
  onUnload?: () => Promise<void> | void
}
```

---

## 配置系统

### 配置字段类型

```typescript
interface ConfigField {
  key: string           // 配置键名
  label: string         // 显示标签
  type: 'text' | 'number' | 'boolean' | 'select' | 'password' | 'textarea'
  default?: any         // 默认值
  description?: string  // 字段说明
  placeholder?: string  // 占位符
  options?: Array<{ label: string; value: any }>  // select 类型的选项
  showWhen?: { field: string; value: any }        // 条件显示
}
```

### 示例

```typescript
export const myConfigFields: ConfigField[] = [
  {
    key: 'enabled',
    label: '启用插件',
    type: 'boolean',
    default: true
  },
  {
    key: 'apiKey',
    label: 'API 密钥',
    type: 'password',
    description: '从服务商获取的 API Key'
  },
  {
    key: 'mode',
    label: '工作模式',
    type: 'select',
    default: 'auto',
    options: [
      { label: '自动', value: 'auto' },
      { label: '手动', value: 'manual' }
    ]
  },
  {
    key: 'endpoint',
    label: '自定义端点',
    type: 'text',
    placeholder: 'https://api.example.com',
    showWhen: { field: 'mode', value: 'manual' }  // 仅在 mode='manual' 时显示
  }
]
```

### 配置热重载

配置通过 Proxy 代理实现热重载。服务中访问配置时，始终获取最新值：

```typescript
class MyService {
  private config: MyPluginConfig

  constructor(ctx: Context, config: MyPluginConfig) {
    this.config = config  // 这是一个 Proxy
  }

  doSomething() {
    // 每次访问都是最新配置，无需手动刷新
    if (this.config.enabled) {
      // ...
    }
  }
}
```

### 插件配置 vs 连接器配置

Media Luna 有两种配置，理解它们的区别很重要：

| 类型 | 作用域 | 存储位置 | 使用场景 |
|-----|-------|---------|---------|
| **插件配置** (configFields) | 全局 | `data/media-luna/config.yaml` | 插件级功能开关、全局参数 |
| **连接器配置** (connector.configFields) | 渠道级 | 数据库 (渠道表) | 每个渠道的 API 配置 |

**插件配置**：
- 在「设置 → 扩展插件」中配置
- 所有渠道共享同一份配置
- 适用于：缓存目录、同步间隔、功能开关等

```typescript
// 插件配置示例
configFields: [
  { key: 'enabled', label: '启用', type: 'boolean' },
  { key: 'cacheDir', label: '缓存目录', type: 'text' }
]
```

**连接器配置**：
- 在「渠道管理 → 编辑渠道」中配置
- 每个渠道可以有不同的配置
- 适用于：API Key、端点地址、模型名称等

```typescript
// 连接器配置示例
connector: {
  id: 'my-api',
  configFields: [
    { key: 'apiKey', label: 'API Key', type: 'password' },
    { key: 'model', label: '模型', type: 'select', options: [...] }
  ]
}
```

---

## 服务 (Service)

服务是单例对象，供其他中间件或插件使用。

### 定义服务

```typescript
interface ServiceDefinition {
  name: string  // 服务名称（全局唯一）
  factory: (ctx: PluginContext) => any  // 工厂函数
}
```

### 示例

```typescript
// service.ts
export class MyService {
  private ctx: Context
  private config: MyPluginConfig

  constructor(ctx: Context, config: MyPluginConfig) {
    this.ctx = ctx
    this.config = config
  }

  async doWork(): Promise<string> {
    return `Using API: ${this.config.apiKey}`
  }
}

// index.ts
export default definePlugin({
  id: 'my-plugin',
  services: [
    {
      name: 'myService',
      factory: (ctx) => {
        const config = ctx.getConfig<MyPluginConfig>()
        return new MyService(ctx.ctx, config)
      }
    }
  ]
})
```

### 使用服务

在中间件或其他插件中：

```typescript
// 在中间件中
async execute(mctx: MiddlewareContext, next) {
  const myService = mctx.getService<MyService>('myService')
  if (myService) {
    await myService.doWork()
  }
  return next()
}

// 在 PluginContext 中
async onLoad(ctx) {
  const otherService = ctx.getService<OtherService>('otherService')
}
```

---

## 中间件 (Middleware)

中间件参与生成请求的处理流程。

### 执行阶段

```
lifecycle-prepare      → 准备阶段（校验、预处理）
lifecycle-pre-request  → 请求前（预设应用、提示词处理）
lifecycle-request      → 请求阶段（调用连接器生成）
lifecycle-post-request → 请求后（缓存、后处理）
lifecycle-finalize     → 完成阶段（计费结算、任务记录）
```

### 定义中间件

```typescript
interface MiddlewareDefinition {
  name: string           // 中间件名称（必须唯一）
  displayName: string    // 显示名称
  description?: string   // 描述
  phase: MiddlewarePhase // 执行阶段
  category?: string      // 所属插件 ID（用于配置关联）
  priority?: number      // 同阶段内的优先级（越小越先执行）

  // 依赖声明
  runBefore?: string[]   // 在这些中间件之前运行
  runAfter?: string[]    // 在这些中间件之后运行

  execute: (mctx: MiddlewareContext, next: () => Promise<MiddlewareRunStatus>)
    => Promise<MiddlewareRunStatus>
}
```

### 中间件上下文 (MiddlewareContext)

```typescript
interface MiddlewareContext {
  // Koishi 上下文
  ctx: Context
  session: Session | null

  // 请求数据
  prompt: string                    // 原始提示词
  files: FileData[]                 // 输入文件
  parameters: Record<string, any>   // 请求参数

  // 渠道信息
  channelId: number
  channel: ChannelConfig | null

  // 输出（由中间件填充）
  output: OutputAsset[] | null

  // 用户标识
  uid: number | null

  // 跨中间件数据共享
  store: Map<string, any>

  // 方法
  getMiddlewareConfig<T>(name: string): Promise<T | null>
  setMiddlewareLog(name: string, data: any): void
  getService<T>(name: string): T | undefined
}
```

### 返回状态

```typescript
enum MiddlewareRunStatus {
  CONTINUE = 'continue',  // 继续执行后续中间件
  STOP = 'stop',          // 停止执行（正常终止）
  SKIPPED = 'skipped'     // 跳过（条件不满足）
}
```

### 示例

```typescript
import { MiddlewareDefinition, MiddlewareRunStatus } from '../../core'

export function createMyMiddleware(): MiddlewareDefinition {
  return {
    name: 'my-middleware',
    displayName: '我的中间件',
    description: '处理某些逻辑',
    phase: 'lifecycle-pre-request',
    category: 'my-plugin',  // 关联到 my-plugin 的配置
    priority: 50,

    async execute(mctx, next) {
      // 获取配置
      const config = await mctx.getMiddlewareConfig<MyPluginConfig>('my-plugin')
      if (!config?.enabled) {
        return next()  // 未启用则跳过
      }

      // 处理逻辑
      mctx.logger.info('Processing prompt: %s', mctx.prompt)

      // 修改 prompt
      // mctx.prompt = processedPrompt

      // 使用 store 共享数据
      mctx.store.set('myData', { processed: true })

      // 记录日志（会显示在任务详情中）
      mctx.setMiddlewareLog('my-middleware', {
        processed: true,
        originalLength: mctx.prompt.length
      })

      return next()
    }
  }
}
```

---

## 连接器 (Connector)

连接器提供实际的生成能力（调用 AI 服务）。

### 定义连接器

```typescript
interface ConnectorDefinition {
  id: string                    // 连接器 ID
  name: string                  // 显示名称
  description?: string          // 描述
  supportedTypes: MediaType[]   // 支持的媒体类型: 'image' | 'audio' | 'video' | 'text'

  configFields?: ConfigField[]  // 渠道级配置字段

  generate: (
    request: ConnectorRequest,
    config: Record<string, any>
  ) => Promise<ConnectorResponse>
}
```

### 示例

```typescript
export const myConnector: ConnectorDefinition = {
  id: 'my-api',
  name: 'My API',
  description: '调用 My API 生成图片',
  supportedTypes: ['image'],

  configFields: [
    { key: 'apiUrl', label: 'API 地址', type: 'text', default: 'https://api.example.com' },
    { key: 'apiKey', label: 'API Key', type: 'password' },
    { key: 'model', label: '模型', type: 'text', default: 'default' }
  ],

  async generate(request, config) {
    const { prompt, parameters } = request
    const { apiUrl, apiKey, model } = config

    const response = await fetch(`${apiUrl}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, model, ...parameters })
    })

    const data = await response.json()

    return {
      success: true,
      outputs: [
        { kind: 'image', url: data.imageUrl }
      ]
    }
  }
}

// index.ts
export default definePlugin({
  id: 'connector-my-api',
  name: 'My API 连接器',
  connector: myConnector
})
```

---

## 生命周期钩子

### onLoad

插件加载时调用，可用于：
- 注册 Koishi 命令
- 注册 HTTP 路由
- 注册 Console API
- 初始化资源

```typescript
async onLoad(ctx) {
  // ctx.ctx 是 Koishi Context
  // ctx.logger 是插件专用 logger
  // ctx.getConfig() 获取配置
  // ctx.getService() 获取其他服务

  // 注册 HTTP 路由
  ctx.ctx.inject(['server'], (injectedCtx) => {
    injectedCtx.server.get('/my-plugin/status', (koaCtx) => {
      koaCtx.body = { status: 'ok' }
    })
  })

  // 注册 Console API
  const console = ctx.ctx.console as any
  console.addListener('media-luna/my-plugin/action', async (params) => {
    // 处理前端请求
    return { success: true, data: { ... } }
  })

  // 清理回调
  ctx.onDispose(() => {
    // 插件卸载时执行
  })
}
```

### onUnload

插件卸载时调用，用于清理资源。

---

## 设置面板操作

在插件设置页面添加操作按钮：

```typescript
settingsActions: [
  {
    name: 'sync',
    label: '立即同步',
    type: 'primary',    // 'primary' | 'default' | 'error'
    icon: 'sync',       // Koishi 图标名
    apiEvent: 'media-luna/my-plugin/sync'  // 点击时触发的 Console 事件
  },
  {
    name: 'clear',
    label: '清空数据',
    type: 'error',
    icon: 'delete',
    apiEvent: 'media-luna/my-plugin/clear'
  }
]
```

需要在 `onLoad` 中注册对应的 API：

```typescript
async onLoad(ctx) {
  const console = ctx.ctx.console as any

  console.addListener('media-luna/my-plugin/sync', async () => {
    // 执行同步
    return { success: true, data: { message: '同步完成' } }
  })
}
```

---

## 完整插件示例

```typescript
// src/plugins/my-plugin/index.ts

import { definePlugin, MiddlewareRunStatus } from '../../core'
import type { MiddlewareContext } from '../../core'

interface MyPluginConfig {
  enabled: boolean
  prefix: string
  maxLength: number
}

const defaultConfig: MyPluginConfig = {
  enabled: true,
  prefix: '[Enhanced] ',
  maxLength: 1000
}

class MyService {
  constructor(private config: MyPluginConfig) {}

  enhance(text: string): string {
    if (!this.config.enabled) return text
    const prefixed = this.config.prefix + text
    return prefixed.slice(0, this.config.maxLength)
  }
}

export default definePlugin({
  id: 'my-plugin',
  name: '我的增强插件',
  description: '为提示词添加前缀',
  version: '1.0.0',

  configFields: [
    { key: 'enabled', label: '启用', type: 'boolean', default: true },
    { key: 'prefix', label: '前缀', type: 'text', default: '[Enhanced] ' },
    { key: 'maxLength', label: '最大长度', type: 'number', default: 1000 }
  ],
  configDefaults: defaultConfig,

  services: [
    {
      name: 'myEnhancer',
      factory: (ctx) => new MyService(ctx.getConfig<MyPluginConfig>())
    }
  ],

  middlewares: [
    {
      name: 'my-enhancer',
      displayName: '提示词增强',
      phase: 'lifecycle-pre-request',
      category: 'my-plugin',
      priority: 10,

      async execute(mctx: MiddlewareContext, next) {
        const service = mctx.getService<MyService>('myEnhancer')
        if (service) {
          const original = mctx.prompt
          mctx.prompt = service.enhance(mctx.prompt)
          mctx.setMiddlewareLog('my-enhancer', {
            original,
            enhanced: mctx.prompt
          })
        }
        return next()
      }
    }
  ],

  async onLoad(ctx) {
    ctx.logger.info('My plugin loaded with config: %o', ctx.getConfig())
  }
})
```

---

## 注意事项

### 1. 插件 ID 命名规范

- 使用 kebab-case：`my-plugin`, `connector-openai`
- 连接器插件建议以 `connector-` 开头

### 2. 配置键与插件 ID

中间件通过 `category` 字段关联到插件配置。确保：
- 中间件的 `category` 与插件 `id` 一致
- 或者使用 `getMiddlewareConfig(pluginId)` 时传入正确的插件 ID

### 3. 服务命名

服务名称全局唯一，建议使用插件 ID 作为前缀：
- `myPlugin` 或 `my-plugin-service`

### 4. 错误处理

中间件中抛出的错误会导致整个请求失败。对于非致命错误，建议：
- 记录日志
- 设置 middlewareLog
- 继续执行 `next()`

```typescript
async execute(mctx, next) {
  try {
    // 可能失败的操作
  } catch (e) {
    mctx.setMiddlewareLog('my-middleware', { error: e.message })
    // 非致命错误，继续执行
  }
  return next()
}
```

---

## 内置插件参考

查看以下内置插件作为开发参考：

| 插件 | 说明 | 关键特性 |
|-----|------|---------|
| `cache` | 缓存管理 | 服务 + 多中间件 + HTTP 路由 |
| `preset` | 预设系统 | 服务 + 远程同步 + 数据库 |
| `billing` | 计费系统 | 双中间件（预扣/结算） |
| `task` | 任务记录 | 数据库操作 + 统计 |
| `connector-gemini` | Google Gemini 3 (Imagen) 连接器 | `generate` |
| `connector-midjourney` | Midjourney Proxy 连接器 | `generate` |
| `connector-stability` | Stability AI (SD3) 连接器 | `generate` |
| `connector-suno` | Suno AI 音乐生成连接器 | `generate` |
| `connector-runway` | Runway 视频生成连接器 | `generate` |
| `connector-comfyui` | ComfyUI 工作流连接器 | `generate` |
| `connector-modelscope` | ModelScope (魔搭) 连接器 | `generate` |
| `connector-*` | 各连接器 | 连接器定义示例 |

---

## 外部插件（第三方插件）

Media Luna 支持从 npm 模块加载第三方插件。

### 外部插件格式

外部插件需要是一个 npm 包，默认导出 `PluginDefinition`：

```typescript
// koishi-plugin-media-luna-xxx/src/index.ts
import { definePlugin } from 'koishi-plugin-media-luna'

export default definePlugin({
  id: 'my-external-plugin',
  name: '我的外部插件',
  // ... 其他配置
})
```

### 加载外部插件

通过 API 或配置加载：

```typescript
// 通过 API 加载
await ctx.mediaLuna.pluginLoader.addExternalPlugin('koishi-plugin-media-luna-xxx')

// 通过配置（config.yaml）
externalPlugins:
  - koishi-plugin-media-luna-xxx
  - ./path/to/local/plugin
```

### 前端 API

```typescript
import { pluginApi } from '@koishijs/plugin-media-luna/client'

// 获取已加载的外部插件
const externals = await pluginApi.externalList()

// 添加外部插件
await pluginApi.externalAdd('koishi-plugin-media-luna-xxx')

// 移除外部插件
await pluginApi.externalRemove('koishi-plugin-media-luna-xxx')
```

---

## TODO / 已知限制

1. **前端扩展组件** - 目前仅支持配置表单，自定义 Vue 组件尚未完善
2. **插件热重载** - 配置热重载已支持，但插件代码变更需要重启
3. **Koishi 命令封装** - 需要手动在 onLoad 中注册
