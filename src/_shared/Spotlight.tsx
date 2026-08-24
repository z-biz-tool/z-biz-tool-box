import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "antd";
import {
  SearchOutlined,
  AppstoreOutlined,
  SettingOutlined,
  StarOutlined,
  RocketOutlined,
  KeyOutlined,
  ToolOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { ALL_TOOLS, TOOL_GROUPS } from "../plugins/_registry";
import type { ToolMeta } from "../plugins/_types";
import { useUiStore } from "../stores/uiStore";
import { useExtStore } from "../plugins/external/store";
import { openPluginsDir } from "../plugins/external/scanner";

interface SpotlightProps {
  onSelect: (key: string) => void;
  onClose: () => void;
  onOpenMarket: () => void;
}

type NavKey = "all" | "builtin" | "external" | "starred" | "recent";

interface NavItem {
  key: NavKey | string;
  label: string;
  icon: React.ReactNode;
  group?: "personal" | "preference" | "nav";
}

/**
 * uTools 风格主面板 (三列布局):
 *  - 左列 180px: 导航(所有功能 / 内置 / 外部 / 收藏 / 最近 / 设置)
 *  - 中列 200px: 分类(编码/文本/.../外部)
 *  - 右列 flex: 功能列表,每行: icon + label + 蓝色 cmds chips + 描述
 */
export function Spotlight({ onSelect, onClose, onOpenMarket }: SpotlightProps) {
  const [query, setQuery] = useState("");
  const [activeNav, setActiveNav] = useState<NavKey>("all");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeKey, setActiveKey] = useState<string>("");
  const inputRef = useRef<any>(null);

  const starred = useUiStore((s) => s.starred);
  const recent = useUiStore((s) => s.recent);
  const disabled = useUiStore((s) => s.disabled);
  const extPlugins = useExtStore((s) => s.plugins);
  const extLoading = useExtStore((s) => s.loading);
  const extRefresh = useExtStore((s) => s.refresh);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus?.(), 50);
    return () => clearTimeout(t);
  }, []);

  // 工具全集
  const allTools = useMemo(
    () => ALL_TOOLS.filter((t) => !disabled.includes(t.key)),
    [disabled]
  );

  // 派生右侧功能列表
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();

    // 根据 activeNav 过滤
    let pool: ToolMeta[] = [];
    if (activeNav === "all") {
      pool = allTools;
    } else if (activeNav === "builtin") {
      pool = allTools;
    } else if (activeNav === "external") {
      // 外部插件 features 摊平
      for (const p of extPlugins) {
        if (p.error) continue;
        for (const f of p.features) {
          pool.push({
            key: `ext::${p.id}::${f.code}`,
            label: f.explain,
            description: `${p.name} · ${f.cmds?.join(" / ") ?? ""}`,
            group: p.id,
            groupLabel: `📦 ${p.name}`,
            icon: p.logoUrl ? (
              <img src={p.logoUrl} style={{ width: 14, height: 14, borderRadius: 2 }} />
            ) : (
              <AppstoreOutlined />
            ),
            cmds: f.cmds ?? [],
            render: () => null,
          });
        }
      }
    } else if (activeNav === "starred") {
      pool = starred.map((k) => allTools.find((t) => t.key === k)).filter(Boolean) as ToolMeta[];
    } else if (activeNav === "recent") {
      pool = recent.map((k) => allTools.find((t) => t.key === k)).filter(Boolean) as ToolMeta[];
    }

    // 根据 activeCategory 过滤(仅当 activeNav=all/builtin)
    if ((activeNav === "all" || activeNav === "builtin") && activeCategory !== "all") {
      if (activeCategory === "external") {
        // 切换到 external
        pool = [];
        for (const p of extPlugins) {
          if (p.error) continue;
          for (const f of p.features) {
            pool.push({
              key: `ext::${p.id}::${f.code}`,
              label: f.explain,
              description: `${p.name} · ${f.cmds?.join(" / ") ?? ""}`,
              group: p.id,
              groupLabel: `📦 ${p.name}`,
              icon: p.logoUrl ? (
                <img src={p.logoUrl} style={{ width: 14, height: 14, borderRadius: 2 }} />
              ) : (
                <AppstoreOutlined />
              ),
              cmds: f.cmds ?? [],
              render: () => null,
            });
          }
        }
      } else {
        pool = pool.filter((t) => {
          if (t.key.startsWith("ext::")) return false; // 外部不过滤 by category
          return t.group === activeCategory;
        });
      }
    }

    // query 过滤
    if (q) {
      pool = pool.filter((t) => {
        const hay = `${t.label} ${t.description} ${t.keywords ?? ""} ${(t.cmds ?? []).join(" ")} ${t.key}`.toLowerCase();
        return q.split(/\s+/).every((w) => hay.includes(w));
      });
    }

    return pool;
  }, [activeNav, activeCategory, query, allTools, starred, recent, extPlugins, disabled]);

  // 默认 activeKey
  useEffect(() => {
    if (items.length > 0 && (!activeKey || !items.find((t) => t.key === activeKey))) {
      setActiveKey(items[0].key);
    }
    if (items.length === 0) {
      setActiveKey("");
    }
  }, [items, activeKey]);

  // 键盘导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const idx = items.findIndex((t) => t.key === activeKey);
        const next = items[Math.min(items.length - 1, idx + 1)];
        if (next) setActiveKey(next.key);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const idx = items.findIndex((t) => t.key === activeKey);
        const prev = items[Math.max(0, idx - 1)];
        if (prev) setActiveKey(prev.key);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cur = items.find((t) => t.key === activeKey);
        if (cur) onSelect(cur.key);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (query) {
          setQuery("");
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, activeKey, onSelect, onClose, query]);

  // 滚到 active
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
          padding: "12px 16px",
          borderBottom: "1px solid var(--ant-color-border-secondary)",
        }}
      >
        <Input
          ref={inputRef}
          size="large"
          prefix={
            <SearchOutlined
              style={{ fontSize: 16, color: "var(--ant-color-text-tertiary)" }}
            />
          }
          placeholder="搜索功能 / 粘贴文件、图片"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          variant="borderless"
          style={{ fontSize: 15, height: 36 }}
          allowClear
        />
      </div>

      {/* 主体: 三列 */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* 左列: 导航 */}
        <div
          style={{
            width: 180,
            borderRight: "1px solid var(--ant-color-border-secondary)",
            padding: "12px 8px",
            overflowY: "auto",
            background: "var(--ant-color-bg-container)",
          }}
        >
          <NavSection title="导航">
            <NavItem
              icon={<AppstoreOutlined />}
              label="所有功能"
              active={activeNav === "all"}
              onClick={() => {
                setActiveNav("all");
                setActiveCategory("all");
              }}
            />
            <NavItem
              icon={<ToolOutlined />}
              label="内置插件"
              active={activeNav === "builtin"}
              onClick={() => {
                setActiveNav("builtin");
                setActiveCategory("all");
              }}
            />
            <NavItem
              icon={<AppstoreOutlined />}
              label="外部插件"
              active={activeNav === "external"}
              onClick={() => {
                setActiveNav("external");
                setActiveCategory("all");
              }}
              badge={extPlugins.length}
            />
          </NavSection>

          <NavSection title="我的">
            <NavItem
              icon={<StarOutlined />}
              label="我的收藏"
              active={activeNav === "starred"}
              onClick={() => {
                setActiveNav("starred");
                setActiveCategory("all");
              }}
              badge={starred.length}
            />
            <NavItem
              icon={<RocketOutlined />}
              label="最近使用"
              active={activeNav === "recent"}
              onClick={() => {
                setActiveNav("recent");
                setActiveCategory("all");
              }}
              badge={recent.length}
            />
          </NavSection>

          <NavSection title="设置">
            <NavItem
              icon={<SettingOutlined />}
              label="偏好设置"
              onClick={() => {}}
            />
            <NavItem
              icon={<KeyOutlined />}
              label="快捷键"
              onClick={() => {}}
            />
          </NavSection>
        </div>

        {/* 中列: 分类(仅 all/builtin 时显示) */}
        {(activeNav === "all" || activeNav === "builtin") && (
          <div
            style={{
              width: 180,
              borderRight: "1px solid var(--ant-color-border-secondary)",
              padding: "12px 8px",
              overflowY: "auto",
              background: "var(--ant-color-bg-container)",
            }}
          >
            <NavSection title="分类">
              <NavItem
                icon={<AppstoreOutlined style={{ opacity: 0.4 }} />}
                label="全部分类"
                active={activeCategory === "all"}
                onClick={() => setActiveCategory("all")}
              />
              {TOOL_GROUPS.map((g) => {
                const count = ALL_TOOLS.filter(
                  (t) => t.group === g.key && !disabled.includes(t.key)
                ).length;
                return (
                  <NavItem
                    key={g.key}
                    icon={g.icon}
                    label={g.label}
                    active={activeCategory === g.key}
                    onClick={() => setActiveCategory(g.key)}
                    badge={count}
                  />
                );
              })}
              <NavItem
                icon={<AppstoreOutlined style={{ color: "#722ed1" }} />}
                label="外部插件"
                active={activeCategory === "external"}
                onClick={() => setActiveCategory("external")}
                badge={extPlugins.length}
              />
            </NavSection>
          </div>
        )}

        {(activeNav === "external" || activeNav === "starred" || activeNav === "recent") && (
          <div
            style={{
              width: 180,
              borderRight: "1px solid var(--ant-color-border-secondary)",
              padding: "12px 8px",
              overflowY: "auto",
              background: "var(--ant-color-bg-container)",
            }}
          >
            {activeNav === "external" && (
              <NavSection title="外部插件">
                {extPlugins.length === 0 ? (
                  <div style={{ padding: "8px 12px", color: "var(--ant-color-text-tertiary)", fontSize: 12 }}>
                    还没有外部插件
                    <br />
                    点击右下「打开插件目录」
                  </div>
                ) : (
                  extPlugins.map((p) => (
                    <NavItem
                      key={p.id}
                      icon={
                        p.logoUrl ? (
                          <img src={p.logoUrl} style={{ width: 14, height: 14, borderRadius: 2 }} />
                        ) : (
                          <AppstoreOutlined style={{ color: "#722ed1" }} />
                        )
                      }
                      label={p.name}
                      active={activeCategory === p.id}
                      onClick={() => setActiveCategory(p.id)}
                      badge={p.features.length}
                    />
                  ))
                )}
              </NavSection>
            )}
            {activeNav === "starred" && (
              <NavSection title="收藏的工具">
                {starred.length === 0 ? (
                  <div style={{ padding: "8px 12px", color: "var(--ant-color-text-tertiary)", fontSize: 12 }}>
                    还没有收藏
                  </div>
                ) : (
                  starred.map((k) => {
                    const t = allTools.find((x) => x.key === k);
                    if (!t) return null;
                    return (
                      <NavItem
                        key={k}
                        icon={t.icon}
                        label={t.label}
                        active={activeCategory === k}
                        onClick={() => setActiveCategory(k)}
                      />
                    );
                  })
                )}
              </NavSection>
            )}
            {activeNav === "recent" && (
              <NavSection title="最近使用">
                {recent.length === 0 ? (
                  <div style={{ padding: "8px 12px", color: "var(--ant-color-text-tertiary)", fontSize: 12 }}>
                    还没有记录
                  </div>
                ) : (
                  recent.map((k) => {
                    const t = allTools.find((x) => x.key === k);
                    if (!t) return null;
                    return (
                      <NavItem
                        key={k}
                        icon={t.icon}
                        label={t.label}
                        active={activeCategory === k}
                        onClick={() => setActiveCategory(k)}
                      />
                    );
                  })
                )}
              </NavSection>
            )}
          </div>
        )}

        {/* 右列: 功能列表 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            background: "var(--ant-color-bg-container)",
          }}
        >
          {/* 顶部: tabs */}
          <div
            style={{
              padding: "10px 16px 6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--ant-color-border-secondary)",
              position: "sticky",
              top: 0,
              background: "var(--ant-color-bg-container)",
              zIndex: 1,
            }}
          >
            <div style={{ display: "flex", gap: 4 }}>
              <TabButton active>功能 ({query ? items.length : allTools.length + extPlugins.reduce((s, p) => s + p.features.length, 0)})</TabButton>
              {query && <TabButton>匹配 ({items.length})</TabButton>}
            </div>
            {extPlugins.length > 0 && (
              <span style={{ fontSize: 11, color: "var(--ant-color-text-tertiary)" }}>
                📦 {extPlugins.length} 外部 · {extPlugins.reduce((s, p) => s + p.features.length, 0)} features
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "70%",
                color: "var(--ant-color-text-tertiary)",
                gap: 8,
                fontSize: 13,
              }}
            >
              <SearchOutlined style={{ fontSize: 28, opacity: 0.3 }} />
              <span>没有匹配的功能</span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>试试: base64 / uuid / json / http / 时间戳</span>
            </div>
          ) : (
            <div>
              {items.map((t) => (
                <FeatureRow
                  key={t.key}
                  tool={t}
                  active={t.key === activeKey}
                  onClick={() => onSelect(t.key)}
                  onHover={() => setActiveKey(t.key)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部: 状态栏 */}
      <div
        style={{
          padding: "6px 12px",
          borderTop: "1px solid var(--ant-color-border-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--ant-color-text-tertiary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Hint label="↑↓ 选择" />
          <Hint label="⏎ 打开" />
          <Hint label="esc 关闭" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onOpenMarket}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--ant-color-text-tertiary)",
              cursor: "pointer",
              fontSize: 11,
              padding: "2px 6px",
            }}
          >
            ◉ 插件应用市场
          </button>
          <span style={{ color: "var(--ant-color-border-secondary)" }}>|</span>
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
              padding: "2px 6px",
            }}
          >
            📁 打开目录
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
              padding: "2px 6px",
            }}
          >
            {extLoading ? "刷新中..." : "🔄 刷新"}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--ant-color-text-tertiary)",
              cursor: "pointer",
              fontSize: 11,
              padding: "2px 6px",
            }}
            title="关闭主窗口"
          >
            <CloseOutlined /> 关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          padding: "4px 12px",
          fontSize: 11,
          color: "var(--ant-color-text-tertiary)",
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 12px",
        margin: "1px 0",
        borderRadius: 6,
        background: active ? "var(--ant-color-fill-tertiary)" : "transparent",
        cursor: "pointer",
        fontSize: 13,
        color: active ? "var(--ant-color-primary)" : "var(--ant-color-text)",
        fontWeight: active ? 500 : 400,
        transition: "background 0.1s",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
        <span style={{ display: "inline-flex", width: 16, color: active ? "var(--ant-color-primary)" : "var(--ant-color-text-tertiary)" }}>
          {icon}
        </span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </span>
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            fontSize: 10,
            color: "var(--ant-color-text-tertiary)",
            background: "var(--ant-color-fill-tertiary)",
            padding: "0 5px",
            borderRadius: 8,
            minWidth: 18,
            textAlign: "center",
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function TabButton({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div
      style={{
        padding: "3px 10px",
        borderRadius: 4,
        fontSize: 12,
        background: active ? "var(--ant-color-primary-bg)" : "transparent",
        color: active ? "var(--ant-color-primary)" : "var(--ant-color-text)",
        fontWeight: active ? 500 : 400,
        cursor: "pointer",
      }}
    >
      {children}
    </div>
  );
}

