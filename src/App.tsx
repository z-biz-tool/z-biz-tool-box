import { useEffect, useState } from "react";
import { Menu, Typography, Tag } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { AppShell, ThemeProvider } from "./_shared";
import { TOOL_GROUPS, getTool, getGroupOfTool } from "./tools";
import { useUiStore } from "./stores/uiStore";

export default function App() {
  const [activePlugin, setActivePlugin] = useState("base64");
  const activeTool = getTool(activePlugin);
  const activeGroup = getGroupOfTool(activePlugin);
  const pushRecent = useUiStore((s) => s.pushRecent);

  // 进入插件即记入 recent(供 ⌘K 面板使用 — 见 B1)
  useEffect(() => {
    if (activePlugin) pushRecent(activePlugin);
  }, [activePlugin, pushRecent]);

  const menuItems = TOOL_GROUPS.map((g) => ({
    key: g.key,
    icon: g.icon,
    label: g.label,
    children: g.tools.map((t) => ({ key: t.key, icon: t.icon, label: t.label })),
  }));

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
        <div style={{ padding: 24 }}>{activeTool?.render() ?? <div>选择一个工具</div>}</div>
      </AppShell>
    </ThemeProvider>
  );
}
