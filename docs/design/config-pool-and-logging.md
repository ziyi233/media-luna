# Media Luna 设计方案: 配置池与结构化日志

## 一、配置池系统 (模型级局部配置 + Tag 标签)

### 1.1 设计目标

用户反馈：
- "一个渠道也可以支持多个模型，但是最后落实到请求的主体肯定是具体的一个模型"
- "仍然要保持最底层的具体模型别名具体配置，这样就能做到每个模型别名单独的中间件配置"
- "贯彻模型级局部配置，以及 tag 标签"

核心理念：**模型配置是最小粒度单位，渠道是模型配置的容器**

配置池解决以下问题：
- **模型级配置**: 每个模型有完整的连接器配置 + 中间件配置
- **Tag 标签筛选**: 通过标签实现模型分组、筛选和路由
- **多 API Key 轮转**: 避免单个 Key 达到 Rate Limit
- **故障转移**: 当一个配置失败时自动切换到备用配置
- **负载均衡**: 均匀分配请求到不同配置

### 1.2 数据模型

```typescript
// ============ 模型配置条目（核心单元） ============

/** 模型配置条目 - 最小配置粒度 */
interface ModelConfigEntry {
  id: string                        // 唯一标识（UUID）
  name: string                      // 模型别名（如 "Qwen-Image", "FLUX-dev"）

  // === 标签系统 ===
  tags: string[]                    // 模型标签（如 ["image", "anime", "fast"]）

  // === 连接器配置 ===
  connectorConfig: Record<string, any>  // 连接器配置（apiKey, model, 等）

  // === 中间件配置覆盖（模型级） ===
  // 每个模型可以有独立的中间件配置
  // 例如：不同模型使用不同的 LoRA 别名映射、不同的计费价格、不同的预设
  pluginOverrides: Record<string, any>

  // === 负载均衡 ===
  weight: number                    // 权重（用于负载均衡，0-100）
  priority: number                  // 优先级（用于 failover，数字越小优先级越高）
  enabled: boolean                  // 是否启用

  // === 运行时状态（不持久化） ===
  stats?: ModelConfigStats
}

interface ModelConfigStats {
  successCount: number
  failureCount: number
  totalLatencyMs: number            // 累计延迟（用于计算平均延迟）
  lastUsedAt: number
  lastErrorAt?: number
  lastError?: string
  cooldownUntil?: number
}

/** 配置池选择策略 */
type PoolStrategy =
  | 'round-robin'       // 轮询
  | 'weighted'          // 权重随机
  | 'least-used'        // 最少使用
  | 'least-latency'     // 最低延迟
  | 'least-failures'    // 最少失败
  | 'failover'          // 故障转移（按 priority 排序）
  | 'random'            // 完全随机
  | 'tag-match'         // 标签匹配（根据请求参数中的 tag 筛选）

/** 渠道配置（扩展后） */
interface ChannelConfig {
  id: number
  name: string
  enabled: boolean
  connectorId: string

  // === 标签（渠道级） ===
  tags: string[]                    // 渠道标签（用于指令路由）

  // === 模型配置池 ===
  poolEnabled: boolean              // 是否启用配置池
  poolStrategy: PoolStrategy        // 选择策略
  poolEntries: ModelConfigEntry[]   // 模型配置列表
  poolSettings: {
    cooldownMs: number              // 失败冷却时间（默认 60000ms）
    maxFailures: number             // 最大连续失败次数（默认 3）
    retryOnDifferentConfig: boolean // 失败后尝试其他配置（默认 true）
    tagFilterMode: 'any' | 'all'    // 标签筛选模式：匹配任一/全部
  }

  // === 默认配置（单配置模式 or 池的基础值） ===
  connectorConfig: Record<string, any>
  pluginOverrides: Record<string, any>
}
```

### 1.3 配置池服务