function FeatureRow({
  tool,
  active,
  onClick,
  onHover,
}: {
  tool: ToolMeta;
  active: boolean;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <div
      data-sp-idx={tool.key}
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        background: active ? "var(--ant-color-primary-bg)" : "transparent",
        borderLeft: active ? "2px solid var(--ant-color-primary)" : "2px solid transparent",
        cursor: "pointer",
        transition: "background 0.08s",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          width: 22,
          height: 22,
          fontSize: 16,
          color: active ? "var(--ant-color-primary)" : "var(--ant-color-text)",
        }}
      >
        {tool.icon}
      </span>
      <span
        style={{
          fontSize: 13,
          color: active ? "var(--ant-color-primary)" : "var(--ant-color-text)",
          fontWeight: active ? 500 : 400,
          flex: "0 0 auto",
        }}
      >
        {tool.label}
      </span>
      {tool.cmds && tool.cmds.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginLeft: 4 }}>
          {tool.cmds.slice(0, 3).map((c) => (
            <span
              key={c}
              style={{
                fontSize: 11,
                padding: "1px 8px",
                background: "var(--ant-color-primary-bg)",
                color: "var(--ant-color-primary)",
                borderRadius: 10,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {c}
            </span>
          ))}
        </div>
      )}
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: "var(--ant-color-text-tertiary)",
          textAlign: "right",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={tool.description}
      >
        {tool.description}
      </span>
    </div>
  );
}

function Hint({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        background: "var(--ant-color-fill-tertiary)",
        borderRadius: 3,
        fontSize: 10,
      }}
    >
      {label}
    </span>
  );
}
