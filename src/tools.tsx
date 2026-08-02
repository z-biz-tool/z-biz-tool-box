import type { ReactNode } from "react";
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
} from "@ant-design/icons";

import Base64Tool from "./plugins/encoding/Base64Tool";
import UrlTool from "./plugins/encoding/UrlTool";
import HtmlEntityTool from "./plugins/encoding/HtmlEntityTool";
import HexTool from "./plugins/encoding/HexTool";
import HashTool from "./plugins/encoding/HashTool";

import JsonTool from "./plugins/text/JsonTool";
import DiffTool from "./plugins/text/DiffTool";
import CaseTool from "./plugins/text/CaseTool";
import DedupTool from "./plugins/text/DedupTool";
import SortTool from "./plugins/text/SortTool";
import WordCountTool from "./plugins/text/WordCountTool";
import ReverseTool from "./plugins/text/ReverseTool";
import LoremTool from "./plugins/text/LoremTool";

import JwtDecoder from "./plugins/crypto/JwtDecoder";
import PasswordGen from "./plugins/crypto/PasswordGen";
import PasswordStrength from "./plugins/crypto/PasswordStrength";
import UuidTool from "./plugins/crypto/UuidTool";

import ColorTool from "./plugins/convert/ColorTool";
import NumberBaseTool from "./plugins/convert/NumberBaseTool";
import UnitConverter from "./plugins/convert/UnitConverter";
import ExchangeRate from "./plugins/convert/ExchangeRate";
import CronParser from "./plugins/convert/CronParser";
import TimestampTool from "./plugins/convert/TimestampTool";

import HttpTester from "./plugins/network/HttpTester";
import IpTool from "./plugins/network/IpTool";

import ClipboardTool from "./plugins/system/ClipboardTool";
import PluginMarket from "./plugins/system/PluginMarket";

export interface ToolMeta {
  key: string;
  label: string;
  description: string;
  icon: ReactNode;
  render: () => ReactNode;
}

