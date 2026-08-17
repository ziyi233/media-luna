# 视频连接器与指令参数

视频连接器可以声明自己实际支持的 Koishi 指令参数，渠道指令只注册这些选项。

## 统一参数

| 参数 | 含义 |
| --- | --- |
| `--mode <mode>` | 生成模式 |
| `-t, --duration, --time <秒>` | 视频时长，三个写法完全等价 |
| `-r, --resolution <值>` | 输出分辨率或尺寸 |
| `-a, --aspect-ratio <值>` | 输出宽高比 |
| `-f, --fps <值>` | 帧率 |
| `--seed <值>` | 随机种子 |
| `-s, --steps <值>` | 推理步数 |
| `-c, --cfg <值>` | CFG |
| `-d, --denoise <值>` | 重绘幅度 |
| `-m, --motion <值>` | 运动幅度 |
| `--negative-prompt <文本>` | 负面提示词 |

实际选项由渠道所选连接器决定。指令参数优先于渠道配置；时长中间件依次读取指令参数、提示词时长、渠道默认时长以及帧数/帧率。

## xAI Grok Imagine Video

选择“xAI Grok Imagine Video”连接器并配置 API 密钥。默认模型为 `grok-imagine-video`。

- `auto`：无素材时文生视频；一张图片时图生视频；2-7 张图片时参考图生成。
- `text`：文生视频。
- `image`：需要一张图片；未显式传入宽高比时沿用图片比例。
- `reference`：需要 1-7 张图片，最高 720p。
- `edit`：需要一个 MP4 视频；时长、分辨率和宽高比沿用输入视频。
- `extend`：需要一个 MP4 视频；宽高比和分辨率沿用输入视频，续写时长为 2-10 秒。

视频输入在自动模式下不会被猜测为编辑或续写，必须使用 `--mode edit` 或 `--mode extend`，也可以在渠道配置中固定默认模式。

```text
grok 一座城市在雨中苏醒 -t 8 -r 720p -a 16:9
grok --mode reference 保持人物一致，缓慢转身 <参考图1> <参考图2>
grok --mode edit 将天气改为下雪 <输入视频>
grok --mode extend 镜头继续向前推进 --time 6 <输入视频>
```

xAI 返回临时视频地址。建议启用 cache 插件，让结果在发送前转存到本地、S3 或 WebDAV；缓存下载使用 Koishi HTTP 客户端，会继承代理配置。

## 视频发送方式

`koishi-commands` 的 `videoDeliveryMode` 支持：

- `forward`：合并转发，默认值，与原版行为一致。
- `direct`：直接发送视频。
- `auto`：OneBot、QQ、Red 直接发送，其他平台合并转发。

## 其他连接器

- OpenAI Video 使用官方 multipart 请求，并通过 `input_reference` 上传参考图；支持 duration 与 resolution。
- Runway 使用官方 `text_to_video`、`image_to_video` 和任务轮询接口；支持模式、时长、比例/分辨率和种子覆盖。
- Agnes Video、NewAPI Video 与 ComfyUI 已接入统一参数名。