```typescript
// core/config-pool.service.ts

/** 配置选择选项 */
interface SelectConfigOptions {
  /** 请求指定的标签（用于筛选模型） */
  requestTags?: string[]
  /** 指定模型名称（精确匹配） */
  modelName?: string
}

/** 配置池选择结果 */
interface PoolSelectionResult {
  // 合并后的连接器配置
  connectorConfig: Record<string, any>
  // 合并后的中间件配置覆盖
  pluginOverrides: Record<string, any>
  // 选中的模型条目
  entry?: ModelConfigEntry
  // 是否使用了配置池
  isPooled: boolean
}

export class ConfigPoolService {
  private _pools: Map<number, PoolState> = new Map()

  /**
   * 选择模型配置
   *
   * 配置合并优先级（从低到高）：
   * 1. 渠道默认配置 (channel.connectorConfig, channel.pluginOverrides)
   * 2. 模型条目配置 (entry.connectorConfig, entry.pluginOverrides)
   *
   * @param channel 渠道配置
   * @param options 选择选项（标签筛选、指定模型等）
   */
  async selectConfig(
    channel: ChannelConfig,
    options?: SelectConfigOptions
  ): Promise<PoolSelectionResult> {
    // 单配置模式
    if (!channel.poolEnabled || channel.poolEntries.length === 0) {
      return {
        connectorConfig: channel.connectorConfig,
        pluginOverrides: channel.pluginOverrides,
        isPooled: false
      }
    }

    // 配置池模式
    const entry = this._selectEntry(channel, options)
    if (!entry) {
      // 所有配置都在冷却中或无匹配
      throw Errors.rateLimited(channel.poolSettings.cooldownMs / 1000)
    }

    // 合并配置：渠道默认 + 模型覆盖
    return {
      connectorConfig: {
        ...channel.connectorConfig,
        ...entry.connectorConfig
      },
      pluginOverrides: this._mergePluginOverrides(
        channel.pluginOverrides,
        entry.pluginOverrides
      ),
      entry,
      isPooled: true
    }
  }

  /**
   * 选择模型条目
   */
  private _selectEntry(
    channel: ChannelConfig,
    options?: SelectConfigOptions
  ): ModelConfigEntry | null {
    let candidates = channel.poolEntries.filter(e =>
      e.enabled &&
      (!e.stats?.cooldownUntil || Date.now() >= e.stats.cooldownUntil)
    )

    if (candidates.length === 0) return null

    // 精确匹配模型名称
    if (options?.modelName) {
      const exact = candidates.find(e =>
        e.name.toLowerCase() === options.modelName!.toLowerCase()
      )
      return exact || null
    }

    // 标签筛选
    if (options?.requestTags && options.requestTags.length > 0) {
      candidates = this._filterByTags(
        candidates,
        options.requestTags,
        channel.poolSettings.tagFilterMode
      )
      if (candidates.length === 0) return null
    }

    // 按策略选择
    return this._applyStrategy(channel, candidates)
  }

  /**
   * 按标签筛选模型
   */
  private _filterByTags(
    entries: ModelConfigEntry[],
    requestTags: string[],
    mode: 'any' | 'all'
  ): ModelConfigEntry[] {
    return entries.filter(entry => {
      if (mode === 'any') {
        // 匹配任一标签
        return requestTags.some(tag =>
          entry.tags.map(t => t.toLowerCase()).includes(tag.toLowerCase())
        )
      } else {
        // 匹配全部标签
        return requestTags.every(tag =>
          entry.tags.map(t => t.toLowerCase()).includes(tag.toLowerCase())
        )
      }
    })
  }

  /**
   * 应用选择策略
   */
  private _applyStrategy(
    channel: ChannelConfig,
    candidates: ModelConfigEntry[]
  ): ModelConfigEntry | null {
    switch (channel.poolStrategy) {
      case 'round-robin':
        return this._roundRobin(channel.id, candidates)
      case 'weighted':
        return this._weighted(candidates)
      case 'random':
        return candidates[Math.floor(Math.random() * candidates.length)]
      case 'least-used':
        return this._leastUsed(candidates)
      case 'least-latency':
        return this._leastLatency(candidates)
      case 'least-failures':
        return this._leastFailures(candidates)
      case 'failover':
        // 按 priority 排序，选第一个
        return [...candidates].sort((a, b) => a.priority - b.priority)[0]
      case 'tag-match':
        // tag-match 模式下，如果到这里说明已经筛选过了，随机选一个
        return candidates[Math.floor(Math.random() * candidates.length)]
      default:
        return candidates[0]
    }
  }

  /**
   * 合并插件/中间件配置覆盖
   * 支持深度合并，模型配置优先
   */
  private _mergePluginOverrides(
    channelOverrides: Record<string, any>,
    entryOverrides: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {}

    // 获取所有插件/中间件 key
    const allKeys = new Set([
      ...Object.keys(channelOverrides || {}),
      ...Object.keys(entryOverrides || {})
    ])

    for (const key of allKeys) {
      const channelValue = channelOverrides?.[key]
      const entryValue = entryOverrides?.[key]

      if (entryValue === undefined) {
        result[key] = channelValue
      } else if (channelValue === undefined) {
        result[key] = entryValue
      } else if (
        typeof channelValue === 'object' && !Array.isArray(channelValue) &&
        typeof entryValue === 'object' && !Array.isArray(entryValue)
      ) {
        // 深度合并对象
        result[key] = { ...channelValue, ...entryValue }
      } else {
        // 条目值覆盖渠道值
        result[key] = entryValue
      }
    }

    return result
  }

  /**
   * 报告配置使用结果
   */
  reportResult(channelId: number, entryId: string, success: boolean, error?: string): void {
    const state = this._pools.get(channelId)
    if (!state) return

    const entry = state.entries.get(entryId)
    if (!entry) return

    entry.stats.lastUsedAt = Date.now()

    if (success) {
      entry.stats.successCount++
      entry.stats.failureCount = 0  // 重置连续失败计数
    } else {
      entry.stats.failureCount++
      entry.stats.lastErrorAt = Date.now()
      entry.stats.lastError = error

      // 达到最大失败次数，进入冷却
      if (entry.stats.failureCount >= state.settings.maxFailures) {
        entry.stats.cooldownUntil = Date.now() + state.settings.cooldownMs
      }
    }
  }

  private _selectEntry(channel: ChannelConfig): ConfigPoolEntry | null {
    const available = channel.poolEntries.filter(e =>
      e.enabled &&
      (!e.stats?.cooldownUntil || Date.now() >= e.stats.cooldownUntil)
    )

    if (available.length === 0) return null

    switch (channel.poolStrategy) {
      case 'round-robin':
        return this._roundRobin(channel.id, available)
      case 'weighted':
        return this._weighted(available)
      case 'least-used':
        return this._leastUsed(available)
      case 'least-failures':
        return this._leastFailures(available)
      case 'failover':
        return available[0]  // 始终选择第一个可用的
      default:
        return available[0]
    }
  }

  // ... 各策略实现
}
```