export interface ToolGroup {
  key: string;
  label: string;
  icon: ReactNode;
  tools: ToolMeta[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    key: "encoding",
    label: "编码",
    icon: <CodeOutlined />,
    tools: [
      {
        key: "base64",
        label: "Base64",
        description: "Base64 编码与解码",
        icon: <CodeOutlined />,
        render: () => <Base64Tool />,
      },
      {
        key: "url",
        label: "URL 编解码",
        description: "URL/URI 编码与解码",
        icon: <LinkOutlined />,
        render: () => <UrlTool />,
      },
      {
        key: "html-entity",
        label: "HTML 实体",
        description: "HTML 实体编码与解码",
        icon: <Html5Outlined />,
        render: () => <HtmlEntityTool />,
      },
      {
        key: "hex",
        label: "Hex 编解码",
        description: "十六进制编码与解码",
        icon: <HexagonOutlined />,
        render: () => <HexTool />,
      },
      {
        key: "hash",
        label: "哈希计算",
        description: "MD5/SHA 哈希摘要计算",
        icon: <KeyOutlined />,
        render: () => <HashTool />,
      },
    ],
  },
  {
    key: "text",
    label: "文本",
    icon: <FileTextOutlined />,
    tools: [
      {
        key: "json",
        label: "JSON 工具",
        description: "JSON 格式化与校验",
        icon: <DatabaseOutlined />,
        render: () => <JsonTool />,
      },
      {
        key: "diff",
        label: "文本对比",
        description: "文本差异对比 Diff",
        icon: <DiffOutlined />,
        render: () => <DiffTool />,
      },
      {
        key: "case",
        label: "大小写转换",
        description: "文本大小写互转",
        icon: <FontSizeOutlined />,
        render: () => <CaseTool />,
      },
      {
        key: "dedup",
        label: "文本去重",
        description: "按行去重去空",
        icon: <FilterOutlined />,
        render: () => <DedupTool />,
      },
      {
        key: "sort",
        label: "文本排序",
        description: "按行升序降序排序",
        icon: <SortAscendingOutlined />,
        render: () => <SortTool />,
      },
      {
        key: "wordcount",
        label: "字数统计",
        description: "字数/字符数统计",
        icon: <BarChartOutlined />,
        render: () => <WordCountTool />,
      },
      {
        key: "reverse",
        label: "文本翻转",
        description: "文本顺序反转",
        icon: <RetweetOutlined />,
        render: () => <ReverseTool />,
      },
      {
        key: "lorem",
        label: "Lorem 生成",
        description: "Lorem Ipsum 占位文本",
        icon: <FileOutlined />,
        render: () => <LoremTool />,
      },
    ],
  },
  {
    key: "crypto",
    label: "加密",
    icon: <LockOutlined />,
    tools: [
      {
        key: "jwt",
        label: "JWT 解码",
        description: "JWT Token 解析",
        icon: <ApiOutlined />,
        render: () => <JwtDecoder />,
      },
      {
        key: "pwdgen",
        label: "密码生成",
        description: "随机密码生成器",
        icon: <KeyOutlined />,
        render: () => <PasswordGen />,
      },
      {
        key: "pwdstr",
        label: "密码强度",
        description: "密码强度检测",
        icon: <SafetyCertificateOutlined />,
        render: () => <PasswordStrength />,
      },
      {
        key: "uuid",
        label: "UUID 生成",
        description: "UUID/GUID 生成器",
        icon: <IdcardOutlined />,
        render: () => <UuidTool />,
      },
    ],
  },
  {
    key: "convert",
    label: "转换",
    icon: <SwapOutlined />,
    tools: [
      {
        key: "color",
        label: "颜色转换",
        description: "HEX/RGB/HSL 颜色转换",
        icon: <BgColorsOutlined />,
        render: () => <ColorTool />,
      },
      {
        key: "numberbase",
        label: "进制转换",
        description: "二/八/十/十六进制转换",
        icon: <NumberOutlined />,
        render: () => <NumberBaseTool />,
      },
      {
        key: "unit",
        label: "单位换算",
        description: "长度/重量等单位换算",
        icon: <ScaleOutlined />,
        render: () => <UnitConverter />,
      },
      {
        key: "exchange",
        label: "汇率换算",
        description: "实时汇率换算",
        icon: <DollarOutlined />,
        render: () => <ExchangeRate />,
      },
      {
        key: "cron",
        label: "Cron 解析",
        description: "Cron 表达式解析",
        icon: <ClockCircleOutlined />,
        render: () => <CronParser />,
      },
      {
        key: "timestamp",
        label: "时间戳",
        description: "Unix 时间戳转换",
        icon: <ClockCircleOutlined />,
        render: () => <TimestampTool />,
      },
    ],
  },
  {
    key: "network",
    label: "网络",
    icon: <GlobalOutlined />,
    tools: [
      {
        key: "http",
        label: "HTTP 测试",
        description: "HTTP API 请求测试",
        icon: <ThunderboltOutlined />,
        render: () => <HttpTester />,
      },
      {
        key: "ip",
        label: "IP 工具",
        description: "IP/子网掩码计算",
        icon: <GlobalOutlined />,
        render: () => <IpTool />,
      },
    ],
  },
  {
    key: "system",
    label: "系统",
    icon: <DesktopOutlined />,
    tools: [
      {
        key: "clipboard",
        label: "剪贴板",
        description: "剪贴板历史管理",
        icon: <SnippetsOutlined />,
        render: () => <ClipboardTool />,
      },
      {
        key: "market",
        label: "插件市场",
        description: "插件市场浏览安装",
        icon: <AppstoreOutlined />,
        render: () => <PluginMarket />,
      },
    ],
  },
];

/** 所有工具扁平列表 */
export const ALL_TOOLS: ToolMeta[] = TOOL_GROUPS.flatMap((g) => g.tools);

/** 工具 key -> 元信息 */
const TOOL_MAP = new Map(ALL_TOOLS.map((t) => [t.key, t]));

export function getTool(key: string): ToolMeta | undefined {
  return TOOL_MAP.get(key);
}

/** 工具 key -> 所属分组 */
const TOOL_GROUP_MAP = new Map<string, ToolGroup>();
for (const g of TOOL_GROUPS) {
  for (const t of g.tools) TOOL_GROUP_MAP.set(t.key, g);
}

export function getGroupOfTool(key: string): ToolGroup | undefined {
  return TOOL_GROUP_MAP.get(key);
}

/** 模糊匹配：工具名称或描述包含关键词（不区分大小写），支持多词 AND */
export function searchTools(query: string): ToolMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_TOOLS;
  const words = q.split(/\s+/).filter(Boolean);
  return ALL_TOOLS.filter((t) => {
    const hay = `${t.label} ${t.description}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
