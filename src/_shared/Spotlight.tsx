import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Tag } from "antd";
import {
  SearchOutlined,
  CloseOutlined,
  StarFilled,
  AppstoreOutlined,
  EnterOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from "@ant-design/icons";
import { ALL_TOOLS, TOOL_GROUPS } from "../plugins/_registry";
import type { ToolMeta } from "../plugins/_types";
import { useUiStore } from "../stores/uiStore";
import { useExtStore } from "../plugins/external/store";
import { openPluginsDir } from "../plugins/external/scanner";

interface SpotlightProps {
  onSelect: (key: string) => void;
  onClose: () => void;
}

/**
 * uTools 风格主面板:
 *  - 顶部大搜索框 (默认聚焦)
 *  - 主体: 已固定 / 分组 / 最近使用 / 外部插件 图标网格
 *  - 状态栏: 快捷键提示 + 关闭按钮
 *
 *  键盘:
 *   - ↑↓ 切换 active
 *   - ⏎ 选中
 *   - esc 关闭
 *   - 输入文字 → 实时过滤,只剩"匹配"组
 */
export function Spotlight({ onSelect, onClose }: SpotlightProps) {
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string>("");
  const inputRef = useRef<any>(null);

  const starred = useUiStore((s) => s.starred);
  const recent = useUiStore((s) => s.recent);
  const disabled = useUiStore((s) => s.disabled);
  const extPlugins = useExtStore((s) => s.plugins);
  const extLoading = useExtStore((s) => s.loading);
  const extRefresh = useExtStore((s) => s.refresh);

  // 自动聚焦输入框
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus?.(), 50);
    return () => clearTimeout(t);
  }, []);

  // 过滤 + 派生所有可见 QuickItem
  const visibleTool = useMemo(() => {
    const all = ALL_TOOLS.filter((t) => !disabled.includes(t.key));
    const lookup = (k: string) => all.find((t) => t.key === k);

    const items: Array<{ tool: ToolMeta; section: string }> = [];
    const q = query.trim().toLowerCase();

    const match = (t: ToolMeta) => {
      if (!q) return true;
      const hay = `${t.label} ${t.description} ${t.keywords ?? ""} ${t.key}`.toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    };

    // 1. 已固定 (过滤 query)
    if (!q) {
      for (const k of starred) {
        const t = lookup(k);
        if (t) items.push({ tool: t, section: "已固定" });
      }
    }

    // 2. 按分组 (内建工具)
    for (const g of TOOL_GROUPS) {
      for (const t of g.tools) {
        if (disabled.includes(t.key)) continue;
        if (!match(t)) continue;
        items.push({ tool: t, section: g.label });
      }
    }

    // 3. 外部插件 features
    for (const p of extPlugins) {
      if (p.error) continue;
      for (const f of p.features) {
        const tool: ToolMeta = {
          key: `ext::${p.id}::${f.code}`,
          label: f.explain,
          description: `${p.name} · ${f.cmds?.join(" / ") ?? ""}`,
          group: p.id,
          groupLabel: `📦 ${p.name}`,
          icon: p.logoUrl ? (
            <img src={p.logoUrl} style={{ width: 18, height: 18, borderRadius: 3 }} />
          ) : (
            <AppstoreOutlined />
          ),
          render: () => null, // 由 onSelect 路径处理
        };
        if (!match(tool)) continue;
        items.push({ tool, section: `📦 ${p.name}` });
      }
    }

    return items;
  }, [query, starred, recent, disabled, extPlugins]);

  // 按 section 分组
  const groupedSections = useMemo(() => {
    const map = new Map<string, Array<ToolMeta>>();
    const order: string[] = [];
    for (const it of visibleTool) {
      if (!map.has(it.section)) {
        map.set(it.section, []);
        order.push(it.section);
      }
      map.get(it.section)!.push(it.tool);
    }
    return order.map((s) => ({ title: s, tools: map.get(s)! }));
  }, [visibleTool]);

  // 默认 active 选中第一个
  useEffect(() => {
    if (visibleTool.length > 0 && (!activeKey || !visibleTool.find((v) => v.tool.key === activeKey))) {
      setActiveKey(visibleTool[0].tool.key);
    }
  }, [visibleTool, activeKey]);

  // 键盘导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || (e.key === "j" && e.metaKey)) {
        e.preventDefault();
        const idx = visibleTool.findIndex((v) => v.tool.key === activeKey);
        const next = visibleTool[Math.min(visibleTool.length - 1, idx + 1)];
        if (next) setActiveKey(next.tool.key);
      } else if (e.key === "ArrowUp" || (e.key === "k" && e.metaKey)) {
        e.preventDefault();
        const idx = visibleTool.findIndex((v) => v.tool.key === activeKey);
        const prev = visibleTool[Math.max(0, idx - 1)];
        if (prev) setActiveKey(prev.tool.key);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cur = visibleTool.find((v) => v.tool.key === activeKey);
        if (cur) {
          onSelect(cur.tool.key);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (query) {
          setQuery("");
        } else {
          onClose();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        // ⌘K 在 spotlight 内 = 切到 QuickOpen
        e.preventDefault();
        // 不做事, 让 QuickOpen 自带逻辑打开
        // (这里需要 QuickOpen 接受外部 trigger; 简单方案: 不干预)
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visibleTool, activeKey, onSelect, onClose, query]);

  // 滚到 active 项
  useEffect(() => {
    if (!activeKey) return;
    const el = document.querySelector(`[data-sp-idx="${activeKey}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeKey]);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--ant-color-bg-container)",
        color: "var(--ant-color-text)",
      }}
    >
      {/* 顶部: 搜索框 */}
      <div
        style={{
          padding: "14px 20px 10px",
          borderBottom: "1px solid var(--ant-color-border-secondary)",
        }}
      >
        <Input
          ref={inputRef}
          size="large"
          prefix={<SearchOutlined style={{ fontSize: 18, color: "var(--ant-color-text-tertiary)" }} />}
          placeholder="搜索功能 / 粘贴文件、图片"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          variant="borderless"
          style={{ fontSize: 18, height: 40 }}
          allowClear
        />
      </div>

      {/* 主体: 分组图标网格 */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 20px 8px",
        }}
      >
        {visibleTool.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--ant-color-text-tertiary)",
              gap: 12,
            }}
          >
            <SearchOutlined style={{ fontSize: 32, opacity: 0.3 }} />
            <span>没有匹配的功能</span>
            <span style={{ fontSize: 12 }}>试试: base64 / uuid / json / http / 时间戳</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {groupedSections.map((sec) => (
              <div key={sec.title}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 8,
                    fontSize: 12,
                    color: "var(--ant-color-text-tertiary)",
                  }}
                >
                  {sec.title.startsWith("已固定") && <StarFilled style={{ fontSize: 11, color: "#faad14" }} />}
                  <span style={{ fontWeight: 500 }}>{sec.title}</span>
                  <span style={{ fontSize: 10, opacity: 0.6 }}>· {sec.tools.length}</span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(86px, 1fr))",
                    gap: 6,
                  }}
                >
                  {sec.tools.map((t) => (
                    <ToolIcon
                      key={t.key}
                      tool={t}
                      isActive={t.key === activeKey}
                      onClick={() => onSelect(t.key)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部: 状态栏 */}
      <div
        style={{
          padding: "6px 16px",
          borderTop: "1px solid var(--ant-color-border-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--ant-color-text-tertiary)",
        }}
      >
        <Space>
          <KeyHint icon={<ArrowUpOutlined />} icon2={<ArrowDownOutlined />} label="切换" />
          <KeyHint icon={<EnterOutlined />} label="打开" />
          <KeyHint label="esc 关闭" />
          {extPlugins.length > 0 && (
            <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>
              {extPlugins.length} 外部插件 · {extPlugins.reduce((s, p) => s + p.features.length, 0)} features
            </Tag>
          )}
        </Space>
        <Space>
          <button
            onClick={async () => {
              try {
                await openPluginsDir();
              } catch {}
            }}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--ant-color-text-tertiary)",
              cursor: "pointer",
              fontSize: 11,
              padding: 0,
            }}
            title="打开插件目录"
          >
            打开插件目录
          </button>
          <button
            onClick={() => extRefresh()}
            disabled={extLoading}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--ant-color-text-tertiary)",
              cursor: extLoading ? "wait" : "pointer",
              fontSize: 11,
              padding: 0,
            }}
            title="刷新外部插件"
          >
            {extLoading ? "刷新中..." : "刷新"}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--ant-color-text-tertiary)",
              cursor: "pointer",
              fontSize: 11,
              padding: 0,
              marginLeft: 8,
            }}
          >
            <CloseOutlined /> 关闭
          </button>
        </Space>
      </div>
    </div>
  );
}

function ToolIcon({ tool, isActive, onClick }: { tool: ToolMeta; isActive: boolean; onClick: () => void }) {
  return (
    <div
      data-sp-idx={tool.key}
      onClick={onClick}
      onMouseEnter={() => {}} // 实际 active 由父级 set
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 4px 8px",
        borderRadius: 10,
        background: isActive ? "var(--ant-color-primary-bg)" : "transparent",
        border: isActive ? "1.5px solid var(--ant-color-primary)" : "1.5px solid transparent",
        cursor: "pointer",
        transition: "all 0.1s",
        userSelect: "none",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        style={{
          fontSize: 26,
          lineHeight: 1,
          color: isActive ? "var(--ant-color-primary)" : "var(--ant-color-text)",
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 30,
        }}
      >
        {tool.icon}
      </div>
      <div
        style={{
          fontSize: 11,
          color: isActive ? "var(--ant-color-primary)" : "var(--ant-color-text)",
          textAlign: "center",
          lineHeight: 1.2,
          width: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: isActive ? 600 : 400,
        }}
        title={tool.label}
      >
        {tool.label}
      </div>
    </div>
  );
}

function KeyHint({ icon, icon2, label }: { icon?: React.ReactNode; icon2?: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, marginRight: 8 }}>
      {icon && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            padding: "1px 5px",
            background: "var(--ant-color-fill-tertiary)",
            borderRadius: 3,
            fontSize: 10,
          }}
        >
          {icon} {icon2}
        </span>
      )}
      <span>{label}</span>
    </span>
  );
}

function Space({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{children}</span>;
}