### 1.4 与管道集成

配置池需要在管道创建 MiddlewareContext 之前选择配置，这样条目级的 `pluginOverrides` 才能影响中间件行为。

```typescript
// generation-pipeline.ts (修改)

async execute(request: GenerationRequest): Promise<GenerationResult> {
  // ... 获取渠道配置 ...
  const channel = await this._getChannel(channelId)

  // === 配置池选择（在创建上下文之前） ===
  const poolResult = await this._configPool.selectConfig(channel)

  // 创建"有效渠道配置"（合并了条目配置）
  const effectiveChannel: ChannelConfig = {
    ...channel,
    connectorConfig: poolResult.connectorConfig,
    pluginOverrides: poolResult.pluginOverrides
  }

  // 日志记录使用的配置
  if (poolResult.isPooled) {
    this._logger.debug(
      'Using pool entry: %s (%s)',
      poolResult.entryName || poolResult.entryId,
      poolResult.entryId
    )
  }

  // 创建上下文时使用有效配置
  const context = await this._createContext(request, effectiveChannel)

  // ... 执行管道 ...

  // 报告配置使用结果
  if (poolResult.isPooled && poolResult.entryId) {
    this._configPool.reportResult(
      channel.id,
      poolResult.entryId,
      result.success,
      result.error
    )
  }

  return result
}
```

#### 中间件配置获取流程

