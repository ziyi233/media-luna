# Media Luna

> 本项目纯 Vibe Coding 生成，感谢 Claude 大力支持。

中间件驱动的多媒体生成插件，支持多种 AI 图像生成服务和 WebUI 管理。

## 功能特性

- **多连接器支持**：DALL-E、Stable Diffusion WebUI、Flux、通用 Chat API 等
- **预设系统**：创建和管理提示词模板，支持远程同步
- **中间件管道**：灵活的请求处理流程，支持计费、缓存、翻译等
- **WebUI 管理**：通过 Koishi Console 进行可视化配置
- **任务记录**：完整的生成历史和统计

## 安装

```bash
# 通过 Koishi 插件市场安装
# 或手动安装
npm install koishi-plugin-media-luna
```

## 快速开始

> **首次使用必读**：请按照以下步骤依次配置，确保每一步都正确完成。

### 第一步：配置缓存存储（重要！）

进入 Media Luna 设置页面 → 插件 → cache，配置存储后端：

**⚠️ 关键配置**：必须确保 `publicBaseUrl`（公开访问地址）配置正确，否则预设图片和生成结果无法正常显示。

**推荐使用 MinIO（S3 兼容存储）**：

> ⚠️ **MinIO 版本要求**：请使用 `RELEASE.2025-04-22T22-12-26Z` 或**更早**的版本。后续社区版阉割了部分webui功能。
>
> ⚠️ **Bucket 必须设为公开**：在 MinIO 控制台创建 Bucket 后，需要将其 Access Policy 设置为 `public`，否则生成的图片链接无法被用户访问。

```bash
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=your-password \
  -v /data/minio:/data \
  quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z \
  server /data --console-address ":9001"
```

**MinIO 配置步骤**：

1. 访问 MinIO 控制台 `http://your-server:9001`
2. 创建 Bucket（如 `media-luna`）
3. **重要**：点击 Bucket → Access → 将 Access Policy 设置为 `public`
4. 在 cache 插件中配置：
- `backend`: `s3`
- `s3Endpoint`: `http://your-server:9000`
- `s3AccessKeyId`: `admin`
- `s3SecretAccessKey`: `your-password`
- `s3Bucket`: `media-luna`（需先在 MinIO 控制台创建）
- `s3PublicBaseUrl`: `http://your-server:9000/media-luna`
- `s3ForcePathStyle`: `true`（MinIO 必须开启）

**其他存储方式**：

- **本地存储**：如果 Koishi 部署在本地，可使用默认配置
- **服务器部署**：必须配置 `publicBaseUrl` 为外网可访问的地址
  - 例如：`https://your-domain.com/media-luna/cache`
- **WebDAV**：配置 `webdavPublicBaseUrl`

**验证方法**：配置完成后，在浏览器访问公开访问地址，确认能正常访问。

### 第二步：启用预设自动同步

进入 设置 → 插件 → preset，开启远程预设同步：

1. 确认 `apiUrl` 配置正确（默认已配置）
2. 开启 `autoSync`（自动同步）
3. 点击「同步预设」按钮拉取远程预设

同步成功后，在「预设」页面可以看到大量可用的预设模板。

### 第三步：创建渠道

在「渠道」页面创建新渠道：

1. 填写渠道名称（如 `dalle`、`sd`）—— 这将作为指令触发词
2. 选择连接器
3. 配置连接器参数（API Key、模型等）
4. 添加标签（用于预设匹配）

### 第四步：开始使用

在聊天中使用渠道名作为指令：

```
bnn 一只可爱的猫咪
```

或通过 WebUI 的「生成」页面直接生成。

## 指令使用说明

### 查询指令

| 指令 | 说明 |
|------|------|
| `models` | 查看所有可用模型名 |
| `presets` | 查看所有预设名 |
| `preset <预设名>` | 查看具体预设内容 |
| `loras` | 查看已挑选的 LoRA 列表 |
| `mytasks` | 查看我的任务列表 |
| `taskinfo <id>` | 查看任务详情 |

### 基础用法

**格式：** `渠道名 [预设名] 文字 [图片...]`

1. **完整指定**：`渠道名 预设名 文字 【图片1】【图片2】`
   - 附带 2 张或以上图片时直接触发画图

