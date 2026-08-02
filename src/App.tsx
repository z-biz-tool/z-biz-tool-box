import { useState } from "react";
import { Layout, Menu, theme, Typography, Tag } from "antd";
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
  SwapOutlined as ReverseOutlined,
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

const { Sider, Content } = Layout;

const menuItems = [
  {
    key: "encoding",
    icon: <CodeOutlined />,
    label: "编码",
    children: [
      { key: "base64", icon: <CodeOutlined />, label: "Base64" },
      { key: "url", icon: <LinkOutlined />, label: "URL 编解码" },
      { key: "html-entity", icon: <Html5Outlined />, label: "HTML 实体" },
      { key: "hex", icon: <HexagonOutlined />, label: "Hex 编解码" },
      { key: "hash", icon: <KeyOutlined />, label: "哈希计算" },
    ],
  },
  {
    key: "text",
    icon: <FileTextOutlined />,
    label: "文本",
    children: [
      { key: "json", icon: <DatabaseOutlined />, label: "JSON 工具" },
      { key: "diff", icon: <DiffOutlined />, label: "文本对比" },
      { key: "case", icon: <FontSizeOutlined />, label: "大小写转换" },
      { key: "dedup", icon: <FilterOutlined />, label: "文本去重" },
      { key: "sort", icon: <SortAscendingOutlined />, label: "文本排序" },
      { key: "wordcount", icon: <BarChartOutlined />, label: "字数统计" },
      { key: "reverse", icon: <ReverseOutlined />, label: "文本翻转" },
      { key: "lorem", icon: <FileOutlined />, label: "Lorem 生成" },
    ],
  },
  {
    key: "crypto",
    icon: <LockOutlined />,
    label: "加密",
    children: [
      { key: "jwt", icon: <ApiOutlined />, label: "JWT 解码" },
      { key: "pwdgen", icon: <KeyOutlined />, label: "密码生成" },
      { key: "pwdstr", icon: <SafetyCertificateOutlined />, label: "密码强度" },
      { key: "uuid", icon: <IdcardOutlined />, label: "UUID 生成" },
    ],
  },
  {
    key: "convert",
    icon: <SwapOutlined />,
    label: "转换",
    children: [
      { key: "color", icon: <BgColorsOutlined />, label: "颜色转换" },
      { key: "numberbase", icon: <NumberOutlined />, label: "进制转换" },
      { key: "unit", icon: <ScaleOutlined />, label: "单位换算" },
      { key: "exchange", icon: <DollarOutlined />, label: "汇率换算" },
      { key: "cron", icon: <ClockCircleOutlined />, label: "Cron 解析" },
      { key: "timestamp", icon: <ClockCircleOutlined />, label: "时间戳" },
    ],
  },
  {
    key: "network",
    icon: <GlobalOutlined />,
    label: "网络",
    children: [
      { key: "http", icon: <ThunderboltOutlined />, label: "HTTP 测试" },
      { key: "ip", icon: <GlobalOutlined />, label: "IP 工具" },
    ],
  },
  {
    key: "system",
    icon: <DesktopOutlined />,
    label: "系统",
    children: [
      { key: "clipboard", icon: <SnippetsOutlined />, label: "剪贴板" },
      { key: "market", icon: <AppstoreOutlined />, label: "插件市场" },
    ],
  },
];

const TOOL_TITLES: Record<string, string> = {
  base64: "Base64 编解码",
  url: "URL 编解码",
  "html-entity": "HTML 实体编解码",
  hex: "Hex 十六进制编解码",
  hash: "哈希计算 (MD5/SHA)",
  json: "JSON 工具",
  diff: "文本 Diff 对比",
  case: "大小写转换",
  dedup: "文本去重",
  sort: "文本排序",
  wordcount: "字数统计",
  reverse: "文本翻转",
  lorem: "Lorem Ipsum 生成器",
  jwt: "JWT 解码器",
  pwdgen: "密码生成器",
  pwdstr: "密码强度检测",
  uuid: "UUID 生成器",
  color: "颜色转换",
  numberbase: "进制转换",
  unit: "单位换算",
  exchange: "汇率换算",
  cron: "Cron 表达式解析",
  timestamp: "时间戳转换",
  http: "HTTP 请求测试",
  ip: "IP / 子网计算器",
  clipboard: "剪贴板工具",
  market: "插件市场",
};

export default function App() {
  const [activePlugin, setActivePlugin] = useState("base64");
  const { token } = theme.useToken();

  const renderPlugin = () => {
    switch (activePlugin) {
      case "base64": return <Base64Tool />;
      case "url": return <UrlTool />;
      case "html-entity": return <HtmlEntityTool />;
      case "hex": return <HexTool />;
      case "hash": return <HashTool />;
      case "json": return <JsonTool />;
      case "diff": return <DiffTool />;
      case "case": return <CaseTool />;
      case "dedup": return <DedupTool />;
      case "sort": return <SortTool />;
      case "wordcount": return <WordCountTool />;
      case "reverse": return <ReverseTool />;
      case "lorem": return <LoremTool />;
      case "jwt": return <JwtDecoder />;
      case "pwdgen": return <PasswordGen />;
      case "pwdstr": return <PasswordStrength />;
      case "uuid": return <UuidTool />;
      case "color": return <ColorTool />;
      case "numberbase": return <NumberBaseTool />;
      case "unit": return <UnitConverter />;
      case "exchange": return <ExchangeRate />;
      case "cron": return <CronParser />;
      case "timestamp": return <TimestampTool />;
      case "http": return <HttpTester />;
      case "ip": return <IpTool />;
      case "clipboard": return <ClipboardTool />;
      case "market": return <PluginMarket />;
      default: return <div>选择一个工具</div>;
    }
  };

  const openKeys = menuItems.map((m) => m.key);

  return (
    <Layout style={{ height: "100vh" }}>
      <Sider width={200} style={{ background: token.colorBgContainer, overflow: "auto" }}>
        <div style={{ padding: "16px", textAlign: "center", fontWeight: 600, fontSize: 16, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          🧰 z-biz-tool-box
        </div>
        <Menu
          mode="inline"
          defaultOpenKeys={openKeys}
          selectedKeys={[activePlugin]}
          items={menuItems}
          onClick={(e) => setActivePlugin(e.key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <div style={{ padding: "12px 24px", background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {TOOL_TITLES[activePlugin] || "工具箱"}
            <Tag color="blue" style={{ marginLeft: 12, fontSize: 12 }}>
              {menuItems.find((m) => m.children?.some((c) => c.key === activePlugin))?.label}
            </Tag>
          </Typography.Title>
        </div>
        <Content style={{ padding: "24px", overflow: "auto", background: token.colorBgLayout }}>
          {renderPlugin()}
        </Content>
      </Layout>
    </Layout>
  );
}
