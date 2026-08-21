/**
 * 薄壳: 保留旧 API 以兼容所有 import,真实数据从 _registry 自动生成。
 * 新代码请直接 import 自 src/plugins/_registry。
 */
export { ALL_TOOLS, TOOL_GROUPS, getTool, getGroupOfTool, searchTools } from "./plugins/_registry";
export type { ToolMeta, ToolGroup, PluginMeta } from "./plugins/_types";