```typescript
// MiddlewareContext.getMiddlewareConfig 实现

getMiddlewareConfig: async <T>(name: string): Promise<T | null> => {
  // 1. 获取全局配置（来自 YAML 配置文件）
  const globalConfig = await this._getMiddlewareConfig(name)

  // 2. 获取渠道级覆盖（已包含条目级覆盖）
  //    effectiveChannel.pluginOverrides 已经是合并后的结果
  const channelOverride = effectiveChannel.pluginOverrides?.[name]

  if (!globalConfig && !channelOverride) {
    return null
  }

  // 合并配置
  return {
    ...(globalConfig ?? {}),
    ...(channelOverride ?? {})
  } as T
}
```

#### 配置层级示意

```
┌─────────────────────────────────────────────────────────────┐
│                     全局配置 (YAML)                          │
│  middlewares:                                               │
│    modelscope-lora:                                         │
│      normalizeWeights: true                                 │
│      loraAliases: [...]                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓ 覆盖
┌─────────────────────────────────────────────────────────────┐
│                   渠道默认配置                               │
│  channel.pluginOverrides:                                   │
│    modelscope-lora:                                         │
│      normalizeWeights: false  # 覆盖全局                     │
│    billing:                                                 │
│      price: 0.1                                             │
└─────────────────────────────────────────────────────────────┘
                            ↓ 覆盖
┌─────────────────────────────────────────────────────────────┐
│                  配置池条目配置                              │
│  entry.pluginOverrides:                                     │
│    modelscope-lora:                                         │
│      loraAliases:             # 条目专属的 LoRA 别名          │
│        - alias: "kotone"                                    │
│          repoId: "ziyi2333/Kotone_Fujita"                   │
│    billing:                                                 │
│      price: 0.2               # 这个模型更贵                 │
└─────────────────────────────────────────────────────────────┘
                            ↓ 最终生效
┌─────────────────────────────────────────────────────────────┐
│                    有效配置                                  │
│  modelscope-lora:                                           │
│    normalizeWeights: false    # 来自渠道                     │
│    loraAliases: [...]         # 来自条目                     │
│  billing:                                                   │
│    price: 0.2                 # 来自条目                     │
└─────────────────────────────────────────────────────────────┘
```

### 1.5 数据库变更

```typescript
// database.ts - 渠道表新增字段

ctx.database.extend('medialuna_channel', {
  // ... 现有字段 ...

  // 配置池字段
  poolEnabled: 'boolean',
  poolStrategy: 'string',         // PoolStrategy 枚举值
  poolEntries: 'text',            // JSON 序列化的 ConfigPoolEntry[]
  poolSettings: 'text',           // JSON 序列化的池设置
}, {
  autoInc: true,
  unique: ['name']
})
```

### 1.6 UI 设计要点

- 渠道编辑页新增"配置池"开关
- 启用后显示配置列表，支持添加/删除/排序
- 每个配置条目可展开编辑详细参数
- 显示运行时统计（成功率、最后使用时间、平均延迟等）
- 策略选择下拉框（轮询、权重、故障转移等）
- 模型配置继承渠道默认配置，只需填写差异部分
- 标签编辑器（支持自动补全已有标签）

### 1.7 使用场景示例

#### 场景 1：通过标签筛选模型

```yaml
# 渠道配置
channel:
  name: "ai-image"
  connectorId: "modelscope"
  tags: ["image"]                   # 渠道标签（用于指令路由）
  poolEnabled: true
  poolStrategy: "tag-match"         # 标签匹配策略
  poolSettings:
    tagFilterMode: "any"            # 匹配任一标签

  # 渠道默认配置
  connectorConfig:
    apiUrl: "https://api-inference.modelscope.cn/"
    apiKey: "ms-xxxxxx"

  # 模型配置池
  poolEntries:
    - name: "Qwen-Anime"
      tags: ["anime", "character", "lora"]  # 模型标签
      connectorConfig:
        model: "MusePublic/Qwen-image"
      pluginOverrides:
        billing: { price: 10 }
        modelscope-lora:
          loraAliases:
            - { alias: "kotone", repoId: "ziyi2333/Kotone_Fujita" }

    - name: "Qwen-Photo"
      tags: ["photo", "realistic"]
      connectorConfig:
        model: "MusePublic/Qwen-image"
        negativePrompt: "cartoon, anime, illustration"
      pluginOverrides:
        billing: { price: 10 }

    - name: "FLUX-Fast"
      tags: ["fast", "draft"]
      connectorConfig:
        model: "AI-ModelScope/FLUX.1-schnell"
        steps: 4
      pluginOverrides:
        billing: { price: 5 }

    - name: "FLUX-Quality"
      tags: ["quality", "hd"]
      connectorConfig:
        model: "AI-ModelScope/FLUX.1-dev"
        steps: 28
      pluginOverrides:
        billing: { price: 25 }
```

