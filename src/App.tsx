import { useState } from "react";
import { Menu, Typography, Tag } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { AppShell, ThemeProvider } from "./_shared";
import { TOOL_GROUPS, getTool, getGroupOfTool } from "./tools";

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

export default function App() {
  const [activePlugin, setActivePlugin] = useState("base64");
  const activeTool = getTool(activePlugin);
  const activeGroup = getGroupOfTool(activePlugin);

  const menuItems = TOOL_GROUPS.map((g) => ({
    key: g.key,
    icon: g.icon,
    label: g.label,
    children: g.tools.map((t) => ({ key: t.key, icon: t.icon, label: t.label })),
  }));

  const renderPlugin = () => {
    switch (activePlugin) {
      case "base64":
        return <Base64Tool />;
      case "url":
        return <UrlTool />;
      case "html-entity":
        return <HtmlEntityTool />;
      case "hex":
        return <HexTool />;
      case "hash":
        return <HashTool />;
      case "json":
        return <JsonTool />;
      case "diff":
        return <DiffTool />;
      case "case":
        return <CaseTool />;
      case "dedup":
        return <DedupTool />;
      case "sort":
        return <SortTool />;
      case "wordcount":
        return <WordCountTool />;
      case "reverse":
        return <ReverseTool />;
      case "lorem":
        return <LoremTool />;
      case "jwt":
        return <JwtDecoder />;
      case "pwdgen":
        return <PasswordGen />;
      case "pwdstr":
        return <PasswordStrength />;
      case "uuid":
        return <UuidTool />;
      case "color":
        return <ColorTool />;
      case "numberbase":
        return <NumberBaseTool />;
      case "unit":
        return <UnitConverter />;
      case "exchange":
        return <ExchangeRate />;
      case "cron":
        return <CronParser />;
      case "timestamp":
        return <TimestampTool />;
      case "http":
        return <HttpTester />;
      case "ip":
        return <IpTool />;
      case "clipboard":
        return <ClipboardTool />;
      case "market":
        return <PluginMarket />;
      default:
        return <div>选择一个工具</div>;
    }
  };

  return (
    <ThemeProvider>
      <AppShell
        title="z-biz-tool-box"
        icon={<ToolOutlined />}
        sidebar={
          <Menu
            mode="inline"
            defaultOpenKeys={TOOL_GROUPS.map((g) => g.key)}
            selectedKeys={[activePlugin]}
            items={menuItems}
            onClick={(e) => setActivePlugin(e.key)}
            style={{ borderRight: 0, height: "100%" }}
          />
        }
      >
        <div
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
            background: "var(--ant-color-bg-container)",
          }}
        >
          <Typography.Title level={4} style={{ margin: 0 }}>
            {activeTool?.label ?? "工具箱"}
            {activeGroup && (
              <Tag color="blue" style={{ marginLeft: 12, fontSize: 12 }}>
                {activeGroup.label}
              </Tag>
            )}
          </Typography.Title>
        </div>
        <div style={{ padding: 24 }}>{renderPlugin()}</div>
      </AppShell>
    </ThemeProvider>
  );
}
