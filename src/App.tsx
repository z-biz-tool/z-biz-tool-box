import { useEffect, useMemo, useState } from "react";
import { Menu, Typography, Tag, Button, Tooltip } from "antd";
import { ToolOutlined, MinusOutlined, CloseOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppShell, ThemeProvider, QuickOpen } from "./_shared";
import { TOOL_GROUPS, getTool, getGroupOfTool } from "./tools";
import { useUiStore } from "./stores/uiStore";
import { useExtStore, initExtStore } from "./plugins/external/store";
import { PluginIframe } from "./plugins/external/PluginIframe";

/**
 * activePlugin key 约定:
 *  - 内置插件: 直接是 key, 如 "base64"
 *  - 外部插件: "ext::<pluginId>::<featureCode>" (按 feature 触发,而不是 plugin)
 */
function parseActiveKey(key: string): { kind: "builtin" } | { kind: "external"; pluginId: string; featureCode: string } {
  if (key.startsWith("ext::")) {
    const [, pluginId, featureCode] = key.split("::");
    return { kind: "external", pluginId, featureCode };
  }
  return { kind: "builtin" };
}

export default function App() {
  const [activePlugin, setActivePlugin] = useState("base64");
  const activeTool = getTool(activePlugin);
  const activeGroup = getGroupOfTool(activePlugin);
  const pushRecent = useUiStore((s) => s.pushRecent);
  const disabled = useUiStore((s) => s.disabled);
  const extPlugins = useExtStore((s) => s.plugins);

  // 启动时扫描外部插件目录
  useEffect(() => {
    initExtStore();
  }, []);

  // 进入插件即记入 recent(供 ⌘K 面板使用)
  useEffect(() => {
    if (activePlugin) pushRecent(activePlugin);
  }, [activePlugin, pushRecent]);

  // 监听 esc → 隐藏主窗口
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // 如果 QuickOpen 开着,不抢(QuickOpen 自己处理)
        const qo = document.querySelector(".ant-modal-wrap:not([style*='display: none'])");
        if (qo) return;
        // 隐藏主窗口
        getCurrentWindow()
          .hide()
          .catch(() => {});
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // 过滤掉禁用的内置工具
  const visibleGroups = useMemo(
    () =>
      TOOL_GROUPS.map((g) => ({
        ...g,
        tools: g.tools.filter((t) => !disabled.includes(t.key)),
      })).filter((g) => g.tools.length > 0),
    [disabled]
  );

  // 内置 + 外部(如果启用) 合并侧边栏菜单
  const menuItems = useMemo(() => {
    const builtin = visibleGroups.map((g) => ({
      key: g.key,
      icon: g.icon,
      label: g.label,
      children: g.tools.map((t) => ({ key: t.key, icon: t.icon, label: t.label })),
    }));
    const external = extPlugins
      .filter((p) => !p.error)
      .map((p) => ({
        key: `ext-group-${p.id}`,
        icon: p.logoUrl ? <img src={p.logoUrl} style={{ width: 14, height: 14 }} /> : <ToolOutlined />,
        label: `📦 ${p.name}`,
        children: p.features.map((f) => ({
          key: `ext::${p.id}::${f.code}`,
          label: f.explain,
        })),
      }));
    return [...builtin, ...external];
  }, [visibleGroups, extPlugins]);

  // 解析当前激活的 key
  const active = parseActiveKey(activePlugin);
  const extPlugin = active.kind === "external"
    ? extPlugins.find((p) => p.id === active.pluginId)
    : undefined;

  // 浮层窗口控制
  const hideWindow = async () => {
    try {
      await getCurrentWindow().hide();
    } catch {}
  };
  const minimizeWindow = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {}
  };

  return (
    <ThemeProvider>
      <AppShell
        title="z-biz-tool-box"
        icon={<ToolOutlined />}
        sidebar={
          <Menu
            mode="inline"
            defaultOpenKeys={[...TOOL_GROUPS.map((g) => g.key), ...extPlugins.map((p) => `ext-group-${p.id}`)]}
            selectedKeys={[activePlugin]}
            items={menuItems}
            onClick={(e) => setActivePlugin(e.key)}
            style={{ borderRight: 0, height: "100%" }}
          />
        }
        headerExtra={
          <div data-tauri-drag-region style={{ display: "flex", gap: 4 }}>
            <Tooltip title="最小化">
              <Button
                size="small"
                type="text"
                icon={<MinusOutlined />}
                onClick={minimizeWindow}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              />
            </Tooltip>
            <Tooltip title="隐藏 (esc)">
              <Button
                size="small"
                type="text"
                icon={<CloseOutlined />}
                onClick={hideWindow}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              />
            </Tooltip>
          </div>
        }
      >
        <div
          data-tauri-drag-region
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
            background: "var(--ant-color-bg-container)",
            cursor: "default",
          }}
        >
          <Typography.Title level={4} style={{ margin: 0, WebkitAppRegion: "drag" } as React.CSSProperties}>
            {activeTool?.label ?? (extPlugin ? extPlugin.name : "工具箱")}
            {activeGroup && (
              <Tag color="blue" style={{ marginLeft: 12, fontSize: 12 }}>
                {activeGroup.label}
              </Tag>
            )}
            {active.kind === "external" && (
              <Tag color="purple" style={{ marginLeft: 12, fontSize: 12 }}>
                外部插件
              </Tag>
            )}
          </Typography.Title>
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {active.kind === "builtin" ? (
            <div style={{ padding: 24, height: "100%", overflow: "auto" }}>{activeTool?.render() ?? <div>选择一个工具</div>}</div>
          ) : extPlugin ? (
            <PluginIframe plugin={extPlugin} />
          ) : (
            <div style={{ padding: 24 }}>
              <p>外部插件 "{active.pluginId}" 未加载</p>
            </div>
          )}
        </div>
      </AppShell>
      <QuickOpen onSelect={setActivePlugin} />
    </ThemeProvider>
  );
}
