# Media Luna 架构文档

中间件驱动的多媒体生成插件，支持插件化扩展和 WebUI 管理。

## 架构概述

### 核心设计

| 特性 | 说明 |
|------|------|
| 插件化架构 | 所有功能通过插件系统提供，包括内置连接器和中间件 |
| 中间件驱动 | 基于 Kahn 算法拓扑排序，支持 before/after 依赖声明 |
| 配置持久化 | 使用 YAML 文件存储配置，WebUI 管理 |
| Tag 匹配 | 渠道和预设通过 tag 匹配，用于指令注册 |

### 生命周期阶段

```
prepare → pre-request → request → post-request → finalize
   ↓          ↓           ↓           ↓            ↓
 验证/初始化  预设/翻译   调用连接器   输出处理    计费/记录
```

### 插件系统

Media Luna 采用完全插件化的架构，所有功能（包括内置功能）都通过插件提供：

**内置插件：**

| 插件 ID | 类型 | 说明 |
|---------|------|------|
| `cache` | 功能 | 资源缓存服务 |
| `preset` | 功能 | 预设管理和远程同步 |
| `billing` | 功能 | 计费中间件 |
| `task` | 功能 | 任务记录 |
| `prompt-encoding` | 功能 | 提示词编码检测 |
| `connector-dalle` | 连接器 | OpenAI DALL-E |
| `connector-sd-webui` | 连接器 | Stable Diffusion WebUI |
| `connector-flux` | 连接器 | Flux API |
| `connector-chat-api` | 连接器 | 通用 Chat API |

## 目录结构

```
src/
├── index.ts                 # 插件入口
├── config.ts                # Koishi Schema 配置
├── database.ts              # 数据库表扩展
├── augmentations.d.ts       # Koishi 模块扩展声明
│
├── types/
│   └── index.ts             # 类型重导出（向后兼容）
│
├── core/                    # 核心框架
│   ├── index.ts             # 统一导出
│   ├── types.ts             # 核心类型定义
│   ├── config/              # 配置服务 (YAML)
│   ├── pipeline/            # 管道系统
│   │   ├── dependency-graph.ts
│   │   ├── middleware-registry.ts
│   │   └── generation-pipeline.ts
│   ├── registry/            # 注册中心
│   │   ├── connector.registry.ts
│   │   └── service.registry.ts
│   ├── services/            # 服务层
│   │   ├── channel.service.ts   # 渠道 CRUD
│   │   ├── request.service.ts   # 请求服务
│   │   └── medialuna.service.ts # 主服务 (ctx.mediaLuna)
│   ├── utils/               # 工具函数
│   │   ├── error.ts         # 错误处理
│   │   └── logger.ts        # 日志工具
│   ├── plugin/              # 插件系统
│   │   └── loader.ts        # 插件加载器
│   └── api/                 # WebSocket API
│       ├── index.ts         # API 注册入口
│       ├── channel-api.ts   # 渠道管理
│       ├── preset-api.ts    # 预设管理
│       ├── task-api.ts      # 任务管理
│       ├── middleware-api.ts
│       ├── connector-api.ts
│       ├── settings-api.ts
│       ├── cache-api.ts
│       └── plugin-api.ts
│
├── plugins/                 # 内置插件
│   ├── cache/               # 资源缓存
│   ├── preset/              # 预设管理
│   ├── billing/             # 计费
│   ├── task/                # 任务记录
│   ├── prompt-encoding/     # 提示词编码
│   ├── connector-dalle/     # DALL-E 连接器
│   ├── connector-sd-webui/  # SD WebUI 连接器
│   ├── connector-flux/      # Flux 连接器
│   └── connector-chat-api/  # Chat API 连接器
│
client/                      # 前端 (Vue)
├── index.ts                 # 前端入口
├── types.ts                 # 类型定义
├── api.ts                   # API 调用封装
└── components/              # Vue 组件
```

## 类型系统

### 插件定义 (PluginDefinition)

```typescript
import { definePlugin } from './core'

export default definePlugin({
  id: 'my-plugin',
  name: '我的插件',
  description: '插件描述',
  version: '1.0.0',

  // 配置字段（在插件设置页显示）
  configFields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true }
  ],

  // 声明式中间件注册
  middlewares: [
    {
      name: 'my-middleware',
      displayName: '我的中间件',
      phase: 'lifecycle-pre-request',
      after: ['preset'],
      execute: async (context, next) => {
        // 处理逻辑
        return next()
      }
    }
  ],

  // 声明式连接器注册
  connector: {
    id: 'my-connector',
    name: 'My Connector',
    supportedTypes: ['image'],
    fields: [...],
    generate: async (ctx, config, files, prompt) => {
      // 返回 OutputAsset[]
    }
  },

  // 初始化钩子
  async setup(ctx, api) {
    // 注册服务、事件监听等
  }
})
```