**请求示例：**

```typescript
// 用户请求：生成动漫角色
await mediaLuna.generate({
  channel: "ai-image",
  prompt: "#kotone# 1girl, smile",
  parameters: {
    tags: ["anime"]                 // 请求标签 → 匹配 "Qwen-Anime"
  }
})

// 用户请求：快速草稿
await mediaLuna.generate({
  channel: "ai-image",
  prompt: "landscape, sunset",
  parameters: {
    tags: ["fast"]                  // 请求标签 → 匹配 "FLUX-Fast"
  }
})

// 用户请求：高质量照片风格
await mediaLuna.generate({
  channel: "ai-image",
  prompt: "portrait photo of a woman",
  parameters: {
    tags: ["photo", "quality"]      // 多标签 → 匹配 "Qwen-Photo" 或 "FLUX-Quality"
  }
})

// 用户请求：指定模型名称
await mediaLuna.generate({
  channel: "ai-image",
  prompt: "cyberpunk city",
  parameters: {
    model: "FLUX-Quality"           // 精确匹配模型名称
  }
})
```

#### 场景 2：故障转移 + API Key 轮转

```yaml
channel:
  name: "image-production"
  connectorId: "modelscope"
  poolEnabled: true
  poolStrategy: "failover"          # 故障转移策略
  poolSettings:
    maxFailures: 3
    cooldownMs: 60000

  poolEntries:
    - name: "Primary-Key1"
      priority: 1                   # 最高优先级
      connectorConfig:
        apiKey: "ms-primary-key-1"
        model: "MusePublic/Qwen-image"

    - name: "Primary-Key2"
      priority: 1                   # 同优先级，轮转使用
      connectorConfig:
        apiKey: "ms-primary-key-2"
        model: "MusePublic/Qwen-image"

    - name: "Backup-FLUX"
      priority: 10                  # 备用（优先级低）
      connectorConfig:
        apiKey: "ms-backup-key"
        model: "AI-ModelScope/FLUX.1-dev"
```

**行为：**
- 正常情况：在 Primary-Key1 和 Primary-Key2 之间轮转
- Key1 连续失败 3 次后进入冷却，自动使用 Key2
- 两个 Primary Key 都冷却时，降级到 Backup-FLUX

#### 场景 3：模型级中间件配置差异

```yaml
channel:
  name: "multi-model"
  poolEnabled: true
  poolStrategy: "round-robin"

  # 渠道默认中间件配置
  pluginOverrides:
    billing:
      enabled: true
      currency: "coins"
    preset:
      defaultPreset: "general"      # 默认预设

  poolEntries:
    - name: "Anime-Model"
      tags: ["anime"]
      pluginOverrides:
        billing:
          price: 10
        preset:
          defaultPreset: "anime"    # 动漫模型使用动漫预设
        modelscope-lora:
          loraAliases:
            - { alias: "kotone", repoId: "ziyi2333/Kotone_Fujita" }
            - { alias: "miku", repoId: "someone/Miku_Hatsune" }

    - name: "Photo-Model"
      tags: ["photo"]
      pluginOverrides:
        billing:
          price: 15
        preset:
          defaultPreset: "photography"  # 照片模型使用摄影预设
        # 不配置 loraAliases，此模型不支持 LoRA
```

**效果：**
- 选中 "Anime-Model" 时：使用 "anime" 预设，LoRA 中间件能解析 `#kotone#` 和 `#miku#`
- 选中 "Photo-Model" 时：使用 "photography" 预设，LoRA 中间件无可用别名

