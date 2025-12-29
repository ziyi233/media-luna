/**
 * Media Luna 共享图标
 * SVG 路径数据，可在任何组件中通过 createIcon 函数使用
 */
import { h } from 'vue'

/** 图标路径常量 */
export const iconPaths = {
  /** 生成 - 星星/魔法棒 */
  generate: 'M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2 6.4 4.5 5 7zM19 2l-2.5 1.4L14 2l1.4 2.5L14 7l2.5-1.4L19 7l-1.4-2.5zm-5.6 5.4L9 12l4.4 4.6L17.8 12zM2 13l2.5 1.4L6 17l1.4-2.5L10 13 7.5 11.6 6 9l-1.4 2.5z',

  /** 渠道 - 链接 */
  channels: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',

  /** 预设 - 书签 */
  presets: 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z',

  /** 任务 - 剪贴板 */
  tasks: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',

  /** 设置 - 齿轮 */
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',

  /** 帮助 - 问号圆圈 */
  help: 'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z',

  /** 更新 - 向上箭头 */
  update: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
} as const

/** 图标名称类型 */
export type IconName = keyof typeof iconPaths

/**
 * 创建 SVG 图标组件
 * @param pathData SVG path 的 d 属性值
 * @returns Vue 函数式组件
 */
export const createIcon = (pathData: string) => {
  return () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
    h('path', { d: pathData })
  ])
}

/**
 * 获取图标组件
 * @param name 图标名称
 * @returns Vue 函数式组件
 */
export const getIcon = (name: IconName) => {
  return createIcon(iconPaths[name])
}

/** 预定义的图标组件 */
export const icons = {
  generate: createIcon(iconPaths.generate),
  channels: createIcon(iconPaths.channels),
  presets: createIcon(iconPaths.presets),
  tasks: createIcon(iconPaths.tasks),
  settings: createIcon(iconPaths.settings),
  help: createIcon(iconPaths.help),
  update: createIcon(iconPaths.update),
} as const
