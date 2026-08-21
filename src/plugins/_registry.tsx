/**
 * Plugin Registry — 单一注册点。
 *
 * 新增插件只需:
 *   1. 在 src/plugins/{group}/ 下创建 Foo.tsx
 *   2. export default FooComponent
 *   3. export const meta: PluginMeta = { key, label, description, icon }
 *   4. 完成 — group 自动从路径识别,render 由这里注入
 *
 * 无需修改 App.tsx / tools.tsx / 任何 switch-case。
 */
import type { ComponentType } from "react";
import {
  CodeOutlined,
  FileTextOutlined,
  LockOutlined,
  SwapOutlined,
  GlobalOutlined,
  DesktopOutlined,
  AppstoreOutlined,
  LinkOutlined,
  Html5Outlined,
  FieldNumberOutlined as HexagonOutlined,
  KeyOutlined,
  DatabaseOutlined,
  DiffOutlined,
  FontSizeOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  BarChartOutlined,
  RetweetOutlined,
  FileOutlined,
  ApiOutlined,
  SafetyCertificateOutlined,
  IdcardOutlined,
  BgColorsOutlined,
  NumberOutlined,
  ColumnHeightOutlined as ScaleOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  SnippetsOutlined,
  FontColorsOutlined,
  TagsOutlined,
  HistoryOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import type { PluginMeta, ToolGroup, ToolMeta } from "./_types";

// 排除 registry 自身,只收集真正的 plugin 文件
const modules = import.meta.glob<{ default: ComponentType; meta: PluginMeta }>(
  ["./encoding/*.tsx", "./text/*.tsx", "./crypto/*.tsx", "./convert/*.tsx", "./network/*.tsx", "./system/*.tsx"],
  { eager: true }
);

// ============ Group 定义(集中管理分组标签+图标) ============

const GROUP_DEFS: Record<string, { label: string; icon: React.ReactNode; order: number }> = {
  encoding: { label: "编码", icon: <CodeOutlined />, order: 1 },
  text: { label: "文本", icon: <FileTextOutlined />, order: 2 },
  crypto: { label: "加密", icon: <LockOutlined />, order: 3 },
  convert: { label: "转换", icon: <SwapOutlined />, order: 4 },
  network: { label: "网络", icon: <GlobalOutlined />, order: 5 },
  system: { label: "系统", icon: <DesktopOutlined />, order: 6 },
};

// ============ Icon 字符串 → ReactNode 全局映射 ============

const ICON_MAP: Record<string, React.ReactNode> = {
  code: <CodeOutlined />,
  text: <FileTextOutlined />,
  lock: <LockOutlined />,
  swap: <SwapOutlined />,
  globe: <GlobalOutlined />,
  desktop: <DesktopOutlined />,
  appstore: <AppstoreOutlined />,
  link: <LinkOutlined />,
  html: <Html5Outlined />,
  hex: <HexagonOutlined />,
  key: <KeyOutlined />,
  database: <DatabaseOutlined />,
  diff: <DiffOutlined />,
  font: <FontSizeOutlined />,
  fontcolors: <FontColorsOutlined />,
  filter: <FilterOutlined />,
  sort: <SortAscendingOutlined />,
  chart: <BarChartOutlined />,
  retweet: <RetweetOutlined />,
  file: <FileOutlined />,
  api: <ApiOutlined />,
  shield: <SafetyCertificateOutlined />,
  id: <IdcardOutlined />,
  color: <BgColorsOutlined />,
  number: <NumberOutlined />,
  scale: <ScaleOutlined />,
  dollar: <DollarOutlined />,
  clock: <ClockCircleOutlined />,
  thunder: <ThunderboltOutlined />,
  snippets: <SnippetsOutlined />,
  tags: <TagsOutlined />,
  history: <HistoryOutlined />,
  tool: <ToolOutlined />,
};

// ============ 收集所有 plugin meta,组装成 ToolMeta[] ============

function deriveGroupFromPath(path: string): string {
  // ./encoding/Base64Tool.tsx -> "encoding"
  const m = path.match(/^\.\/([^/]+)\//);
  return m ? m[1] : "system";
}

const collected: ToolMeta[] = [];

for (const [path, mod] of Object.entries(modules)) {
  if (!mod.meta || !mod.default) continue;
  const groupKey = deriveGroupFromPath(path);
  const groupDef = GROUP_DEFS[groupKey];
  if (!groupDef) {
    console.warn(`[plugin-registry] unknown group "${groupKey}" for ${path}`);
    continue;
  }
  const iconNode = ICON_MAP[mod.meta.icon as string] ?? <ToolOutlined />;
  collected.push({
    ...mod.meta,
    group: groupKey,
    groupLabel: groupDef.label,
    icon: iconNode,
    render: () => {
      const Comp = mod.default;
      return <Comp />;
    },
  });
}

// 排序:先按 order 升序,再按 label 升序
collected.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label, "zh-Hans-CN"));

export const ALL_TOOLS: ToolMeta[] = collected;

// ============ 派生 TOOL_GROUPS ============

export const TOOL_GROUPS: ToolGroup[] = Object.entries(GROUP_DEFS)
  .sort(([, a], [, b]) => a.order - b.order)
  .map(([key, def]) => ({
    key,
    label: def.label,
    icon: def.icon,
    tools: ALL_TOOLS.filter((t) => t.group === key),
  }))
  .filter((g) => g.tools.length > 0);

// ============ 查询辅助函数 ============

const TOOL_MAP = new Map(ALL_TOOLS.map((t) => [t.key, t]));
const TOOL_GROUP_MAP = new Map<string, ToolGroup>();
for (const g of TOOL_GROUPS) for (const t of g.tools) TOOL_GROUP_MAP.set(t.key, g);

export function getTool(key: string): ToolMeta | undefined {
  return TOOL_MAP.get(key);
}

export function getGroupOfTool(key: string): ToolGroup | undefined {
  return TOOL_GROUP_MAP.get(key);
}

/** 模糊匹配:label/description/keywords 含 query(不区分大小写,空格分词 AND) */
export function searchTools(query: string): ToolMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_TOOLS;
  const words = q.split(/\s+/).filter(Boolean);
  return ALL_TOOLS.filter((t) => {
    const hay = `${t.label} ${t.description} ${t.keywords ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
