import { useEffect, useState } from "react";
import { Tag, Typography, Button, Tooltip } from "antd";
import { ArrowLeftOutlined, MinusOutlined, CloseOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeProvider, Spotlight, MarketView, EmptyState } from "./_shared";
import { getTool, getGroupOfTool } from "./tools";
import { useUiStore } from "./stores/uiStore";
import { useExtStore, initExtStore } from "./plugins/external/store";
import { PluginIframe } from "./plugins/external/PluginIframe";
import { radius, shadow, size, motion } from "./_shared/designTokens";

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

  useEffect(() => {
    const k = activeKey;
    if (k !== "spotlight" && k !== "market") pushRecent(k);
  }, [activeKey, pushRecent]);

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
          borderRadius: size.floatingRadius,
          overflow: "hidden",
          boxShadow: shadow.floating,
          background: "var(--ant-color-bg-container)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          // macOS Sonoma 风格浮层: 边缘高光 + 背景柔化
          border: "1px solid rgba(0,0,0,0.06)",
          // 入场动画 (CSS 端 fade-in + scale)
          animation: "zBizFadeIn 0.16s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <style>{`
          @keyframes zBizFadeIn {
            from { opacity: 0; transform: scale(0.98) translateY(-4px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes zBizSlideIn {
            from { opacity: 0; transform: translateX(-6px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes zBizPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.32); }
            50% { box-shadow: 0 0 0 6px rgba(99,102,241,0); }
          }
          .zBizScroll::-webkit-scrollbar { width: 8px; height: 8px; }
          .zBizScroll::-webkit-scrollbar-track { background: transparent; }
          .zBizScroll::-webkit-scrollbar-thumb {
            background: var(--ant-color-fill-tertiary);
            border-radius: 999px;
          }
          .zBizScroll::-webkit-scrollbar-thumb:hover {
            background: var(--ant-color-text-quaternary);
          }
        `}</style>
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
          padding: "10px 14px",
          borderBottom: "1px solid var(--ant-color-border-secondary)",
          background:
            "linear-gradient(180deg, var(--ant-color-bg-container) 0%, transparent 100%)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Tooltip title="返回 (esc)">
            <Button
              size="small"
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
              }}
            />
          </Tooltip>
          <Typography.Text strong style={{ fontSize: 14, fontWeight: 600 }}>
            {title}
          </Typography.Text>
          {group && (
            <Tag
              color="blue"
              style={{
                fontSize: 11,
                borderRadius: 6,
                padding: "0 8px",
                margin: 0,
                fontWeight: 500,
              }}
            >
              {group}
            </Tag>
          )}
          {isExternal && (
            <Tag
              color="purple"
              style={{
                fontSize: 11,
                borderRadius: 6,
                padding: "0 8px",
                margin: 0,
                fontWeight: 500,
              }}
            >
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
              style={{ width: 28, height: 28, borderRadius: 8 }}
            />
          </Tooltip>
          <Tooltip title="隐藏 (⌥Space)">
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              onClick={onClose}
              style={{ width: 28, height: 28, borderRadius: 8 }}
            />
          </Tooltip>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--ant-color-bg-layout)",
        }}
        className="zBizScroll"
      >
        {children}
      </div>
    </div>
  );
}

// re-export for tree-shake safety
export { radius, shadow, size, motion };
