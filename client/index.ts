import { Context, icons } from '@koishijs/client'
import type { } from 'koishi-plugin-media-luna'

import Index from './pages/index.vue'
import LunaCrescent from './icons/luna-crescent.vue'
import { iconPaths, createIcon } from './icons'

// 注册自定义图标（使用项目自带的 SVG 路径，保证任意组件可安全引用）
icons.register('luna-crescent', LunaCrescent)
for (const [name, pathData] of Object.entries(iconPaths)) {
  icons.register(name, createIcon(pathData))
}

export default (ctx: Context) => {
  ctx.page({
    name: 'Media Luna',
    path: '/media-luna',
    icon: 'luna-crescent',
    component: Index,
    order: 500,
    authority: 3
  })
}
