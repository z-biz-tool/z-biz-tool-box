import { useState, useEffect } from "react";
import { Layout, Menu, theme } from "antd";
import {
  CodeOutlined,
  ClockCircleOutlined,
  KeyOutlined,
  SnippetsOutlined,
  ScissorOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";

import Base64Tool from "./plugins/Base64Tool";
import JsonTool from "./plugins/JsonTool";
import TimestampTool from "./plugins/TimestampTool";
import UuidTool from "./plugins/UuidTool";
import ClipboardTool from "./plugins/ClipboardTool";
import PluginMarket from "./plugins/PluginMarket";

const { Sider, Content } = Layout;

export default function App() {
  const [activePlugin, setActivePlugin] = useState("base64");
  const { token } = theme.useToken();

  const menuItems = [
    { key: "base64", icon: <CodeOutlined />, label: "Base64" },
    { key: "json", icon: <CodeOutlined />, label: "JSON格式化" },
    { key: "timestamp", icon: <ClockCircleOutlined />, label: "时间戳" },
    { key: "uuid", icon: <KeyOutlined />, label: "UUID生成" },
    { key: "clipboard", icon: <SnippetsOutlined />, label: "剪贴板" },
    { key: "market", icon: <AppstoreOutlined />, label: "插件市场" },
  ];

  const renderPlugin = () => {
    switch (activePlugin) {
      case "base64": return <Base64Tool />;
      case "json": return <JsonTool />;
      case "timestamp": return <TimestampTool />;
      case "uuid": return <UuidTool />;
      case "clipboard": return <ClipboardTool />;
      case "market": return <PluginMarket />;
      default: return <div>选择一个工具</div>;
    }
  };

  return (
    <Layout style={{ height: "100vh" }}>
      <Sider width={180} style={{ background: token.colorBgContainer }}>
        <div style={{ padding: "16px", textAlign: "center", fontWeight: 600, fontSize: 16 }}>
          z-biz-tool-box
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activePlugin]}
          items={menuItems}
          onClick={(e) => setActivePlugin(e.key)}
        />
      </Sider>
      <Content style={{ padding: "24px", overflow: "auto" }}>
        {renderPlugin()}
      </Content>
    </Layout>
  );
}
