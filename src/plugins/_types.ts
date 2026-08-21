/// <reference types="vite/client" />
import type { ComponentType, ReactNode } from "react";

/**
 * Plugin 自描述元数据 — 每个 plugin 文件必须 export `meta`。
 * group/iconNode/render 由 _registry.tsx 注入,这里只关心内容描述。
 */
export interface PluginMeta {
  /** 唯一 key,侧边栏/路由/收藏都用这个 */
  key: string;
  /** 中文显示名 */
  label: string;
  /** 一句话描述(用于搜索/列表) */
  description: string;
  /** 关键词,空格分隔,用于 ⌘K 模糊搜索(可选,默认从 label+description 派生) */
  keywords?: string;
  /** 排序权重,数字越小越靠前(可选,默认按注册顺序) */
  order?: number;
  /**
   * 图标 key,对应 _registry.tsx 里的 ICON_MAP 全局映射。
   * 找不到时 fallback 到 ToolOutlined。
   */
  icon: string;
}

export interface ToolMeta extends Omit<PluginMeta, "icon"> {
  /** 所属分组 key */
  group: string;
  /** 分组显示名 */
  groupLabel: string;
  /** 已渲染的图标节点 */
  icon: ReactNode;
  /** 渲染组件 */
  render: () => ReactNode;
}

export interface ToolGroup {
  key: string;
  label: string;
  icon: ReactNode;
  tools: ToolMeta[];
}

export type PluginComponent = ComponentType & { meta?: PluginMeta };
