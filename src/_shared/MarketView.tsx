import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Badge } from "antd";
import {
  SearchOutlined,
  ArrowLeftOutlined,
  PushpinOutlined,
  SettingOutlined,
  SyncOutlined,
  CloseOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import { ALL_TOOLS, TOOL_GROUPS } from "../plugins/_registry";
import { useExtStore } from "../plugins/external/store";
import { openPluginsDir } from "../plugins/external/scanner";
import { useUiStore } from "../stores/uiStore";
import { DragHandle } from "./DragHandle";

interface MarketViewProps {
  onClose: () => void;
  onBack: () => void;
  onOpenMarketSources: () => void;
}

/**
 * 插件应用市场视图 (仿 utools 截图):
 *  - 顶部: 搜索框(4767 款插件应用...) + 📌 钉 + ⚙
 *  - 左侧: 已安装插件应用 (本地 builtin + 外部 ext)
 *  - 主区: 精选(1 大 + 4 小) + 排行榜 8 类
 *  - 底部: 立即登录 + 设置
 *
 * 数据策略:
 *  - "已安装" = builtin tools + ext plugins
 *  - "精选" / "排行榜" = mock 推荐(没有后端推荐系统, 从 builtin 工具里挑)
 */
export function MarketView({ onClose, onBack, onOpenMarketSources }: MarketViewProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<any>(null);
  const extPlugins = useExtStore((s) => s.plugins);
  const extLoading = useExtStore((s) => s.loading);
  const extRefresh = useExtStore((s) => s.refresh);
  const marketSources = useUiStore((s) => s.marketSources);
  const healthySources = marketSources.filter(
    (s) => s.enabled && s.cachedList && !s.lastError
  ).length;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus?.(), 50);
    return () => clearTimeout(t);
  }, []);

  // 已安装列表: builtin + 外部
  const installed = useMemo(() => {
    const items: Array<{ key: string; name: string; desc: string; icon: React.ReactNode; isExternal: boolean }> = [];
    for (const g of TOOL_GROUPS) {
      for (const t of g.tools) {
        items.push({
          key: t.key,
          name: t.label,
          desc: t.description,
          icon: t.icon,
          isExternal: false,
        });
      }
    }
    for (const p of extPlugins) {
      for (const f of p.features) {
        items.push({
          key: `ext::${p.id}::${f.code}`,
          name: f.explain,
          desc: `${p.name} · ${f.cmds?.join(" / ") ?? ""}`,
          icon: p.logoUrl ? <img src={p.logoUrl} style={{ width: 14, height: 14, borderRadius: 2 }} /> : <AppstoreOutlined />,
          isExternal: true,
        });
      }
    }
    return items;
  }, [extPlugins]);

  // 精选: 取 1 大 + 4 小 (从 builtin 挑有特色的, 实际 utools 是后端推荐)
  const featured = useMemo(() => {
    const pick = (key: string): { name: string; desc: string; icon: React.ReactNode; bg: string } => {
      const t = ALL_TOOLS.find((x) => x.key === key);
      if (!t) return { name: key, desc: "", icon: <AppstoreOutlined />, bg: "#f0f5ff" };
      const palettes: Record<string, string> = {
        hash: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        exchange: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
        timestamp: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
        http: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
        color: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
        jwt: "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
        json: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
        uuid: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
      };
      return { name: t.label, desc: t.description, icon: t.icon, bg: palettes[key] ?? "#f0f5ff" };
    };
    return {
      big: pick("hash"),
      small: [
        pick("exchange"),
        pick("timestamp"),
        pick("http"),
        pick("color"),
      ],
    };
  }, []);

  // 排行榜 8 类
  const rankings = useMemo(
    () => [
      {
        title: "最受欢迎",
        icon: "👍",
        desc: "社区热门工具",
        toolKey: "json",
        bg: "linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%)",
      },
      {
        title: "最新上架",
        icon: "🆕",
        desc: "本周新加入",
        toolKey: "uuid",
        bg: "linear-gradient(135deg, #a8e6cf 0%, #56ab91 100%)",
      },
      {
        title: "高效办公",
        icon: "👁",
        desc: "日常办公效率",
        toolKey: "exchange",
        bg: "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)",
      },
      {
        title: "AI 智能",
        icon: "👁",
        desc: "与 AI 同行",
        toolKey: "json",
        bg: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
      },
      {
        title: "记录想法",
        icon: "✏️",
        desc: "记录灵感",
        toolKey: "case",
        bg: "linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)",
      },
      {
        title: "系统工具",
        icon: "🛡",
        desc: "提升系统效能",
        toolKey: "clipboard",
        bg: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
      },
      {
        title: "开始探索",
        icon: "🧠",
        desc: "突破思维",
        toolKey: "diff",
        bg: "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)",
      },
      {
        title: "uTools 官方出品",
        icon: "👍",
        desc: "精心打造",
        toolKey: "base64",
        bg: "linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)",
      },
    ],
    []
  );

  const filteredInstalled = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return installed;
    return installed.filter((it) =>
      (it.name + " " + it.desc).toLowerCase().includes(q)
    );
  }, [installed, query]);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--ant-color-bg-container)",
      }}
    >
      {/* 顶部: 搜索框 + 操作按钮(整条可拖) */}
      <DragHandle
        right={null}
        showGrip={true}
      >
        <button
          onClick={onBack}
          data-no-drag
          style={{
            background: "transparent",
            border: 0,
            color: "var(--ant-color-text-tertiary)",
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            padding: "0 4px",
          }}
          title="返回主面板"
        >
          <ArrowLeftOutlined />
        </button>
        <div style={{ flex: 1 }}>
          <Input
            ref={inputRef}
            size="middle"
            data-no-drag
            prefix={
              <SearchOutlined style={{ fontSize: 16, color: "var(--ant-color-text-tertiary)" }} />
            }
            placeholder={`搜索 ${installed.length + 4767} 款插件应用...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            variant="borderless"
            style={{ fontSize: 15, height: 32 }}
            allowClear
          />
        </div>
      </DragHandle>
      {/* 工具栏第二行(单独的 no-drag 区域),保持与原本相同的按钮组 */}
      <div
        data-no-drag
        style={{
          padding: "4px 12px 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          borderBottom: "1px solid var(--ant-color-border-secondary)",
        }}
      >
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
            fontSize: 14,
            padding: 6,
          }}
          title="打开插件目录"
        >
          <SettingOutlined />
        </button>
        <button
          onClick={onOpenMarketSources}
          style={{
            background: marketSources.length === 0 ? "var(--ant-color-primary-bg)" : "transparent",
            border: 0,
            color: marketSources.length === 0 ? "var(--ant-color-primary)" : "var(--ant-color-text-tertiary)",
            cursor: "pointer",
            fontSize: 14,
            padding: 6,
            borderRadius: 4,
          }}
          title={
            marketSources.length === 0
              ? "添加市场源(填一个 https://... 拉取远程插件)"
              : `管理市场源 (${healthySources}/${marketSources.length} 健康)`
          }
        >
          <Badge
            count={marketSources.length}
            size="small"
            offset={[-2, 2]}
            color={marketSources.length === 0 ? "red" : healthySources === marketSources.length ? "#52c41a" : "#faad14"}
          >
            <WifiOutlined />
          </Badge>
        </button>
        <button
          onClick={() => extRefresh()}
          disabled={extLoading}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--ant-color-text-tertiary)",
            cursor: extLoading ? "wait" : "pointer",
            fontSize: 14,
            padding: 6,
          }}
          title="刷新"
        >
          {extLoading ? <SyncOutlined spin /> : <ReloadOutlined />}
        </button>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--ant-color-text-tertiary)",
            cursor: "pointer",
            fontSize: 14,
            padding: 6,
          }}
          title="关闭"
        >
          <PushpinOutlined />
        </button>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--ant-color-text-tertiary)",
            cursor: "pointer",
            fontSize: 14,
            padding: 6,
          }}
          title="关闭主窗口"
        >
          <CloseOutlined />
        </button>
      </div>

      {/* 主体: 左侧已安装 + 主区精选/排行榜 */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* 左侧: 已安装 */}
        <div
          style={{
            width: 200,
            borderRight: "1px solid var(--ant-color-border-secondary)",
            padding: "12px 8px",
            overflowY: "auto",
            background: "var(--ant-color-bg-container)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 12px 8px",
              fontSize: 12,
              color: "var(--ant-color-text)",
              fontWeight: 500,
            }}
          >
            <span>已安装插件应用 ({installed.length})</span>
            <span style={{ color: "var(--ant-color-text-tertiary)" }}>···</span>
          </div>
          {filteredInstalled.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 12px",
                color: "var(--ant-color-text-tertiary)",
                fontSize: 12,
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: "var(--ant-color-fill-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppstoreOutlined style={{ fontSize: 24, opacity: 0.3 }} />
              </div>
              <span>{query ? "无匹配插件" : "尚未安装任何插件应用"}</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {filteredInstalled.slice(0, 50).map((it) => (
                <div
                  key={it.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "var(--ant-color-text)",
                    cursor: "default",
                  }}
                >
                  <span style={{ display: "inline-flex", width: 14, color: "var(--ant-color-text-tertiary)" }}>
                    {it.icon}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.name}
                  </span>
                  {it.isExternal && (
                    <span style={{ fontSize: 10, color: "#722ed1" }}>📦</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 主区: 精选 + 排行榜 */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--ant-color-bg-layout)" }}>
          {query ? (
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 12, fontSize: 14, color: "var(--ant-color-text)" }}>
                搜索 "{query}" 的插件应用 ({filteredInstalled.length})
              </div>
            </div>
          ) : (
            <>
              {/* 精选区 */}
              <div style={{ padding: "20px 24px 0" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600 }}>精选</div>
                  <div style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--ant-color-text-tertiary)" }}>
                    <span style={{ cursor: "pointer" }}>🔄</span>
                    <span style={{ cursor: "pointer" }}>换一批</span>
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr",
                    gridTemplateRows: "1fr 1fr",
                    gap: 12,
                    height: 220,
                  }}
                >
                  {/* 大卡 (左 1 大, 占 2 行) */}
                  <div
                    className="zBizMarketCard"
                    style={{
                      gridRow: "1 / 3",
                      gridColumn: "1 / 2",
                      borderRadius: 14,
                      background: featured.big.bg,
                      padding: 22,
                      color: "white",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      boxShadow:
                        "0 4px 16px -4px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1) inset",
                      position: "relative",
                      overflow: "hidden",
                      transition: "all 0.24s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform =
                        "translateY(-2px) scale(1.01)";
                      (e.currentTarget as HTMLElement).style.boxShadow =
                        "0 12px 32px -8px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.15) inset";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)";
                      (e.currentTarget as HTMLElement).style.boxShadow =
                        "0 4px 16px -4px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1) inset";
                    }}
                  >
                    {/* 装饰圆环 */}
                    <div
                      style={{
                        position: "absolute",
                        right: -40,
                        top: -40,
                        width: 160,
                        height: 160,
                        borderRadius: "50%",
                        background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)",
                        pointerEvents: "none",
                      }}
                    />
                    <div style={{ fontSize: 40, color: "rgba(255,255,255,0.95)", position: "relative" }}>
                      {featured.big.icon}
                    </div>
                    <div style={{ position: "relative" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, letterSpacing: 0.3 }}>
                        {featured.big.name}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.92, lineHeight: 1.4 }}>
                        {featured.big.desc}
                      </div>
                    </div>
                  </div>
                  {/* 4 个小卡 */}
                  {featured.small.map((s, i) => (
                    <div
                      key={i}
                      className="zBizMarketCard"
                      style={{
                        borderRadius: 12,
                        background: s.bg,
                        padding: 14,
                        color: "white",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        boxShadow:
                          "0 2px 8px -2px rgba(0,0,0,0.16), 0 0 0 1px rgba(255,255,255,0.1) inset",
                        position: "relative",
                        overflow: "hidden",
                        transition: "all 0.16s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.transform =
                          "translateY(-3px) scale(1.02)";
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          "0 8px 24px -4px rgba(0,0,0,0.24), 0 0 0 1px rgba(255,255,255,0.18) inset";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform =
                          "translateY(0) scale(1)";
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          "0 2px 8px -2px rgba(0,0,0,0.16), 0 0 0 1px rgba(255,255,255,0.1) inset";
                      }}
                    >
                      <div
                        style={{
                          fontSize: 24,
                          color: "rgba(255,255,255,0.95)",
                          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))",
                        }}
                      >
                        {s.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.2 }}>{s.name}</div>
                        <div
                          style={{
                            fontSize: 11,
                            opacity: 0.88,
                            lineHeight: 1.35,
                            marginTop: 2,
                          }}
                        >
                          {s.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 排行榜 8 类 */}
              <div style={{ padding: "20px 24px 16px" }}>
                <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>排行榜</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  {rankings.map((r) => (
                    <div
                      key={r.title}
                      className="zBizRankingItem"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 10,
                        background: r.bg,
                        color: "var(--ant-color-text)",
                        cursor: "pointer",
                        minHeight: 56,
                        transition: "all 0.16s cubic-bezier(0.4, 0, 0.2, 1)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.transform =
                          "translateY(-1px)";
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          "0 4px 12px -2px rgba(0,0,0,0.12)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "none";
                      }}
                    >
                      <div
                        style={{
                          fontSize: 24,
                          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                        }}
                      >
                        {r.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.2 }}>
                          {r.title}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--ant-color-text-tertiary)",
                            marginTop: 2,
                          }}
                        >
                          {r.desc}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--ant-color-text-tertiary)",
                        }}
                      >
                        ›
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ height: 24 }} />
            </>
          )}
        </div>
      </div>

      {/* 底部: 立即登录 + 设置 */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--ant-color-border-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--ant-color-text-tertiary)",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "var(--ant-color-fill-tertiary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <RocketOutlined style={{ fontSize: 12 }} />
          </div>
          <span>立即登录</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--ant-color-text-tertiary)" }}>
          <CheckCircleOutlined style={{ color: "#52c41a" }} />
          <span>已加载 {installed.length} 个插件</span>
        </div>
        <SettingOutlined style={{ cursor: "pointer" }} />
      </div>
    </div>
  );
}
