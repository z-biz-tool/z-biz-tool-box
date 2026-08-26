import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Badge, message, Popconfirm, Tag, Typography } from "antd";
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
  DeleteOutlined,
} from "@ant-design/icons";
import { TOOL_GROUPS } from "../plugins/_registry";
import { useExtStore } from "../plugins/external/store";
import { openPluginsDir, uninstallLocalPlugin } from "../plugins/external/scanner";
import { useUiStore } from "../stores/uiStore";
import { DragHandle } from "./DragHandle";
import { isNewer } from "../plugins/external/market";
import { installRemotePlugin } from "../plugins/external/installer";
import type { MarketSource, MarketPluginEntry } from "../plugins/external/types";

interface MarketViewProps {
  onClose: () => void;
  onBack: () => void;
  onOpenMarketSources: () => void;
  /** 点击左列已装工具 — 切到 ToolView */
  onSelectTool: (key: string) => void;
}

/**
 * 插件应用市场视图 (仿 utools 截图):
 *  - 顶部: 搜索框(4767 款插件应用...) + 📌 钉 + ⚙
 *  - 左侧: 已安装插件应用 (本地 builtin + 外部 ext)
 *  - 主区: 精选(1 大 + 4 小) + 排行榜 8 类
 *  - 底部: 立即登录 + 设置
 *
 * 数据策略:
 *  - "已安装" (左列) = builtin tools + ext plugins
 *  - "按源分组的远程插件" (右列) = 所有 enabled 源 cachedList.plugins,
 *    按源分组, 每个插件标注"未装" / "已装" / "有新版本"
 */