---

## 二、结构化日志系统

### 2.1 设计目标

- **请求追踪**: 每个请求分配唯一 requestId，贯穿整个生命周期
- **性能分析**: 记录各阶段耗时，便于定位瓶颈
- **中间件日志**: 统一收集中间件输出
- **调试友好**: DEBUG 级别输出详细信息，INFO 级别输出摘要

### 2.2 请求上下文增强

```typescript
// types.ts - 扩展 MiddlewareContext

interface MiddlewareContext {
  // ... 现有字段 ...

  /** 请求追踪 ID（UUID，用于日志关联） */
  requestId: string

  /** 性能时间线 */
  timeline: RequestTimeline
}

/** 时间线条目 */
interface TimelineEntry {
  name: string                    // 阶段名称
  phase: LifecyclePhase           // 所属阶段
  startTime: number               // 开始时间戳
  endTime?: number                // 结束时间戳
  duration?: number               // 耗时（ms）
  status: 'running' | 'success' | 'failed' | 'skipped'
  meta?: Record<string, any>      // 附加信息
}

/** 请求时间线 */
class RequestTimeline {
  private _requestId: string
  private _entries: TimelineEntry[] = []
  private _startTime: number

  constructor(requestId: string) {
    this._requestId = requestId
    this._startTime = Date.now()
  }

  /** 开始一个阶段 */
  start(name: string, phase: LifecyclePhase): TimelineEntry {
    const entry: TimelineEntry = {
      name,
      phase,
      startTime: Date.now(),
      status: 'running'
    }
    this._entries.push(entry)
    return entry
  }

  /** 结束一个阶段 */
  end(name: string, status: 'success' | 'failed' | 'skipped', meta?: Record<string, any>): void {
    const entry = this._entries.find(e => e.name === name && e.status === 'running')
    if (entry) {
      entry.endTime = Date.now()
      entry.duration = entry.endTime - entry.startTime
      entry.status = status
      entry.meta = meta
    }
  }

  /** 获取总耗时 */
  getTotalDuration(): number {
    return Date.now() - this._startTime
  }

  /** 获取各阶段耗时摘要 */
  getSummary(): Record<string, number> {
    const summary: Record<string, number> = {}
    for (const entry of this._entries) {
      if (entry.duration !== undefined) {
        summary[entry.name] = entry.duration
      }
    }
    return summary
  }

  /** 转换为日志对象 */
  toLog(): object {
    return {
      requestId: this._requestId,
      totalDuration: this.getTotalDuration(),
      entries: this._entries.map(e => ({
        name: e.name,
        phase: e.phase,
        duration: e.duration,
        status: e.status,
        ...(e.meta ? { meta: e.meta } : {})
      }))
    }
  }
}
```

### 2.3 日志输出格式

```typescript
// logger.ts - 结构化日志支持

/** 结构化日志方法 */
export interface StructuredLogger extends PluginLogger {
  /** 结构化日志（带 requestId） */
  request(
    level: LogLevel,
    requestId: string,
    message: string,
    data?: Record<string, any>
  ): void
}

export function createStructuredLogger(baseLogger: Logger, pluginId: string): StructuredLogger {
  const prefix = `[${pluginId}]`

  const formatMessage = (requestId: string, message: string) =>
    `${prefix} [${requestId.slice(0, 8)}] ${message}`

  return {
    // 基础方法（现有）
    debug: (message, ...args) => baseLogger.debug(`${prefix} ${message}`, ...args),
    info: (message, ...args) => baseLogger.info(`${prefix} ${message}`, ...args),
    warn: (message, ...args) => baseLogger.warn(`${prefix} ${message}`, ...args),
    error: (message, ...args) => baseLogger.error(`${prefix} ${message}`, ...args),

    // 结构化方法（新增）
    request(level, requestId, message, data) {
      const formatted = formatMessage(requestId, message)
      const args = data ? ['\n' + JSON.stringify(data, null, 2)] : []

      switch (level) {
        case 'debug': baseLogger.debug(formatted, ...args); break
        case 'info': baseLogger.info(formatted, ...args); break
        case 'warn': baseLogger.warn(formatted, ...args); break
        case 'error': baseLogger.error(formatted, ...args); break
      }
    }
  }
}
```