### 配置字段 (ConfigField)

```typescript
interface ConfigField {
  key: string                    // 字段标识
  label: string                  // 显示标签
  type: ConfigFieldType          // 字段类型
  required?: boolean             // 是否必填
  default?: any                  // 默认值
  description?: string           // 描述文本
  options?: ConfigFieldOption[]  // select 类型的选项
  showWhen?: { field: string, value: any }  // 条件显示
}

type ConfigFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select' | 'select-remote' | 'textarea'
```

### 卡片展示字段 (CardField)

```typescript
interface CardField {
  source: 'channel' | 'connectorConfig' | 'middlewareOverride'
  key: string
  label: string
  format?: 'text' | 'password-mask' | 'number' | 'size' | 'boolean' | 'currency'
  suffix?: string
  configGroup?: string
}
```

## API 参考

### 执行 API

```typescript
// 通过渠道 ID 生成
const result = await ctx.mediaLuna.generate({
  channel: 1,
  prompt: 'a cat',
  files: [],
  parameters: { preset: 'anime' }
})

// 通过渠道名生成
const result = await ctx.mediaLuna.generateByName({
  channelName: 'dalle',
  presetName: 'anime',
  prompt: 'a cat',
  session
})
```

### 查询 API

```typescript
// 渠道服务
ctx.mediaLuna.channels.list()
ctx.mediaLuna.channels.getById(id)
ctx.mediaLuna.channels.create(data)

// 预设服务（通过插件提供）
ctx.mediaLuna.presets?.list()
ctx.mediaLuna.presets?.getMatchingPresets(tags)

// 任务服务（通过插件提供）
ctx.mediaLuna.tasks?.query(options)
ctx.mediaLuna.tasks?.getById(id)

// 缓存服务（通过插件提供）
ctx.mediaLuna.cache?.get(id)
ctx.mediaLuna.cache?.cache(buffer, mimeType)

// 注册中心
ctx.mediaLuna.connectors.list()
ctx.mediaLuna.middlewares.list()

// 插件加载器
ctx.mediaLuna.pluginLoader.getPluginInfos()
```

### 注册 API

```typescript
// 注册连接器
ctx.mediaLuna.registerConnector(connectorDefinition)

// 注册中间件
ctx.mediaLuna.registerMiddleware(middlewareDefinition)

// 注册前端扩展
ctx.mediaLuna.registerFrontendExtension(extension)

// 注册设置面板
ctx.mediaLuna.registerSettingsPanel(panel)
```

## 数据库表

| 表名 | 说明 |
|------|------|
| medialuna_channel | 渠道配置 |
| medialuna_preset | 预设模板 |
| medialuna_task | 任务记录 |
| medialuna_asset_cache | 资源缓存 |

## 配置文件

配置存储在 `data/media-luna/config.yaml`：

```yaml
middlewares:
  billing-prepare:
    enabled: true
    config: {}
  storage:
    enabled: true
    config:
      backend: local
      localCacheDir: data/media-luna/assets
      localPublicPath: /media-luna/assets

remote-presets:
  apiUrl: https://prompt.vioaki.xyz/api/templates?per_page=-1
  autoSync: false
  syncInterval: 60
  deleteRemoved: false
```

## WebSocket API 端点

所有 API 通过 Koishi Console WebSocket 通信，事件名格式：`media-luna/{模块}/{操作}`

### 渠道管理

- `media-luna/channels/list` - 获取渠道列表
- `media-luna/channels/get` - 获取单个渠道
- `media-luna/channels/create` - 创建渠道
- `media-luna/channels/update` - 更新渠道
- `media-luna/channels/delete` - 删除渠道

### 预设管理

- `media-luna/presets/list` - 获取预设列表
- `media-luna/presets/get` - 获取单个预设
- `media-luna/presets/create` - 创建预设
- `media-luna/presets/update` - 更新预设
- `media-luna/presets/delete` - 删除预设
- `media-luna/presets/sync` - 同步远程预设

### 任务管理

- `media-luna/tasks/list` - 获取任务列表
- `media-luna/tasks/get` - 获取任务详情
- `media-luna/tasks/delete` - 删除任务
- `media-luna/tasks/stats` - 获取统计
- `media-luna/tasks/cleanup` - 清理旧任务

### 中间件配置

- `media-luna/middlewares/list` - 获取中间件列表
- `media-luna/middlewares/get` - 获取中间件配置
- `media-luna/middlewares/update` - 更新配置
- `media-luna/middlewares/execution-order` - 获取执行顺序

### 插件管理

- `media-luna/plugins/list` - 获取插件列表
- `media-luna/plugins/enable` - 启用插件
- `media-luna/plugins/disable` - 禁用插件
- `media-luna/plugins/update-config` - 更新插件配置
