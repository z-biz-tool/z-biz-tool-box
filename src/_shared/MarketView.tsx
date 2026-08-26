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
  ShopOutlined,
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

  // 左栏分组: 内置工具在前, 外部插件在后 — 小节标题 + 分隔线增强区块隔离
  const builtinInstalled = filteredInstalled.filter((it) => !it.isExternal).slice(0, 50);
  const extInstalled = filteredInstalled.filter((it) => it.isExternal).slice(0, 50);
  const renderInstalledItem = (it: (typeof installed)[number]) => (
                <div
                  key={it.key}
                  data-no-drag
                  onClick={() => onSelectTool(it.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
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
                          // 卸载后强制刷新外部插件 store, 让左列 + 右列 + market view 全部更新
                          await extRefresh();
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
  );

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
            style={{
              fontSize: 15,
              height: 32,
              background: "var(--ant-color-fill-tertiary)",
              borderRadius: 8,
            }}
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
          className="mvIconBtn"
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
          className="mvIconBtn"
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
          className="mvIconBtn"
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
          className="mvIconBtn"
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
          className="mvIconBtn"
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
            boxShadow: "1px 0 4px rgba(0,0,0,0.03)",
            padding: "12px 10px",
            overflowY: "auto",
            background: "var(--ant-color-bg-container)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "2px 10px 10px",
              fontSize: 12,
              color: "var(--ant-color-text)",
              fontWeight: 600,
              borderBottom: "1px solid var(--ant-color-border-secondary)",
              marginBottom: 8,
            }}
          >
            <span>已安装插件应用 ({installed.length})</span>
            <span
              style={{
                color: "var(--ant-color-text-tertiary)",
                fontSize: 10,
                fontWeight: 400,
              }}
            >
              {installed.filter((i) => !i.isExternal).length} 内置 ·{" "}
              {installed.filter((i) => i.isExternal).length} 外部
            </span>
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
            <div style={{ display: "flex", flexDirection: "column" }}>
              {builtinInstalled.length > 0 && (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    color: "var(--ant-color-text-tertiary)",
                    textTransform: "uppercase",
                    padding: "10px 10px 6px",
                    borderTop: "1px dashed var(--ant-color-border-secondary)",
                    marginTop: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--ant-color-primary)",
                    }}
                  />
                  内置 ({builtinInstalled.length})
                </div>
              )}
              {builtinInstalled.map(renderInstalledItem)}
              {extInstalled.length > 0 && (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    color: "#722ed1",
                    textTransform: "uppercase",
                    padding: "14px 10px 6px",
                    borderTop: "1.5px solid #722ed1",
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#722ed1",
                      boxShadow: "0 0 6px rgba(114,46,209,0.5)",
                    }}
                  />
                  外部插件 ({extInstalled.length})
                </div>
              )}
              {extInstalled.map(renderInstalledItem)}
            </div>
          )}
        </div>

        {/* 主区: tab 切换 [已装 / 远程] */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--ant-color-bg-layout)" }}>
          {/* tab 切换条 */}
          <div
            data-no-drag
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              padding: "12px 24px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              borderBottom: "1px solid var(--ant-color-border-secondary)",
              background: "var(--ant-color-bg-layout)",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 4,
                padding: 4,
                background: "var(--ant-color-fill-secondary)",
                border: "1px solid var(--ant-color-border-secondary)",
                borderRadius: 10,
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)",
              }}
            >
              <button
                onClick={() => switchTab("builtin")}
                style={{
                  padding: "6px 16px",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background:
                    rightTab === "builtin"
                      ? "linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)"
                      : "transparent",
                  color:
                    rightTab === "builtin"
                      ? "var(--ant-color-primary)"
                      : "var(--ant-color-text)",
                  boxShadow:
                    rightTab === "builtin"
                      ? "0 1px 3px rgba(0,0,0,0.12), 0 0 0 1px var(--ant-color-primary) inset"
                      : "none",
                  border: 0,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: rightTab === "builtin" ? 600 : 500,
                  transition: "all 0.16s",
                }}
              >
                <AppstoreOutlined />
                内置 ({TOOL_GROUPS.reduce((s, g) => s + g.tools.filter(t => !disabled.includes(t.key)).length, 0)})
              </button>
              <button
                onClick={() => switchTab("market")}
                style={{
                  padding: "6px 16px",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background:
                    rightTab === "market"
                      ? "linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)"
                      : "transparent",
                  color:
                    rightTab === "market"
                      ? "var(--ant-color-primary)"
                      : "var(--ant-color-text)",
                  boxShadow:
                    rightTab === "market"
                      ? "0 1px 3px rgba(0,0,0,0.12), 0 0 0 1px var(--ant-color-primary) inset"
                      : "none",
                  border: 0,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: rightTab === "market" ? 600 : 500,
                  transition: "all 0.16s",
                }}
              >
                <ShopOutlined />
                市场 ({extPlugins.filter(p => !p.error).length} /{" "}
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
            // 搜索结果: 已装插件(内置+外部)网格
            <div style={{ padding: "20px 24px 32px" }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>搜索 "{query}"</span>
                <span style={{ color: "var(--ant-color-text-tertiary)", fontWeight: 400 }}>
                  共 {filteredInstalled.length} 个结果
                </span>
              </div>
              {filteredInstalled.length === 0 ? (
                <div
                  style={{
                    padding: "48px 0",
                    textAlign: "center",
                    color: "var(--ant-color-text-tertiary)",
                    fontSize: 12,
                  }}
                >
                  没有找到与 "{query}" 匹配的插件应用
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 12,
                  }}
                >
                  {filteredInstalled.slice(0, 100).map((it) => (
                    <div
                      key={it.key}
                      data-no-drag
                      onClick={() => onSelectTool(it.key)}
                      style={{
                        background: "var(--ant-color-bg-container)",
                        border: "1px solid var(--ant-color-border-secondary)",
                        borderRadius: 8,
                        padding: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                        transition: "all 0.16s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "var(--ant-color-primary)";
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          "0 4px 12px rgba(0,0,0,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "var(--ant-color-border-secondary)";
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          "0 1px 2px rgba(0,0,0,0.04)";
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          fontSize: 14,
                          flexShrink: 0,
                          color: it.isExternal ? "#722ed1" : "var(--ant-color-primary)",
                          background: it.isExternal
                            ? "rgba(114,46,209,0.08)"
                            : "var(--ant-color-primary-bg)",
                        }}
                      >
                        {it.icon}
                      </span>
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
                          {it.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--ant-color-text-tertiary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {it.desc || (it.isExternal ? "外部插件" : "内置工具")}
                        </div>
                      </div>
                      {it.isExternal && (
                        <Tag color="purple" style={{ fontSize: 10, margin: 0, flexShrink: 0 }}>
                          外部
                        </Tag>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : rightTab === "builtin" ? (
            // 内置 tab — 按 TOOL_GROUPS 展示 builtin 工具
            <div style={{ padding: "20px 24px 32px" }}>
              {TOOL_GROUPS.map((g) => {
                const groupTools = g.tools.filter((t) => !disabled.includes(t.key));
                if (groupTools.length === 0) return null;
                return (
                  <div
                    key={g.key}
                    style={{
                      marginBottom: 28,
                      background: "var(--ant-color-bg-container)",
                      border: "1px solid var(--ant-color-border-secondary)",
                      borderLeft: "3px solid var(--ant-color-primary)",
                      borderRadius: 10,
                      padding: "16px 18px 18px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        paddingBottom: 10,
                        borderBottom: "1.5px solid var(--ant-color-border-secondary)",
                        marginBottom: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: "var(--ant-color-text)",
                      }}
                    >
                      <span style={{ fontSize: 16, color: "var(--ant-color-primary)" }}>{g.icon}</span>
                      <span>{g.label}</span>
                      <span
                        style={{
                          color: "var(--ant-color-text-tertiary)",
                          fontWeight: 500,
                          fontSize: 12,
                          background: "var(--ant-color-fill-tertiary)",
                          padding: "1px 8px",
                          borderRadius: 10,
                          marginLeft: 4,
                        }}
                      >
                        {groupTools.length}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                        gap: 10,
                      }}
                    >
                      {groupTools.map((t) => (
                        <div
                          key={t.key}
                          data-no-drag
                          onClick={() => onSelectTool(t.key)}
                          style={{
                            background: "var(--ant-color-bg-layout)",
                            border: "1px solid var(--ant-color-border-secondary)",
                            borderRadius: 6,
                            padding: "8px 10px",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                            transition: "all 0.16s",
                          }}
                          onMouseEnter={(e) => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.borderColor = "var(--ant-color-primary)";
                            el.style.background = "var(--ant-color-primary-bg)";
                          }}
                          onMouseLeave={(e) => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.borderColor = "var(--ant-color-border-secondary)";
                            el.style.background = "var(--ant-color-bg-layout)";
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
            <div style={{ padding: "20px 24px 32px" }}>
              {/* 第一段: 已装的 external 插件 (从 extPlugins) */}
              {extPlugins.filter(p => !p.error).length > 0 && (
                <div
                  style={{
                    marginBottom: 0,
                    padding: "20px 20px 24px",
                    background: "var(--ant-color-bg-container)",
                    border: "1px solid var(--ant-color-border-secondary)",
                    borderLeft: "4px solid #722ed1",
                    borderTopLeftRadius: 14,
                    borderTopRightRadius: 14,
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    borderBottom: "none",
                    boxShadow: "0 2px 8px -2px rgba(114,46,209,0.08)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      paddingBottom: 14,
                      borderBottom: "2px solid rgba(114,46,209,0.18)",
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "linear-gradient(135deg, rgba(114,46,209,0.18) 0%, rgba(114,46,209,0.08) 100%)",
                        color: "#722ed1",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        fontWeight: 700,
                      }}
                    >
                      <AppstoreOutlined />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>
                        已安装的市场插件
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--ant-color-text-tertiary)",
                          marginTop: 2,
                        }}
                      >
                        本地已装, 可直接打开
                      </div>
                    </div>
                    <div
                      style={{
                        background: "linear-gradient(135deg, #722ed1 0%, #5319a8 100%)",
                        color: "white",
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "3px 12px",
                        borderRadius: 12,
                        boxShadow: "0 2px 6px rgba(114,46,209,0.3)",
                      }}
                    >
                      {extPlugins.filter(p => !p.error).length}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                      gap: 12,
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
                          padding: 12,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
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
                <div>
                  {marketGroups.map((g, idx) => (
                <div
                  key={g.source.id}
                  style={{
                    marginBottom: 0,
                    padding: "20px 20px 24px",
                    background: "var(--ant-color-bg-container)",
                    border: `1px solid ${
                      g.source.lastError ? "#ffccc7" : "var(--ant-color-border-secondary)"
                    }`,
                    borderLeft: g.source.lastError
                      ? "4px solid #ff4d4f"
                      : "4px solid #1677ff",
                    borderTopLeftRadius: idx === 0 && extPlugins.filter(p => !p.error).length === 0 ? 14 : 0,
                    borderTopRightRadius: idx === 0 && extPlugins.filter(p => !p.error).length === 0 ? 14 : 0,
                    borderBottomLeftRadius: idx === marketGroups.length - 1 ? 14 : 0,
                    borderBottomRightRadius: idx === marketGroups.length - 1 ? 14 : 0,
                    borderTop: idx === 0 && extPlugins.filter(p => !p.error).length > 0 ? "1px dashed var(--ant-color-border-secondary)" : undefined,
                    boxShadow: g.source.lastError
                      ? "0 2px 8px -2px rgba(255,77,79,0.12)"
                      : "0 2px 8px -2px rgba(22,119,255,0.08)",
                  }}
                >
                  {/* 源 header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      paddingBottom: 14,
                      borderBottom: g.source.lastError
                        ? "2px solid rgba(255,77,79,0.2)"
                        : "2px solid rgba(22,119,255,0.18)",
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: g.source.lastError
                          ? "linear-gradient(135deg, rgba(255,77,79,0.18) 0%, rgba(255,77,79,0.08) 100%)"
                          : "linear-gradient(135deg, rgba(22,119,255,0.18) 0%, rgba(22,119,255,0.08) 100%)",
                        color: g.source.lastError ? "#ff4d4f" : "#1677ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                      }}
                    >
                      <WifiOutlined />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>
                        {g.source.label ?? g.source.cachedList?.name ?? "未命名源"}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--ant-color-text-tertiary)",
                          fontFamily: "var(--mono-font)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: 2,
                        }}
                      >
                        {g.source.url}
                      </div>
                    </div>
                    <div
                      style={{
                        background: g.source.lastError
                          ? "linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)"
                          : "linear-gradient(135deg, #1677ff 0%, #0958d9 100%)",
                        color: "white",
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "3px 12px",
                        borderRadius: 12,
                        boxShadow: g.source.lastError
                          ? "0 2px 6px rgba(255,77,79,0.3)"
                          : "0 2px 6px rgba(22,119,255,0.3)",
                        flexShrink: 0,
                      }}
                      title={
                        g.source.lastError ??
                        `${g.plugins.length} 个远程插件`
                      }
                    >
                      {g.plugins.length}
                    </div>
                  </div>

                  {/* 插件网格 */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                      gap: 14,
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
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: 90,
                                }}
                                title={it.entry.author ?? "未知作者"}
                              >
                                {it.entry.author ?? "未知作者"}
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontFamily: "var(--mono-font)",
                                  color: "var(--ant-color-text-tertiary)",
                                  marginLeft: "auto",
                                  flexShrink: 0,
                                }}
                                title={`插件 id: ${it.entry.id} · 版本 ${
                                  it.isUpdate
                                    ? `${it.localVersion} → ${it.entry.version}`
                                    : it.entry.version
                                }`}
                              >
                                v
                                {it.isUpdate
                                  ? `${it.localVersion} → ${it.entry.version}`
                                  : it.entry.version}
                              </span>
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

                          {/* 底部 footer — 只放按钮,版本号移到 banner */}
                          <div
                            style={{
                              padding: "10px 12px",
                              borderTop: "1px solid var(--ant-color-border-secondary)",
                              background: "var(--ant-color-bg-layout)",
                            }}
                          >
                            <button
                              disabled={installing === it.key || (it.installed && !it.isUpdate)}
                              onClick={() => handleInstall(g.source, it.entry, it.key)}
                              style={{
                                display: "block",
                                width: "100%",
                                minHeight: 32,
                                padding: "6px 0",
                                boxSizing: "border-box",
                                background:
                                  installing === it.key
                                    ? "var(--ant-color-fill-secondary)"
                                    : it.isUpdate
                                    ? "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
                                    : it.installed
                                    ? "rgba(82, 196, 26, 0.12)"
                                    : "linear-gradient(135deg, #1677ff 0%, #0958d9 100%)",
                                color:
                                  installing === it.key
                                    ? "var(--ant-color-text-tertiary)"
                                    : it.installed && !it.isUpdate
                                    ? "#52c41a"
                                    : "#ffffff",
                                border: it.installed && !it.isUpdate
                                  ? "1px solid rgba(82, 196, 26, 0.32)"
                                  : 0,
                                borderRadius: 6,
                                cursor:
                                  installing === it.key
                                    ? "wait"
                                    : it.installed && !it.isUpdate
                                    ? "not-allowed"
                                    : "pointer",
                                fontSize: 13,
                                fontWeight: 600,
                                fontFamily:
                                  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                                lineHeight: "20px",
                                textAlign: "center",
                                letterSpacing: 0.3,
                                boxShadow: installing
                                  ? "none"
                                  : it.installed && !it.isUpdate
                                  ? "none"
                                  : "0 2px 6px -1px rgba(0,0,0,0.18)",
                                transition: "all 0.16s",
                              }}
                            >
                              <span style={{ display: "inline-block" }}>
                                {installing === it.key
                                  ? "处理中..."
                                  : it.isUpdate
                                  ? "更新"
                                  : it.installed
                                  ? "✓ 已装"
                                  : "安装"}
                              </span>
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
          padding: "10px 16px",
          borderTop: "2px solid var(--ant-color-border-secondary)",
          background: "var(--ant-color-bg-container)",
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
            padding: "3px 8px",
            borderRadius: 6,
            color: "var(--ant-color-text-tertiary)",
            cursor: "pointer",
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "var(--ant-color-fill-secondary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 12px",
            borderRadius: 10,
            background: "var(--ant-color-success-bg)",
            color: "var(--ant-color-success)",
            fontSize: 12,
          }}
        >
          <CheckCircleOutlined style={{ fontSize: 12 }} />
          <span>已加载 {installed.length} 个插件</span>
        </div>
        <SettingOutlined
          style={{
            cursor: "pointer",
            padding: 5,
            borderRadius: 6,
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "var(--ant-color-fill-secondary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        />
      </div>
    </div>
  );
}
