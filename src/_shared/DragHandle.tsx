/**
 * DragHandle — Spotlight 浮层 / MarketView 顶部的可拖动区域。
 *
 * macOS 浮层窗口没有原生 title bar, 需要一个明确的区域 + 视觉抓手让用户知道
 * "这里可以拖"。之前是 4px 渐变线, 几乎点不到。
 *
 * 设计:
 *   - 高度 28px, 渐变背景(跟现有玻璃态统一)
 *   - 左侧 HolderOutlined icon(3 条横线, 经典 drag affordance)
 *   - 中间可选 children(如 Spotlight 标题、MarketView 标题)
 *   - 整条 -webkit-app-region: drag, 内部交互元素用 data-no-drag 排除
 *   - hover/active 状态: 抓手指针 + 渐变更明显
 *
 * 用法:
 *   <DragHandle>
 *     <Input data-no-drag ... />   ← 搜索框不参与拖动, 但在 handle 内
 *     <Button data-no-drag>关闭</Button>
 *   </DragHandle>
 */

import type { ReactNode } from "react";
import { HolderOutlined } from "@ant-design/icons";

export interface DragHandleProps {
  children?: ReactNode;
  /** 右侧 slot (close / pin / 等等), 这些元素会自动 no-drag */
  right?: ReactNode;
  /** 左侧 icon 是否显示, 默认 true */
  showGrip?: boolean;
  /** 背景透明(让父级背景透出), 默认 false(自带渐变) */
  transparent?: boolean;
  /** 自定义高度, 默认 32 */
  height?: number;
}

export function DragHandle({
  children,
  right,
  showGrip = true,
  transparent = false,
  height = 32,
}: DragHandleProps) {
  return (
    <div
      data-tauri-drag-region
      style={{
        height,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 8px 0 10px",
        background: transparent
          ? "transparent"
          : "linear-gradient(180deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.03) 100%)",
        borderBottom: "1px solid var(--ant-color-border-secondary)",
        cursor: "grab",
        userSelect: "none",
      }}
      title="按住拖动窗口"
    >
      {showGrip && (
        <HolderOutlined
          className="zBizDragHandleGrip"
          style={{
            fontSize: 14,
            color: "var(--ant-color-text-tertiary)",
            opacity: 0.7,
            flexShrink: 0,
            cursor: "grab",
            transition: "opacity 0.16s, color 0.16s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
            (e.currentTarget as HTMLElement).style.color = "var(--ant-color-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "0.7";
            (e.currentTarget as HTMLElement).style.color = "var(--ant-color-text-tertiary)";
          }}
        />
      )}
      <div
        data-tauri-drag-region
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}
      >
        {children}
      </div>
      {right && (
        <div data-no-drag style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {right}
        </div>
      )}
    </div>
  );
}
