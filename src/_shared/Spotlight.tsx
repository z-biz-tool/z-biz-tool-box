import { useEffect, useMemo, useRef, useState } from "react";
import { Input, message } from "antd";
import {
  SearchOutlined,
  AppstoreOutlined,
  SettingOutlined,
  StarOutlined,
  RocketOutlined,
  KeyOutlined,
  ToolOutlined,
  CloseOutlined,
  EnterOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  GlobalOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { ALL_TOOLS, TOOL_GROUPS } from "../plugins/_registry";
import type { ToolMeta } from "../plugins/_types";
import { rankDocs } from "../plugins/searchScore";
import { useUiStore } from "../stores/uiStore";
import { useExtStore } from "../plugins/external/store";
import { openPluginsDir } from "../plugins/external/scanner";
import { DragHandle } from "./DragHandle";
import {
  motion,
  size,
  hoverBackground,
} from "./designTokens";


interface SpotlightProps {
  onSelect: (key: string) => void;
  onClose: () => void;
  onOpenMarket: () => void;
  onOpenPreferences: () => void;
  onOpenShortcuts: () => void;
  onOpenMarketSources: () => void;
  onOpenBrothers: () => void;
}

type NavKey = "all" | "builtin" | "external" | "starred" | "recent";

/**
 * uTools 风格主面板 (三列布局) — 玻璃态现代设计:
 *  - 顶栏: 渐变背景 + 玻璃模糊
 *  - 左/中列: 极简导航, 圆角 hover/active
 *  - 右列功能行: 渐变 active 背景 + scale 1.005 + 阴影 + cmds chip 渐变
 */
export function Spotlight({ onSelect, onClose, onOpenMarket, onOpenPreferences, onOpenShortcuts, onOpenMarketSources, onOpenBrothers }: SpotlightProps) {
  const [query, setQuery] = useState("");
  const [activeNav, setActiveNav] = useState<NavKey>("all");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeKey, setActiveKey] = useState<string>("");
  const inputRef = useRef<any>(null);

  const starred = useUiStore((s) => s.starred);
  const recent = useUiStore((s) => s.recent);
  const disabled = useUiStore((s) => s.disabled);
  const sourcesCount = useUiStore((s) => s.marketSources.length);
  const extPlugins = useExtStore((s) => s.plugins);
  const extLoading = useExtStore((s) => s.loading);
  const extError = useExtStore((s) => s.error);
  const extRefresh = useExtStore((s) => s.refresh);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus?.(), 50);
    return () => clearTimeout(t);
  }, []);

  const allTools = useMemo(
    () => ALL_TOOLS.filter((t) => !disabled.includes(t.key)),
    [disabled]
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    let pool: ToolMeta[] = [];

    if (activeNav === "all") {
      pool = allTools;
    } else if (activeNav === "builtin") {
      pool = allTools;
    } else if (activeNav === "external") {
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

    if ((activeNav === "all" || activeNav === "builtin") && activeCategory !== "all") {
      if (activeCategory === "external") {
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
          if (t.key.startsWith("ext::")) return false;
          return t.group === activeCategory;
        });
      }
    }

    if (q) {
      // 台账 T3.5：统一打分（精确/前缀/首字母/子串），同档内按最近使用与收藏排序。
      pool = rankDocs(q, pool, { recent, starred });
    }

    // 收藏/最近的中列是二级筛选：点某一项要真的收窄右列，否则就是死按钮。
    if ((activeNav === "starred" || activeNav === "recent") && activeCategory !== "all") {
      pool = pool.filter((t) => t.key === activeCategory);
    }

    return pool;
  }, [activeNav, activeCategory, query, allTools, starred, recent, extPlugins, disabled]);

  useEffect(() => {
    if (items.length > 0 && (!activeKey || !items.find((t) => t.key === activeKey))) {
      setActiveKey(items[0].key);
    }
    if (items.length === 0) setActiveKey("");
  }, [items, activeKey]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 输入法组字期间的 Enter/方向键属于输入法，不是"打开工具"
      if (e.isComposing) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        const idx = items.findIndex((t) => t.key === activeKey);
        const next = items[Math.min(items.length - 1, idx + 1)];
        if (next) setActiveKey(next.key);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        const idx = items.findIndex((t) => t.key === activeKey);
        const prev = items[Math.max(0, idx - 1)];
        if (prev) setActiveKey(prev.key);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const cur = items.find((t) => t.key === activeKey);
        if (cur) onSelect(cur.key);
      } else if (e.key === "Escape") {
        // App 也在 window 上监听 Esc 并隐藏窗口。这里用捕获阶段先拿到：
        // 有查询词时先清查询（并阻止 App 隐藏），没有查询词时交回 App。
        if (query) {
          e.preventDefault();
          e.stopPropagation();
          setQuery("");
        }
      }
    };
    // 捕获阶段：必须比 App.tsx 的 Esc 处理器更早，否则一下 Esc 既清空又隐藏窗口
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [items, activeKey, onSelect, query]);

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
      {/* 顶栏: 渐变 + 玻璃模糊 + 可拖动 */}
      <DragHandle>
        <Input
          ref={inputRef}
          size="middle"
          data-no-drag
          data-tauri-drag-region="false"
          prefix={
            <SearchOutlined
              style={{
                fontSize: 16,
                color: "var(--ant-color-primary)",
                opacity: 0.7,
              }}
            />
          }
          placeholder="搜索功能 / 粘贴文件、图片"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          variant="borderless"
          style={{ 
            fontSize: 15, 
            height: 32, 
            fontWeight: 500,
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow = '0 2px 12px rgba(102,126,234,0.2)';
            e.currentTarget.style.border = '1px solid rgba(102,126,234,0.3)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
            e.currentTarget.style.border = '';
          }}
          allowClear
        />
      </DragHandle>

      {/* 主体: 三列 */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* 左列: 导航 */}
        <div
          className="zBizScroll"
          style={{
            width: size.navWidth,
            borderRight: "1px solid var(--ant-color-border-secondary)",
            padding: "10px 8px",
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
              icon={<AppstoreOutlined style={{ color: "#a855f7" }} />}
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
              icon={<StarOutlined style={{ color: "#f59e0b" }} />}
              label="我的收藏"
              active={activeNav === "starred"}
              onClick={() => {
                setActiveNav("starred");
                setActiveCategory("all");
              }}
              badge={starred.length}
            />
            <NavItem
              icon={<RocketOutlined style={{ color: "#06b6d4" }} />}
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
              icon={<AppstoreOutlined />}
              label="家族应用"
              onClick={onOpenBrothers}
            />
            <NavItem
              icon={<SettingOutlined />}
              label="偏好设置"
              onClick={onOpenPreferences}
            />
            <NavItem
              icon={<KeyOutlined />}
              label="快捷键"
              onClick={onOpenShortcuts}
            />
            <NavItem
              icon={<GlobalOutlined />}
              label="市场源管理"
              onClick={onOpenMarketSources}
              badge={sourcesCount > 0 ? sourcesCount : undefined}
              active={false}
            />
          </NavSection>
        </div>

        {/* 中列: 分类 */}
        <div
          className="zBizScroll"
          style={{
            width: size.categoryWidth,
            borderRight: "1px solid var(--ant-color-border-secondary)",
            padding: "10px 8px",
            overflowY: "auto",
            background: "var(--ant-color-bg-container)",
          }}
        >
          {(activeNav === "all" || activeNav === "builtin") && (
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
                icon={<AppstoreOutlined style={{ color: "#a855f7" }} />}
                label="外部插件"
                active={activeCategory === "external"}
                onClick={() => setActiveCategory("external")}
                badge={extPlugins.length}
              />
            </NavSection>
          )}

          {activeNav === "external" && (
            <NavSection title="外部插件">
              {extError ? (
                <div style={{ padding: "4px 10px 8px", fontSize: 11, lineHeight: 1.5 }}>
                  <div style={{ color: "var(--ant-color-warning)", display: "flex", gap: 4 }}>
                    <WarningOutlined style={{ marginTop: 3 }} />
                    <span>{extError}</span>
                  </div>
                  <button
                    className="zBizToolbarBtn"
                    onClick={() => void extRefresh()}
                    style={{
                      marginTop: 6,
                      background: "transparent",
                      border: "1px solid var(--ant-color-border)",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontSize: 11,
                      color: "var(--ant-color-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    重新扫描
                  </button>
                </div>
              ) : extLoading && extPlugins.length === 0 ? (
                <EmptyHint text="正在扫描插件目录…" />
              ) : extPlugins.length === 0 ? (
                <EmptyHint text="还没有外部插件" sub="点击右下「打开目录」" />
              ) : (
                extPlugins.map((p) => (
                  <NavItem
                    key={p.id}
                    icon={
                      p.logoUrl ? (
                        <img src={p.logoUrl} style={{ width: 14, height: 14, borderRadius: 2 }} />
                      ) : (
                        <AppstoreOutlined style={{ color: "#a855f7" }} />
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
                <EmptyHint text="还没有收藏" sub="工具右上角星标后会出现在这里" />
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
                      onClick={() =>
                        setActiveCategory((prev) => (prev === k ? "all" : k))
                      }
                    />
                  );
                })
              )}
            </NavSection>
          )}

          {activeNav === "recent" && (
            <NavSection title="最近使用">
              {recent.length === 0 ? (
                <EmptyHint text="还没有记录" sub="打开一个工具后会自动记录" />
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
                      onClick={() =>
                        setActiveCategory((prev) => (prev === k ? "all" : k))
                      }
                    />
                  );
                })
              )}
            </NavSection>
          )}
        </div>

        {/* 右列: 功能列表 */}
        <div
          className="zBizScroll"
          style={{
            flex: 1,
            overflowY: "auto",
            background: "var(--ant-color-bg-container)",
          }}
        >
          <div
            style={{
              padding: "12px 16px 8px",
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
              <TabButton active>
                功能 ({query ? items.length : allTools.length + extPlugins.reduce((s, p) => s + p.features.length, 0)})
              </TabButton>
              {query && <TabButton>匹配 ({items.length})</TabButton>}
            </div>
            {extPlugins.length > 0 && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ant-color-text-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#a855f7",
                    boxShadow: "0 0 8px rgba(168,85,247,0.5)",
                  }}
                />
                {extPlugins.length} 外部 · {extPlugins.reduce((s, p) => s + p.features.length, 0)} features
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
                gap: 10,
                fontSize: 13,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.06) 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SearchOutlined style={{ fontSize: 24, opacity: 0.4 }} />
              </div>
              <span>
                {query
                  ? "没有匹配的功能"
                  : activeNav === "external"
                  ? extError
                    ? "外部插件列表不可用"
                    : "还没有外部插件"
                  : activeNav === "starred"
                  ? "还没有收藏"
                  : activeNav === "recent"
                  ? "还没有使用记录"
                  : "没有可显示的工具"}
              </span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {query
                  ? "试试: base64 / uuid / json / http / 时间戳"
                  : activeNav === "external"
                  ? extError
                    ? "浏览器预览没有桌面能力；桌面版请检查插件目录与权限声明"
                    : "把插件放进插件目录后会自动出现"
                  : activeNav === "starred"
                  ? "在工具右上角点星标即可收藏"
                  : activeNav === "recent"
                  ? "打开任意工具后会出现在这里"
                  : "工具被禁用时不会出现在这里，可在偏好设置里重新启用"}
              </span>
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

      {/* 底栏: 玻璃态 */}
      <div
        style={{
          padding: "6px 14px",
          borderTop: "1px solid var(--ant-color-border-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--ant-color-text-tertiary)",
          background: "var(--ant-color-bg-container)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Hint icon={<ArrowUpOutlined />} icon2={<ArrowDownOutlined />} label="选择" />
          <Hint icon={<EnterOutlined />} label="打开" />
          <Hint label="esc 关闭" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <ToolbarButton onClick={onOpenMarket} highlight>
            ◉ 插件应用市场
          </ToolbarButton>
          <span style={{ color: "var(--ant-color-border-secondary)" }}>|</span>
          <ToolbarButton
            onClick={async () => {
              try {
                await openPluginsDir();
              } catch (e) {
                // 契约：不可用要说明原因，不能点了没反应
                message.error(
                  `打开插件目录失败：${e instanceof Error ? e.message : String(e)}（外部插件目录只有桌面版可访问）`
                );
              }
            }}
          >
            📁 打开目录
          </ToolbarButton>
          <ToolbarButton onClick={() => extRefresh()} disabled={extLoading}>
            {extLoading ? "刷新中..." : "🔄 刷新"}
          </ToolbarButton>
          <ToolbarButton onClick={onClose}>
            <CloseOutlined /> 关闭
          </ToolbarButton>
        </div>
      </div>
    </div>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          padding: "4px 12px 6px",
          fontSize: 10,
          color: "var(--ant-color-text-tertiary)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
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
      role="button"
      tabIndex={0}
      aria-pressed={!!active}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      className="zBizNavItem"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "7px 12px",
        margin: "1px 0",
        borderRadius: 8,
        background: active
          ? "linear-gradient(90deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.08) 100%)"
          : "transparent",
        cursor: "pointer",
        fontSize: 13,
        color: active ? "var(--ant-color-primary)" : "var(--ant-color-text)",
        fontWeight: active ? 600 : 400,
        transition: `all ${motion.fast}`,
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = hoverBackground(false);
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: "0 3px 3px 0",
            background: "linear-gradient(180deg, #6366f1 0%, #a855f7 100%)",
          }}
        />
      )}
      <span style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
        <span
          style={{
            display: "inline-flex",
            width: 16,
            color: active ? "var(--ant-color-primary)" : "var(--ant-color-text-tertiary)",
            transition: `color ${motion.fast}`,
          }}
        >
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
            color: active ? "var(--ant-color-primary)" : "var(--ant-color-text-tertiary)",
            background: active
              ? "rgba(99,102,241,0.15)"
              : "var(--ant-color-fill-tertiary)",
            padding: "1px 6px",
            borderRadius: 999,
            minWidth: 18,
            textAlign: "center",
            fontWeight: 500,
            transition: `all ${motion.fast}`,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function TabButton({ children, active }: { children: React.ReactNode; active?: boolean }) {
  // 只是统计标签，不是可切换的页签：不要给它 cursor:pointer 假装能点。
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 6,
        fontSize: 12,
        background: active
          ? "linear-gradient(90deg, rgba(99,102,241,0.14) 0%, rgba(139,92,246,0.08) 100%)"
          : "transparent",
        color: active ? "var(--ant-color-primary)" : "var(--ant-color-text-tertiary)",
        fontWeight: active ? 600 : 400,
        userSelect: "none",
      }}
    >
      {children}
    </span>
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
      role="button"
      tabIndex={0}
      aria-label={`${tool.label}：${tool.description}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 18px",
        background: active
          ? "linear-gradient(90deg, rgba(99,102,241,0.14) 0%, rgba(139,92,246,0.04) 100%)"
          : "transparent",
        borderLeft: active
          ? "3px solid transparent"
          : "3px solid transparent",
        cursor: "pointer",
        transition: `all ${motion.fast}`,
        position: "relative",
        transform: active ? "translateX(2px)" : "translateX(0)",
      }}
    >
      {active && (
        <>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 6,
              bottom: 6,
              width: 3,
              borderRadius: "0 3px 3px 0",
              background: "linear-gradient(180deg, #6366f1 0%, #a855f7 100%)",
              boxShadow: "0 0 8px rgba(99,102,241,0.4)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              top: 0,
              bottom: 0,
              background: "linear-gradient(90deg, rgba(99,102,241,0.06) 0%, transparent 100%)",
              pointerEvents: "none",
              borderRadius: 8,
            }}
          />
        </>
      )}
      <span
        style={{
          display: "inline-flex",
          width: 24,
          height: 24,
          fontSize: 18,
          color: active ? "var(--ant-color-primary)" : "var(--ant-color-text)",
          alignItems: "center",
          justifyContent: "center",
          transition: `all ${motion.fast}`,
          transform: active ? "scale(1.1)" : "scale(1)",
        }}
      >
        {tool.icon}
      </span>
      <span
        style={{
          fontSize: 13,
          color: active ? "var(--ant-color-primary)" : "var(--ant-color-text)",
          fontWeight: active ? 600 : 500,
          flex: "0 0 auto",
          transition: `all ${motion.fast}`,
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
                fontSize: 10,
                padding: "2px 8px",
                background: active
                  ? "linear-gradient(90deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.12) 100%)"
                  : "var(--ant-color-fill-tertiary)",
                color: active ? "var(--ant-color-primary)" : "var(--ant-color-text-tertiary)",
                borderRadius: 999,
                fontWeight: 500,
                whiteSpace: "nowrap",
                letterSpacing: 0.2,
                transition: `all ${motion.fast}`,
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
          fontSize: 11,
          color: "var(--ant-color-text-tertiary)",
          textAlign: "right",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 220,
        }}
        title={tool.description}
      >
        {tool.description}
      </span>
    </div>
  );
}

function Hint({ icon, icon2, label }: { icon?: React.ReactNode; icon2?: React.ReactNode; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10,
      }}
    >
      {icon && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            padding: "1px 5px",
            background: "var(--ant-color-fill-tertiary)",
            borderRadius: 4,
            fontSize: 10,
            color: "var(--ant-color-text-secondary)",
          }}
        >
          {icon} {icon2}
        </span>
      )}
      <span style={{ color: "var(--ant-color-text-tertiary)" }}>{label}</span>
    </span>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  highlight,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="zBizToolbarBtn"
      style={{
        background: highlight
          ? "linear-gradient(90deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)"
          : "transparent",
        border: 0,
        color: highlight ? "var(--ant-color-primary)" : "var(--ant-color-text-tertiary)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 11,
        padding: "3px 8px",
        borderRadius: 6,
        fontWeight: highlight ? 500 : 400,
        transition: `all ${motion.fast}`,
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.background = hoverBackground(false);
      }}
      onMouseLeave={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLElement).style.background = highlight
            ? "linear-gradient(90deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)"
            : "transparent";
      }}
    >
      {children}
    </button>
  );
}

function EmptyHint({ text, sub }: { text: string; sub?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 12px 8px",
        color: "var(--ant-color-text-tertiary)",
        fontSize: 12,
        textAlign: "center",
        gap: 4,
      }}
    >
      <span>{text}</span>
      {sub && <span style={{ fontSize: 11, opacity: 0.7 }}>{sub}</span>}
    </div>
  );
}
