import { useEffect, useState } from "react";
import { Tag, Typography, Button, Tooltip } from "antd";
import { ArrowLeftOutlined, MinusOutlined, CloseOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeProvider, Spotlight, MarketView, EmptyState, PreferencesView, ShortcutsView, DragHandle } from "./_shared";
import { MarketSourceManager } from "./_shared/MarketSourceManager";
import { getTool, getGroupOfTool } from "./tools";
import { useUiStore } from "./stores/uiStore";
import { useExtStore, initExtStore } from "./plugins/external/store";
import { PluginIframe } from "./plugins/external/PluginIframe";
import { radius, shadow, size, motion } from "./_shared/designTokens";

function parseActiveKey(key: string):
  | { kind: "spotlight" }
  | { kind: "market" }
  | { kind: "preferences" }
  | { kind: "shortcuts" }
  | { kind: "external"; pluginId: string; featureCode: string }
  | { kind: "builtin" } {
  if (key === "spotlight") return { kind: "spotlight" };
  if (key === "market") return { kind: "market" };
  if (key === "preferences") return { kind: "preferences" };
  if (key === "shortcuts") return { kind: "shortcuts" };
  if (key.startsWith("ext::")) {
    const [, pluginId, featureCode] = key.split("::");
    return { kind: "external", pluginId, featureCode };
  }
  return { kind: "builtin" };
}

export default function App() {
  const [activeKey, setActiveKey] = useState<string>("spotlight");
  const [sourceMgrOpen, setSourceMgrOpen] = useState(false);
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
        return;
      }
      // 兜底 ⌥Space: WebView 获焦时,tauri-plugin-global-shortcut 的
      // CGEvent tap 可能被 WebView 自己吞掉,这里前端直接 hide 一次,
      // 保证「再按一次 ⌥Space 一定能关」。
      // Rust 端 toggle_main_window 是主路径,这里只是兜底,
      // 双重触发也安全 (hide() 幂等,重复调用没副作用)。
      if (e.altKey && e.code === "Space") {
        e.preventDefault();
        getCurrentWindow()
          .hide()
          .catch(() => {});
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
        data-tauri-drag-region
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
          /* 顶栏拖动提示线: 4px 品牌渐变, 像 Spotlight 那种细线
             hover 时变高变明显, 暗示"这里可以拖" */
          .zBizDragBar {
            height: 4px;
            flex-shrink: 0;
            background: linear-gradient(
              90deg,
              transparent 0%,
              rgba(99, 102, 241, 0.55) 15%,
              rgba(139, 92, 246, 0.7) 50%,
              rgba(168, 85, 247, 0.55) 85%,
              transparent 100%
            );
            cursor: grab;
            transition: height 0.18s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0.65;
            position: relative;
            z-index: 1;
          }
          .zBizDragBar:hover,
          .zBizDragBar:active {
            height: 6px;
            opacity: 1;
            cursor: grabbing;
          }
          .zBizDragBar:active {
            background: linear-gradient(
              90deg,
              transparent 0%,
              rgba(99, 102, 241, 0.75) 15%,
              rgba(139, 92, 246, 0.9) 50%,
              rgba(168, 85, 247, 0.75) 85%,
              transparent 100%
            );
          }
          /* 任何可点击/可输入的子元素,关掉继承的 drag,否则无法点 */
          input,
          textarea,
          button,
          select,
          a,
          [role="button"],
          .ant-input,
          .ant-input-affix-wrapper,
          .ant-input-number,
          .ant-input-search,
          .ant-btn,
          .ant-select,
          .ant-select-selector,
          .ant-select-dropdown,
          .ant-switch,
          .ant-tag,
          .ant-card,
          .ant-tabs,
          .ant-tabs-tab,
          .ant-tabs-tab-btn,
          .ant-dropdown-trigger,
          .ant-list,
          .ant-list-item,
          .ant-checkbox,
          .ant-checkbox-input,
          .ant-radio,
          .ant-radio-input,
          .ant-segmented,
          .ant-segmented-item,
          .ant-picker,
          .ant-empty,
          .ant-pagination,
          [data-no-drag] {
            -webkit-app-region: no-drag;
          }
        `}</style>
        <div className="zBizApp" style={{ display: "contents" }}>
        {/* 视图顶部由各 view 自行用 <DragHandle /> 提供可拖动区域 + 抓手 icon */}
        {active.kind === "spotlight" ? (
          <Spotlight
            onSelect={setActiveKey}
            onClose={hideWindow}
            onOpenMarket={() => setActiveKey("market")}
            onOpenPreferences={() => setActiveKey("preferences")}
            onOpenShortcuts={() => setActiveKey("shortcuts")}
            onOpenMarketSources={() => setSourceMgrOpen(true)}
          />
        ) : active.kind === "market" ? (
          <MarketView
            onClose={hideWindow}
            onBack={() => setActiveKey("spotlight")}
            onOpenMarketSources={() => setSourceMgrOpen(true)}
            onSelectTool={(key) => setActiveKey(key)}
          />
        ) : active.kind === "preferences" ? (
          <PreferencesView onBack={() => setActiveKey("spotlight")} />
        ) : active.kind === "shortcuts" ? (
          <ShortcutsView onBack={() => setActiveKey("spotlight")} />
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
      </div>

      <MarketSourceManager
        open={sourceMgrOpen}
        onClose={() => setSourceMgrOpen(false)}
      />
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
      <DragHandle
        right={
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
        }
      >
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
      </DragHandle>
      <div
        data-tauri-drag-region
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--ant-color-bg-layout)",
          // 外部插件 PluginIframe 用 absolute inset:0 铺满本区域;
          // 没有定位基准时会穿透到 App 根, 盖住顶栏(返回/最小化/关闭都点不到)
          position: "relative",
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