### 2.4 管道日志集成

修改 `generation-pipeline.ts`：

```typescript
// generation-pipeline.ts (修改)

async execute(request: GenerationRequest): Promise<GenerationResult> {
  // 生成请求 ID
  const requestId = crypto.randomUUID()
  const timeline = new RequestTimeline(requestId)

  this._logger.request('info', requestId, 'Starting generation', {
    channel: request.channel,
    promptLength: request.prompt.length,
    fileCount: request.files?.length ?? 0
  })

  // 创建上下文时注入
  const context = await this._createContext(request, channelId, requestId, timeline)

  try {
    // 执行各阶段
    for (const level of levels) {
      for (const middleware of level) {
        timeline.start(middleware.name, middleware.phase)

        try {
          const result = await this._executeMiddleware(middleware, context)
          timeline.end(middleware.name, result.status === 'success' ? 'success' : 'failed')
        } catch (error) {
          timeline.end(middleware.name, 'failed', { error: error.message })
          throw error
        }
      }
    }

    // 成功日志
    this._logger.request('info', requestId, 'Generation completed', {
      outputCount: context.output?.length ?? 0,
      timeline: timeline.getSummary()
    })

  } catch (error) {
    // 失败日志
    this._logger.request('error', requestId, 'Generation failed', {
      error: error.message,
      timeline: timeline.toLog()
    })
  }

  // 详细时间线（DEBUG 级别）
  this._logger.request('debug', requestId, 'Timeline details', timeline.toLog())

  return result
}
```

### 2.5 任务记录存储

扩展 `medialuna_task` 表以存储结构化日志：

```typescript
// database.ts (修改)

ctx.database.extend('medialuna_task', {
  // ... 现有字段 ...

  // 新增
  requestId: 'string',            // 请求追踪 ID
  timeline: 'text',               // JSON 序列化的时间线
}, {
  autoInc: true
})
```

### 2.6 日志输出示例

**INFO 级别**（生产环境）：
```
media-luna [core] [a1b2c3d4] Starting generation channel=1, prompt=156 chars, files=0
media-luna [core] [a1b2c3d4] Generation completed outputCount=1, timeline={preset:12,request:3450,cache:45}
```

**DEBUG 级别**（开发调试）：
```
media-luna [core] [a1b2c3d4] Starting generation
{
  "channel": 1,
  "promptLength": 156,
  "fileCount": 0
}
media-luna [core] [a1b2c3d4] Timeline details
{
  "requestId": "a1b2c3d4-e5f6-...",
  "totalDuration": 3521,
  "entries": [
    {"name": "preset", "phase": "lifecycle-pre-request", "duration": 12, "status": "success"},
    {"name": "modelscope-lora", "phase": "lifecycle-pre-request", "duration": 3, "status": "success"},
    {"name": "request", "phase": "lifecycle-request", "duration": 3450, "status": "success"},
    {"name": "cache", "phase": "lifecycle-post-request", "duration": 45, "status": "success"}
  ]
}
```

---

## 三、实现优先级

### Phase 1: 结构化日志（低风险，高收益）
1. 添加 `requestId` 到 MiddlewareContext
2. 实现 RequestTimeline 类
3. 修改 GenerationPipeline 集成时间线
4. 更新任务记录表

### Phase 2: 配置池核心（中等风险）
1. 扩展 ChannelConfig 类型
2. 实现 ConfigPoolService
3. 修改 RequestService 集成配置选择
4. 数据库迁移

### Phase 3: 配置池 UI（依赖 Phase 2）
1. 渠道编辑页配置池表单
2. 运行时统计显示
3. 策略选择器

---

## 四、向后兼容性

### 配置池
- `poolEnabled` 默认为 `false`，不影响现有渠道
- 单配置模式仍使用 `connectorConfig` 字段
- 数据库迁移自动设置默认值

### 日志
- 新日志格式与现有日志兼容
- requestId 仅在新请求中生成
- 旧任务记录的 requestId/timeline 为 null
