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
  /**
   * 关键词,空格分隔,用于 ⌘K 模糊搜索(可选)
   * 注: cmds 是更结构化的"命令触发词", 详见 cmds
   */
  keywords?: string;
  /**
   * 命令触发词数组 (类似 utools 的 "Pick Color" / "截图" 双标签)
   * - 第一个通常是英文/拼音短码, 第二个通常是中文
   * - 搜索时 label/description/keywords/cmds 都参与匹配
   * - example: ['base64', 'b64', 'Base64 编解码']
   */
  cmds?: string[];
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
