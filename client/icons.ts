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

  /** 复制 */
  copy: 'M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z',

  /** 下载 */
  download: 'M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z',

  /** 刷新 */
  refresh: 'M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z',

  /** 播放 */
  play: 'M8 5.14v14l11-7-11-7z',

  /** 暂停 */
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',

  /** 保存 */
  save: 'M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10z',

  /** 勾选 / 成功 */
  check: 'M21 7L9 19l-5-5 1.41-1.41L9 16.17 19.59 5.59 21 7z',

  /** 警告 */
  warning: 'M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z',

  /** 加载 */
  loader: 'M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2z',

  /** 图片 */
  image: 'M8.5 13.5l2.5 3 3.5-4.5 4.5 6H5m16 1V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z',

  /** 时间 (时钟) */
  time: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM11 7h2v5.6l4.2 2.5-1 1.6L11 13.6V7z',

  /** 列表 */
  sort: 'M3 5h12v2H3zm0 6h12v2H3zm0 6h12v2H3zm14-8l4 4-4 4V9z',
} as const

/** 图标名称类型 */
export type IconName = keyof typeof iconPaths

/**
 * 创建 SVG 图标组件
 * @param pathData SVG path 的 d 属性值
 * @returns Vue 函数式组件
 */
export const createIcon = (pathData: string) => {
  return () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor', width: '1em', height: '1em' }, [
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
  copy: createIcon(iconPaths.copy),
  download: createIcon(iconPaths.download),
  refresh: createIcon(iconPaths.refresh),
  play: createIcon(iconPaths.play),
  pause: createIcon(iconPaths.pause),
  save: createIcon(iconPaths.save),
} as const
