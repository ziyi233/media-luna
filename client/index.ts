import { Context, icons } from '@koishijs/client'
import type { } from 'koishi-plugin-media-luna'
import './styles/material.css'

import Index from './pages/index.vue'
import LunaCrescent from './icons/luna-crescent.vue'

// 注册自定义图标
icons.register('luna-crescent', LunaCrescent)

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
