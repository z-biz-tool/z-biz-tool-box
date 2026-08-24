import { useEffect, useState } from "react";
import { Tag, Typography, Button, Tooltip } from "antd";
import { ArrowLeftOutlined, MinusOutlined, CloseOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeProvider, Spotlight, MarketView, EmptyState } from "./_shared";
import { getTool, getGroupOfTool } from "./tools";
import { useUiStore } from "./stores/uiStore";
import { useExtStore, initExtStore } from "./plugins/external/store";
import { PluginIframe } from "./plugins/external/PluginIframe";

/**
 * activeKey 模式:
 *  - "spotlight"  → 主面板 (默认)
 *  - "market"     → 插件应用市场
 *  - 内置插件:   直接是 key, 如 "base64"
 *  - 外部插件:   "ext::<pluginId>::<featureCode>"
 */
function parseActiveKey(key: string):
  | { kind: "spotlight" }
  | { kind: "market" }
  | { kind: "external"; pluginId: string; featureCode: string }
  | { kind: "builtin" } {
  if (key === "spotlight") return { kind: "spotlight" };
  if (key === "market") return { kind: "market" };
  if (key.startsWith("ext::")) {
    const [, pluginId, featureCode] = key.split("::");
    return { kind: "external", pluginId, featureCode };
  }
  return { kind: "builtin" };
}

export default function App() {
  const [activeKey, setActiveKey] = useState<string>("spotlight");
  const pushRecent = useUiStore((s) => s.pushRecent);
  const extPlugins = useExtStore((s) => s.plugins);

  useEffect(() => {
    initExtStore();
  }, []);

  // 进入工具即记入 recent (spotlight/market 不计)
  useEffect(() => {
    const k = activeKey;
    if (k !== "spotlight" && k !== "market") pushRecent(k);
  }, [activeKey, pushRecent]);

  // 监听 ⌘K (在 spotlight 模式唤起 QuickOpen 切工具), esc 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeKey === "market") {
          setActiveKey("spotlight");
          e.preventDefault();
        } else if (activeKey === "spotlight") {
          getCurrentWindow()
            .hide()
            .catch(() => {});
          e.preventDefault();
        } else {
          // 工具模式按 esc → 返回 spotlight
          setActiveKey("spotlight");
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeKey]);

  const active = parseActiveKey(activeKey);
  const activeTool = active.kind === "builtin" ? getTool(activeKey) : undefined;
  const activeGroup = active.kind === "builtin" ? getGroupOfTool(activeKey) : undefined;
  const extPlugin = active.kind === "external"
    ? extPlugins.find((p) => p.id === active.pluginId)
    : undefined;

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
      <div
        style={{
          height: "100vh",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          border: "1px solid var(--ant-color-border-secondary)",
          background: "var(--ant-color-bg-container)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {active.kind === "spotlight" ? (
          <Spotlight
            onSelect={setActiveKey}
            onClose={hideWindow}
            onOpenMarket={() => setActiveKey("market")}
          />
        ) : active.kind === "market" ? (
          <MarketView
            onClose={hideWindow}
            onBack={() => setActiveKey("spotlight")}
          />
        ) : (
          <ToolView
            title={activeTool?.label ?? (extPlugin?.name ?? "工具")}
            group={activeGroup?.label}
            isExternal={active.kind === "external"}
            onBack={() => setActiveKey("spotlight")}
            onMinimize={minimizeWindow}
            onClose={hideWindow}
          >
            {active.kind === "builtin" && activeTool ? (
              activeTool.render()
            ) : active.kind === "external" && extPlugin ? (
              <PluginIframe plugin={extPlugin} />
            ) : (
              <EmptyState title="工具未加载" description="外部插件可能已被移除" />
            )}
          </ToolView>
        )}
      </div>
    </ThemeProvider>
  );
}

interface ToolViewProps {
  title: string;
  group?: string;
  isExternal?: boolean;
  onBack: () => void;
  onMinimize: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

function ToolView({ title, group, isExternal, onBack, onMinimize, onClose, children }: ToolViewProps) {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--ant-color-bg-container)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--ant-color-border-secondary)",
          background: "var(--ant-color-bg-container)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Tooltip title="返回 (esc)">
            <Button
              size="small"
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
            />
          </Tooltip>
          <Typography.Text strong style={{ fontSize: 14 }}>
            {title}
          </Typography.Text>
          {group && (
            <Tag color="blue" style={{ fontSize: 11 }}>
              {group}
            </Tag>
          )}
          {isExternal && (
            <Tag color="purple" style={{ fontSize: 11 }}>
              外部插件
            </Tag>
          )}
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <Tooltip title="最小化">
            <Button
              size="small"
              type="text"
              icon={<MinusOutlined />}
              onClick={onMinimize}
            />
          </Tooltip>
          <Tooltip title="隐藏 (⌥Space)">
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              onClick={onClose}
            />
          </Tooltip>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", background: "var(--ant-color-bg-layout)" }}>
        {children}
      </div>
    </div>
  );
}