2. **省略预设**：`渠道名 文字 【图片1】【图片2】`
   - 无需指定预设也能触发（文字不能正好等于预设名）

3. **收集模式**：`渠道名 预设名 文字 【图片1】`
   - 图片少于 2 张时进入收集模式
   - 收集接下来的消息，用户发送「开始」触发画图

4. **引用消息**：引用消息发指令时，被引用的消息和引用消息视为一条消息，遵循上述规则

### 高级用法

1. **@用户**：所有 @ 会被替换为对应用户的头像

2. **LoRA 指定**：模型 `qwen image` 和 `z-image` 系列支持使用 `#lora名#` 指定 LoRA
   - 格式：`#xx/xxxx#`
   - 可用 LoRA 列表：[ModelScope](https://www.modelscope.cn/models?tabKey=other&baseModel=adapter:MusePublic/Qwen-image)（约 8000+ 个）

3. **提示词润色**：在提示词中包含「润色」，会自动调用 AI 模型优化提示词
   - 仅 `qwen image` 和 `z-image` 系列支持

4. **分辨率指定**：在提示词中包含分辨率相关词汇
   - 支持格式：`1024x1024`、`9:16`、`横屏`、`竖屏` 等
   - 注意：并非所有模型都支持此功能

5. **视频生成参数**：视频连接器会按实际能力注册统一选项
   - `-t, --duration, --time <秒>`：视频时长，三个名称指向同一参数
   - `-r, --resolution <分辨率>`、`-a, --aspect-ratio <比例>`、`--fps`、`--seed`、`--steps`、`--cfg`
   - 不同连接器只显示并接收自身支持的参数，单次指令参数优先于渠道配置

## 配置说明

### 全局配置 vs 渠道配置

Media Luna 支持两级配置：

- **全局配置**：在「设置」页面配置，对所有渠道生效
- **渠道配置**：在渠道编辑页面的「插件覆盖」中配置，仅对该渠道生效，会覆盖全局配置

例如：计费插件的 `cost`（费用）可以在全局设置默认值，然后在特定渠道覆盖为不同的价格。

### 插件配置

在 Koishi 插件配置页面可以设置：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| logLevel | 日志级别 | info |

### 计费插件 (billing)

配置路径：设置 → 插件 → billing

| 配置项 | 说明 | 默认值 | 可渠道覆盖 |
|--------|------|--------|------------|
| tableName | 数据库表名 | `monetary` | 否 |
| userIdField | 用户 ID 字段名 | `uid` | 否 |
| balanceField | 余额字段名 | `value` | 否 |
| currencyField | 货币类型字段名 | `currency` | 否 |
| currencyLabel | 货币显示名称 | `积分` | 否 |
| refundOnFail | 失败自动退款 | `true` | 否 |
| cost | 单次费用 | `0` | **是** |
| currencyValue | 货币类型值 | `default` | **是** |

**货币系统说明**：
- 默认使用 `monetary` 表（koishi-plugin-monetary 插件的表）
- 可通过 `tableName`、`userIdField`、`balanceField` 自定义对接其他货币系统
- `currencyField` 留空表示不区分货币类型

**提示模板变量**：`{cost}` 费用、`{balance}` 余额、`{label}` 货币名称、`{error}` 错误信息

### 缓存插件 (cache)

配置路径：设置 → 插件 → cache

> **⚠️ 重要提示**：这是首次配置必须正确设置的插件！
>
> `publicBaseUrl`（或 S3/WebDAV 的公开访问地址）必须配置为**用户可访问**的地址，否则：
> - 预设的缩略图无法显示
> - 生成的图片无法发送给用户
> - 参考图片无法正常加载

支持多种存储后端：

| 后端 | 说明 |
|------|------|
| `local` | 本地文件存储（默认） |
| `s3` | S3 兼容存储（AWS S3、MinIO、阿里云 OSS 等） |
| `webdav` | WebDAV 存储 |
| `none` | 禁用缓存 |

**本地存储配置**：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| cacheDir | 缓存目录 | `data/media-luna/cache` |
| publicPath | HTTP 路由路径 | `/media-luna/cache` |
| **publicBaseUrl** | **外部访问地址（必须配置！）** | 自动检测 |
| maxCacheSize | 最大缓存大小 (MB) | `500` |
| maxFileSize | 单文件限制 (MB) | `50` |
| expireDays | 过期天数 (0=永不) | `30` |

**publicBaseUrl 配置示例**：
- 本地开发：`http://localhost:5140/media-luna/cache`
- 服务器部署：`https://your-domain.com/media-luna/cache`
- 使用反向代理：确保代理路径正确转发

**S3 存储配置**：

| 配置项 | 说明 |
|--------|------|
| s3Endpoint | S3 端点地址 |
| s3Region | 区域 |
| s3AccessKeyId | Access Key ID |
| s3SecretAccessKey | Secret Access Key |
| s3Bucket | Bucket 名称 |
| **s3PublicBaseUrl** | **CDN/公开访问 URL（必须配置！）** |
| s3ForcePathStyle | 强制路径风格（MinIO 需开启） |

**WebDAV 存储配置**：

| 配置项 | 说明 |
|--------|------|
| webdavEndpoint | WebDAV 端点 |
| webdavUsername | 用户名 |
| webdavPassword | 密码 |
| webdavBasePath | 基础路径 |
| webdavPublicBaseUrl | 公开访问 URL |

### 预设插件 (preset)

配置路径：设置 → 插件 → preset

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| enabled | 启用预设处理 | `true` |
| defaultPreset | 默认预设名 | 空 |
| apiUrl | 远程预设 API | `https://prompt.vioaki.xyz/api/templates?per_page=-1` |
| autoSync | 自动同步 | `false` |
| syncInterval | 同步间隔（分钟） | `60` |
| deleteRemoved | 删除远程已移除的预设 | `false` |

### 任务记录插件 (task)

配置路径：设置 → 插件 → task

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| enabled | 启用任务记录 | `true` |
| autoCleanup | 自动清理过期记录 | `false` |
| retentionDays | 保留天数 | `30` |

### 指令插件 (koishi-commands)

配置路径：设置 → 插件 → koishi-commands

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| enabled | 启用聊天指令 | `true` |
| collectTimeout | 收集模式超时（秒） | `120` |
| directTriggerImageCount | 直接触发所需最小图片数 | `2` |
| videoDeliveryMode | 视频发送方式：合并转发、直接发送或自动判断平台 | `forward` |

### 连接器配置

各连接器在「设置 → 插件」中配置，主要参数：

| 连接器 | 必填参数 | 说明 |
|--------|----------|------|
| DALL-E | apiUrl, apiKey, model | OpenAI DALL-E |
| SD WebUI | apiUrl | 本地 SD WebUI |
| Flux | apiUrl, apiKey | Replicate Flux |
| Chat API | apiUrl, apiKey, model | OpenAI 兼容 API |
| Gemini | apiUrl, apiKey, model | Google Gemini |
| ChatLuna | model | 需安装 chatluna 插件 |
| Midjourney | apiUrl, apiKey | MJ Proxy 服务 |
| Stability | apiKey, model | Stability AI |
| ComfyUI | apiUrl | ComfyUI 服务 |
| 豆包 | apiUrl, apiKey, model | 火山引擎 Seedream |
| Suno | apiUrl, apiKey | Suno AI 音乐 |
| OpenAI Video | apiUrl, apiKey, model | OpenAI 视频生成，支持可选参考图 |
| Runway | apiUrl, apiKey, model | Runway 视频 |
| xAI Grok Imagine Video | apiUrl, apiKey, model | 文生、图生、参考图、编辑与续写视频 |

视频指令参数、xAI 模式和投递策略详见 [视频连接器文档](docs/video-connectors.md)。

## WebUI 页面

| 页面 | 功能 |
|------|------|
| 生成 | 直接在浏览器中生成图片 |
| 渠道 | 管理生成渠道配置 |
| 预设 | 管理提示词预设模板 |
| 任务 | 查看生成历史和统计 |
| 设置 | 全局设置和插件配置 |


## 文档

更多详细文档请查看 [docs/](./docs/) 目录：

- [架构文档](./docs/architecture.md) - 插件架构和 API 参考
- [WebUI 开发文档](./docs/webui.md) - 前端开发指南

## License

MIT
