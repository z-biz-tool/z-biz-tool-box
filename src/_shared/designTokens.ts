/**
 * 设计 Token — 集中管理颜色/间距/圆角/阴影/动画。
 * 避免在 200+ 处 inline style 写魔法数字, 保证视觉一致。
 *
 * 使用方式:
 *   import { tokens } from "./_shared/designTokens";
 *   <div style={{ borderRadius: tokens.radius.lg, padding: tokens.space[3] }}>
 */

// ============ 间距(8 倍数) ============
export const space = {
  0: "0",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  7: "32px",
  8: "40px",
  9: "48px",
} as const;

// ============ 圆角 ============
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

// ============ 字号 ============
export const fontSize = {
  xs: 10,
  sm: 11,
  md: 13,
  lg: 14,
  xl: 16,
  xxl: 20,
  display: 28,
} as const;

// ============ 阴影 ============
export const shadow = {
  // 浮层本身: macOS Sonoma+ 风格
  floating:
    "0 0 0 1px rgba(0,0,0,0.04), 0 20px 60px -12px rgba(0,0,0,0.32), 0 8px 20px -8px rgba(0,0,0,0.12)",
  // 浮层亮色模式
  floatingLight:
    "0 0 0 1px rgba(0,0,0,0.06), 0 24px 64px -16px rgba(0,0,0,0.18), 0 4px 12px -4px rgba(0,0,0,0.08)",
  // 卡片 hover
  cardHover:
    "0 8px 24px -4px rgba(0,0,0,0.18), 0 2px 8px -2px rgba(0,0,0,0.08)",
  // 选中行
  selected: "0 4px 12px -2px rgba(22,119,255,0.32)",
  // 搜索框 focus
  focusRing: "0 0 0 3px rgba(22,119,255,0.16)",
} as const;

// ============ 渐变(品牌色点缀) ============
export const gradient = {
  // 顶栏品牌渐变 (蓝紫色)
  brand: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
  // 浅色品牌渐变
  brandSoft: "linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)",
  // 精选卡渐变
  primary: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)",
  warm: "linear-gradient(135deg, #f97316 0%, #ec4899 100%)",
  cool: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
  nature: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)",
  sunset: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
  ocean: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
  candy: "linear-gradient(135deg, #ec4899 0%, #f472b6 50%, #c084fc 100%)",
  // 玻璃态背景 (顶层 + 底层)
  glassTop: "linear-gradient(180deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.4) 100%)",
  glassBottom: "linear-gradient(180deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.35) 100%)",
  glassTopDark: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.0) 100%)",
  glassBottomDark: "linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.4) 100%)",
} as const;

// ============ 动画 ============
export const motion = {
  fast: "0.1s cubic-bezier(0.4, 0, 0.2, 1)",
  base: "0.16s cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "0.24s cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "0.32s cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

// ============ 尺寸 ============
export const size = {
  // 浮层
  floatingWidth: 1100,
  floatingHeight: 680,
  // 侧栏
  navWidth: 180,
  categoryWidth: 200,
  // 搜索框
  searchHeight: 40,
  // 浮层圆角
  floatingRadius: 16,
} as const;

// ============ 透明度/层级 ============
export const layer = {
  floating: 100,
  modal: 1000,
  tooltip: 1100,
  highlight: 1200,
} as const;

// ============ 工具函数 ============

/** 玻璃态背景 — 自动根据明暗主题适配 */
export function glassBackground(isDark: boolean): string {
  return isDark ? gradient.glassTopDark : gradient.glassTop;
}

/** 卡片背景 — 浮层内普通卡片 */
export function cardBackground(isDark: boolean): string {
  return isDark
    ? "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)"
    : "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(248,250,255,0.65) 100%)";
}

/** hover 背景 — 列表行 hover */
export function hoverBackground(isDark: boolean): string {
  return isDark
    ? "linear-gradient(90deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.08) 100%)"
    : "linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.04) 100%)";
}

/** active 背景 — 列表行选中 */
export function activeBackground(isDark: boolean): string {
  return isDark
    ? "linear-gradient(90deg, rgba(99,102,241,0.32) 0%, rgba(139,92,246,0.18) 100%)"
    : "linear-gradient(90deg, rgba(99,102,241,0.16) 0%, rgba(139,92,246,0.08) 100%)";
}

/** 主色文字 (亮 / 暗) */
export function primaryText(isDark: boolean): string {
  return isDark ? "#a5b4fc" : "#4f46e5";
}

// 默认 tokens 集合, 一次性 import
export const tokens = {
  space,
  radius,
  fontSize,
  shadow,
  gradient,
  motion,
  size,
  layer,
} as const;