export function MarketView({ onClose, onBack, onOpenMarketSources, onSelectTool }: MarketViewProps) {
  const [query, setQuery] = useState("");
  const [rightTab, setRightTab] = useState<"builtin" | "market">("builtin");
  const [installing, setInstalling] = useState<string | null>(null);
  const inputRef = useRef<any>(null);

  // 切 tab 时清搜索框, 避免跨 tab 名字/筛选污染
  const switchTab = (t: "builtin" | "market") => {
    if (t !== rightTab) {
      setRightTab(t);
      setQuery(""); // 重置搜索
    }
  };
  const extPlugins = useExtStore((s) => s.plugins);
  const extLoading = useExtStore((s) => s.loading);
  const extRefresh = useExtStore((s) => s.refresh);
  const marketSources = useUiStore((s) => s.marketSources);
  const disabled = useUiStore((s) => s.disabled);
  const healthySources = marketSources.filter(
    (s) => s.enabled && s.cachedList && !s.lastError
  ).length;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus?.(), 50);
    return () => clearTimeout(t);
  }, []);

  // 已安装列表: builtin + 外部
  const installed = useMemo(() => {
    const items: Array<{
      key: string;
      name: string;
      desc: string;
      icon: React.ReactNode;
      isExternal: boolean;
      pluginId?: string; // external 才有,用于卸载
    }> = [];
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
          pluginId: p.id, // 卸载时用 — 删整个插件目录
        });
      }
    }
    return items;
  }, [extPlugins]);

  // 本地 ext 插件 map: id -> ExternalPlugin(用于版本比较)
  const installedExtMap = useMemo(
    () => new Map(extPlugins.filter((p) => !p.error).map((p) => [p.id, p])),
    [extPlugins]
  );

  // 按源分组的远程插件列表
  // - 全部展示, 不跳过已装同版的(让用户看到当前状态)
  // - 未装的标 "未装" + "安装" 按钮
  // - 已装同版的标 "已装" + 不显示按钮(占位)
  // - 已装但有更新的标 "有更新" + v_old → v_new + "更新" 按钮
  const marketGroups = useMemo(() => {
    const groups: Array<{
      source: MarketSource;
      plugins: Array<{
        key: string;
        entry: MarketPluginEntry;
        installed: boolean;
        isUpdate: boolean;
        localVersion?: string;
      }>;
    }> = [];
    for (const src of marketSources) {
      if (!src.enabled || !src.cachedList) continue;
      const items = src.cachedList.plugins.map((p) => {
        const local = installedExtMap.get(p.id);
        const localV = local?.version ?? "";
        const isUpdate = Boolean(local && localV && isNewer(p.version, localV));
        return {
          key: `${src.id}::${p.id}`,
          entry: p,
          installed: !!local,
          isUpdate,
          localVersion: localV || undefined,
        };
      });
      if (items.length > 0) {
        groups.push({ source: src, plugins: items });
      }
    }
    return groups;
  }, [marketSources, installedExtMap]);

  // 装/更新远程插件
  const handleInstall = async (
    source: MarketSource,
    entry: MarketPluginEntry,
    key: string
  ) => {
    setInstalling(key);
    try {
      await installRemotePlugin(source, entry);
      message.success(`已安装 ${entry.name}`);
      await extRefresh();
    } catch (e) {
      message.error(`安装失败: ${String(e)}`);
    } finally {
      setInstalling(null);
    }
  };

  // 跟踪加载失败的 icon — 失败的 fallback 到首字母 + 渐变
  const [iconErrors, setIconErrors] = useState<Set<string>>(new Set());
  const markIconError = (key: string) =>
    setIconErrors((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });

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
              ? "添加市场源(填一个 http(s)://... 拉取远程插件)"
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
                  data-no-drag
                  onClick={() => onSelectTool(it.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "var(--ant-color-text)",
                    cursor: "pointer",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--ant-color-fill-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
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
                  {it.isExternal && it.pluginId && (
                    <Popconfirm
                      title="卸载该外部插件?"
                      description="会从 ~/.z-biz-tools/plugins/ 物理删除"
                      okText="卸载"
                      cancelText="取消"
                      okType="danger"
                      onConfirm={async (e) => {
                        e?.stopPropagation();
                        try {
                          await uninstallLocalPlugin(it.pluginId!);
                          message.success(`已卸载 ${it.name}`);
                        } catch (err) {
                          message.error(`卸载失败: ${String(err)}`);
                        }
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <button
                        data-no-drag
                        title="卸载"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          background: "transparent",
                          border: 0,
                          color: "var(--ant-color-text-tertiary)",
                          cursor: "pointer",
                          padding: "0 4px",
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          borderRadius: 3,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.color = "#ff4d4f";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color =
                            "var(--ant-color-text-tertiary)";
                        }}
                      >
                        <DeleteOutlined />
                      </button>
                    </Popconfirm>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 主区: tab 切换 [已装 / 远程] */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--ant-color-bg-layout)" }}>
          {/* tab 切换条 */}
          <div
            data-no-drag
            style={{
              padding: "12px 24px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              borderBottom: "1px solid var(--ant-color-border-secondary)",
            }}
          >
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => switchTab("builtin")}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  background: rightTab === "builtin" ? "var(--ant-color-primary)" : "transparent",
                  color: rightTab === "builtin" ? "white" : "var(--ant-color-text)",
                  border: 0,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                🏠 内置 ({TOOL_GROUPS.reduce((s, g) => s + g.tools.filter(t => !disabled.includes(t.key)).length, 0)})
              </button>
              <button
                onClick={() => switchTab("market")}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  background: rightTab === "market" ? "var(--ant-color-primary)" : "transparent",
                  color: rightTab === "market" ? "white" : "var(--ant-color-text)",
                  border: 0,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                🛒 市场 ({extPlugins.filter(p => !p.error).length} /{" "}
                {marketGroups.reduce((s, g) => s + g.plugins.length, 0)})
              </button>
            </div>
            {rightTab === "market" && (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {extPlugins.filter(p => !p.error).length} 已装 /{" "}
                {marketGroups.reduce((s, g) => s + g.plugins.length, 0)} 可装
              </Typography.Text>
            )}
          </div>

          {query ? (
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 12, fontSize: 14, color: "var(--ant-color-text)" }}>
                搜索 "{query}" 的已装插件 ({filteredInstalled.length})
              </div>
            </div>
          ) : rightTab === "builtin" ? (
            // 内置 tab — 按 TOOL_GROUPS 展示 builtin 工具
            <div style={{ padding: "16px 24px 32px" }}>
              {TOOL_GROUPS.map((g) => {
                const groupTools = g.tools.filter((t) => !disabled.includes(t.key));
                if (groupTools.length === 0) return null;
                return (
                  <div key={g.key} style={{ marginBottom: 24 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {g.icon}
                      <span>{g.label}</span>
                      <span style={{ color: "var(--ant-color-text-tertiary)", fontWeight: 400 }}>
                        ({groupTools.length})
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: 8,
                      }}
                    >
                      {groupTools.map((t) => (
                        <div
                          key={t.key}
                          data-no-drag
                          onClick={() => onSelectTool(t.key)}
                          style={{
                            background: "var(--ant-color-bg-container)",
                            border: "1px solid var(--ant-color-border-secondary)",
                            borderRadius: 8,
                            padding: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                            transition: "all 0.16s",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor =
                              "var(--ant-color-primary)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor =
                              "var(--ant-color-border-secondary)";
                          }}
                        >
                          <span style={{ fontSize: 14, color: "var(--ant-color-primary)" }}>
                            {t.icon}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // 市场 tab: 已装的 ext 插件 + 按源分组的远程插件
            <div style={{ padding: "16px 24px 32px" }}>
              {/* 第一段: 已装的 external 插件 (从 extPlugins) */}
              {extPlugins.filter(p => !p.error).length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 12,
                      paddingBottom: 8,
                      borderBottom: "1px solid var(--ant-color-border-secondary)",
                    }}
                  >
                    <AppstoreOutlined style={{ color: "#722ed1" }} />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>已装的市场插件</div>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      ({extPlugins.filter(p => !p.error).length})
                    </Typography.Text>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {extPlugins.filter(p => !p.error).map((p) => (
                      <div
                        key={p.id}
                        data-no-drag
                        onClick={() => onSelectTool(`ext::${p.id}::${p.features[0]?.code ?? ''}`)}
                        style={{
                          background: "var(--ant-color-bg-container)",
                          border: "1px solid var(--ant-color-border-secondary)",
                          borderRadius: 8,
                          padding: 10,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                          transition: "all 0.16s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor =
                            "var(--ant-color-primary)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor =
                            "var(--ant-color-border-secondary)";
                        }}
                      >
                        {p.logoUrl ? (
                          <img
                            src={p.logoUrl}
                            alt={p.name}
                            style={{ width: 18, height: 18, borderRadius: 3 }}
                          />
                        ) : (
                          <AppstoreOutlined style={{ fontSize: 16, color: "#722ed1" }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {p.name}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--ant-color-text-tertiary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {p.features.length} 个 feature
                          </div>
                        </div>
                        <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>
                          v{p.version}
                        </Tag>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 第二段: 市场源 — 远程插件 (按源分组) */}
              {marketSources.length === 0 ? (
                // 没有任何源 — 引导
                <div
                  style={{
                    padding: "40px 24px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                    color: "var(--ant-color-text-tertiary)",
                  }}
                >
                  <WifiOutlined style={{ fontSize: 48, opacity: 0.3 }} />
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ant-color-text)" }}>
                    还没有市场源
                  </div>
                  <div style={{ fontSize: 12, textAlign: "center", maxWidth: 360 }}>
                    添加一个市场源(base URL)就能看到可安装的远程插件。
                    <br />
                    支持多个源并行, 已装的会自动跳过。
                  </div>
                  <button
                    onClick={onOpenMarketSources}
                    style={{
                      marginTop: 8,
                      padding: "6px 16px",
                      background: "var(--ant-color-primary)",
                      color: "white",
                      border: 0,
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    添加市场源
                  </button>
                </div>
              ) : (
                <div style={{ padding: "16px 24px 32px" }}>
                  {marketGroups.map((g) => (
                <div key={g.source.id} style={{ marginBottom: 28 }}>
                  {/* 源 header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                      paddingBottom: 8,
                      borderBottom: "1px solid var(--ant-color-border-secondary)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <WifiOutlined
                        style={{
                          color:
                            g.source.lastError
                              ? "#ff4d4f"
                              : "var(--ant-color-primary)",
                        }}
                      />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {g.source.label ?? g.source.cachedList?.name ?? "未命名源"}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--ant-color-text-tertiary)",
                            fontFamily: "var(--mono-font)",
                          }}
                        >
                          {g.source.url}
                        </div>
                      </div>
                    </div>
                    <Badge
                      count={g.plugins.length}
                      showZero
                      color={g.source.lastError ? "red" : "cyan"}
                      title={g.source.lastError ?? `${g.plugins.length} 个可操作插件`}
                    />
                  </div>

                  {/* 插件网格 */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {g.plugins.map((it) => {
                      // 按 id 哈希到 6 种渐变之一,让多个卡片颜色有差异
                      const palettes = [
                        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                        "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                        "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
                        "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
                        "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
                      ];
                      const hash = it.entry.id
                        .split("")
                        .reduce((a, c) => a + c.charCodeAt(0), 0);
                      const bg = palettes[hash % palettes.length];
                      const initial = it.entry.name.charAt(0).toUpperCase();
                      return (
                        <div
                          key={it.key}
                          style={{
                            background: "var(--ant-color-bg-container)",
                            border: "1px solid var(--ant-color-border-secondary)",
                            borderRadius: 12,
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                            transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
                            cursor: "default",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                          }}
                          onMouseEnter={(e) => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.transform = "translateY(-2px)";
                            el.style.boxShadow =
                              "0 8px 24px -4px rgba(0,0,0,0.12), 0 0 0 1px var(--ant-color-primary)";
                            el.style.borderColor = "var(--ant-color-primary)";
                          }}
                          onMouseLeave={(e) => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.transform = "translateY(0)";
                            el.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
                            el.style.borderColor = "var(--ant-color-border-secondary)";
                          }}
                        >
                          {/* 顶部 banner: 有 icon 用图片, 没有/失败 用首字母 + 渐变 */}
                          <div
                            style={{
                              height: 64,
                              background: bg,
                              position: "relative",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "0 14px",
                              color: "white",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                right: -30,
                                top: -30,
                                width: 100,
                                height: 100,
                                borderRadius: "50%",
                                background:
                                  "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)",
                                pointerEvents: "none",
                              }}
                            />
                            {it.entry.icon && !iconErrors.has(it.key) ? (
                              <img
                                src={it.entry.icon}
                                alt={it.entry.name}
                                title={it.entry.name}
                                onError={() => markIconError(it.key)}
                                style={{
                                  width: 44,
                                  height: 44,
                                  objectFit: "cover",
                                  borderRadius: 8,
                                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                                  background: "rgba(255,255,255,0.15)",
                                  position: "relative",
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  fontSize: 32,
                                  fontWeight: 700,
                                  opacity: 0.95,
                                  letterSpacing: 1,
                                  textShadow: "0 1px 2px rgba(0,0,0,0.15)",
                                  position: "relative",
                                }}
                              >
                                {initial}
                              </span>
                            )}
                            {it.isUpdate ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: "2px 8px",
                                  borderRadius: 10,
                                  background: "rgba(255,255,255,0.95)",
                                  color: "#fa8c16",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                  position: "relative",
                                }}
                              >
                                有更新
                              </span>
                            ) : it.installed ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: "2px 8px",
                                  borderRadius: 10,
                                  background: "rgba(82,196,26,0.95)",
                                  color: "white",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                  position: "relative",
                                }}
                              >
                                已装
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: "2px 8px",
                                  borderRadius: 10,
                                  background: "rgba(255,255,255,0.18)",
                                  color: "white",
                                  fontWeight: 500,
                                  whiteSpace: "nowrap",
                                  position: "relative",
                                  backdropFilter: "blur(8px)",
                                }}
                              >
                                未装
                              </span>
                            )}
                          </div>

                          {/* 主体内容 */}
                          <div
                            style={{
                              padding: 12,
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              flex: 1,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: "var(--ant-color-text)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={it.entry.name}
                            >
                              {it.entry.name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--ant-color-text-tertiary)",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <span style={{ opacity: 0.7 }}>by</span>
                              <span>{it.entry.author ?? "未知作者"}</span>
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--ant-color-text-secondary)",
                                lineHeight: 1.5,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                minHeight: 36,
                              }}
                              title={it.entry.description}
                            >
                              {it.entry.description || "—"}
                            </div>
                          </div>

                          {/* 底部 footer */}
                          <div
                            style={{
                              padding: "8px 12px",
                              borderTop: "1px solid var(--ant-color-border-secondary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              background: "var(--ant-color-bg-layout)",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: "var(--mono-font)",
                                color: "var(--ant-color-text-tertiary)",
                              }}
                              title={`插件 id: ${it.entry.id}`}
                            >
                              v
                              {it.isUpdate
                                ? `${it.localVersion} → ${it.entry.version}`
                                : it.entry.version}
                            </span>
                            <button
                              disabled={installing === it.key || (it.installed && !it.isUpdate)}
                              onClick={() => handleInstall(g.source, it.entry, it.key)}
                              style={{
                                padding: "4px 14px",
                                background:
                                  installing === it.key
                                    ? "var(--ant-color-fill-secondary)"
                                    : it.isUpdate
                                    ? "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
                                    : it.installed
                                    ? "var(--ant-color-bg-layout)"
                                    : "var(--ant-color-primary)",
                                color:
                                  it.installed && !it.isUpdate
                                    ? "var(--ant-color-text-tertiary)"
                                    : "white",
                                border: 0,
                                borderRadius: 6,
                                cursor:
                                  installing === it.key
                                    ? "wait"
                                    : it.installed && !it.isUpdate
                                    ? "not-allowed"
                                    : "pointer",
                                fontSize: 12,
                                fontWeight: 500,
                                boxShadow: installing
                                  ? "none"
                                  : "0 2px 6px -1px rgba(0,0,0,0.15)",
                                transition: "all 0.16s",
                              }}
                            >
                              {installing === it.key
                                ? "处理中..."
                                : it.isUpdate
                                ? "更新"
                                : it.installed
                                ? "已装"
                                : "安装"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
