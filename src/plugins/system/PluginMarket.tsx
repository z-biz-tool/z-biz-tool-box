import { useMemo, useState } from "react";
import {
  Card,
  Row,
  Col,
  Tag,
  Typography,
  Input,
  Select,
  Button,
  Space,
  Statistic,
  Switch,
  Tooltip,
  Empty,
  Divider,
  message,
} from "antd";
import {
  ReloadOutlined,
  AppstoreOutlined,
  FolderOpenOutlined,
  CodeOutlined,
  GlobalOutlined,
  ExclamationCircleOutlined,
  CloudDownloadOutlined,
  LinkOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import { useUiStore } from "../../stores/uiStore";
import { TOOL_GROUPS } from "../_registry";
import { useExtStore } from "../external/store";
import { openPluginsDir } from "../external/scanner";
import { isNewer } from "../external/market";
import { installRemotePlugin } from "../external/installer";
import type { MarketPluginEntry, MarketSource } from "../external/types";
import { MarketSourceManager } from "../../_shared/MarketSourceManager";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "market",
  label: "插件市场",
  description: "浏览/启用/扩展插件",
  cmds: ["market", "plugin market", "插件市场"],
  icon: "appstore",
};

const CATEGORIES = ["全部", "内置", "外部", "远程", "启用", "禁用"];

type RemoteItem = {
  kind: "remote";
  key: string;
  name: string;
  description: string;
  category: string;
  sourceLabel: string;
  sourceId: string;
  source: MarketSource; // 完整 source — installer 需要 base URL
  entry: MarketPluginEntry;
  version: string;
  enabled: true; // 远程插件待安装,视为"启用可点击"
  /** 本地已装的旧版本号 — 存在表示这是一个"有更新"项, UI 显示"更新"按钮 */
  updateFrom?: string;
};

export default function PluginMarket() {
  const [filter, setFilter] = useState("全部");
  const [search, setSearch] = useState("");
  const [sourceMgrOpen, setSourceMgrOpen] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  const disabled = useUiStore((s) => s.disabled);
  const toggleDisabled = useUiStore((s) => s.toggleDisabled);
  const setDisabled = useUiStore((s) => s.setDisabled);
  const marketSources = useUiStore((s) => s.marketSources);

  const extPlugins = useExtStore((s) => s.plugins);
  const refreshExt = useExtStore((s) => s.refresh);
  const loading = useExtStore((s) => s.loading);
  const lastScan = useExtStore((s) => s.lastScan);

  // 内置工具
  const builtin = useMemo(() => {
    return TOOL_GROUPS.flatMap((g) =>
      g.tools.map((t) => ({
        kind: "builtin" as const,
        key: t.key,
        name: t.label,
        description: t.description,
        category: g.label,
        enabled: !disabled.includes(t.key),
      }))
    );
  }, [disabled]);

  // 外部 features(本地已安装)
  const external = useMemo(() => {
    return extPlugins.flatMap((p) =>
      p.features.map((f) => ({
        kind: "external" as const,
        key: `ext::${p.id}::${f.code}`,
        name: f.explain,
        description: `${p.name} · ${f.cmds?.join(" / ") ?? ""}`,
        category: `📦 ${p.name}`,
        pluginId: p.id,
        pluginName: p.name,
        enabled: true,
        error: p.error,
      }))
    );
  }, [extPlugins]);

  // 远程插件(从市场源 cachedList 拉取)
  // - 未装: 显示"安装"按钮
  // - 已装但有新版: 显示"更新"按钮 + 版本对比
  // - 已装且同版: 跳过
  const installedExtMap = useMemo(
    () => new Map(extPlugins.filter((p) => !p.error).map((p) => [p.id, p])),
    [extPlugins]
  );
  const remote = useMemo(() => {
    const out: RemoteItem[] = [];
    for (const src of marketSources) {
      if (!src.enabled || !src.cachedList) continue;
      for (const p of src.cachedList.plugins) {
        const local = installedExtMap.get(p.id);
        if (local) {
          // 已装: 比版本
          const localV = local.version || "";
          if (localV && p.version && isNewer(p.version, localV)) {
            out.push({
              kind: "remote",
              key: `remote::${src.id}::${p.id}::update`,
              name: p.name,
              description: `v${localV} → v${p.version}`,
              category: `🌐 ${src.cachedList.name}`,
              sourceLabel: src.label ?? new URL(src.url).hostname,
              sourceId: src.id,
              source: src,
              entry: p,
              version: p.version,
              enabled: true,
              updateFrom: localV,
            });
          }
          // 同版/旧版 → 跳过
        } else {
          // 未装
          out.push({
            kind: "remote",
            key: `remote::${src.id}::${p.id}`,
            name: p.name,
            description: p.description || `v${p.version} · ${p.author ?? "未知作者"}`,
            category: `🌐 ${src.cachedList.name}`,
            sourceLabel: src.label ?? new URL(src.url).hostname,
            sourceId: src.id,
            source: src,
            entry: p,
            version: p.version,
            enabled: true,
          });
        }
      }
    }
    return out;
  }, [marketSources, installedExtMap]);

  // 错误状态(整个 plugin 解析失败)
  const erroredPlugins = useMemo(() => extPlugins.filter((p) => p.error), [extPlugins]);

  const all = useMemo(() => [...builtin, ...external, ...remote], [builtin, external, remote]);

  const filtered = useMemo(() => {
    return all.filter((t) => {
      if (filter === "内置" && t.kind !== "builtin") return false;
      if (filter === "外部" && t.kind !== "external") return false;
      if (filter === "远程" && t.kind !== "remote") return false;
      if (filter === "启用" && !t.enabled) return false;
      if (filter === "禁用" && t.enabled) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [all, filter, search]);

  const enabledBuiltin = builtin.filter((t) => t.enabled).length;
  const totalExternalFeatures = external.length;
  const successExternalPlugins = extPlugins.filter((p) => !p.error).length;
  const enabledSources = marketSources.filter((s) => s.enabled).length;
  const healthySources = marketSources.filter(
    (s) => s.enabled && s.cachedList && !s.lastError
  ).length;

  // ---- 远程插件安装 ----
  const handleInstall = async (item: RemoteItem) => {
    setInstalling(item.key);
    try {
      const result = await installRemotePlugin(item.source, item.entry);
      message.success(`已安装 ${item.entry.name} → ${result.pluginDir}`);
      await refreshExt();
    } catch (e) {
      message.error(`安装失败: ${String(e)}`);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <>
      <Card title="插件市场" bordered={false}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={5}>
            <Card size="small">
              <Statistic
                title="内置工具"
                value={`${enabledBuiltin} / ${builtin.length}`}
                prefix={<AppstoreOutlined />}
                valueStyle={{ color: "#1677ff" }}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small">
              <Statistic
                title="外部插件 (本地)"
                value={`${successExternalPlugins} 个 · ${totalExternalFeatures} features`}
                prefix={<GlobalOutlined />}
                valueStyle={{ color: "#722ed1" }}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small">
              <Statistic
                title="市场源"
                value={`${healthySources} / ${enabledSources}`}
                prefix={<WifiOutlined />}
                valueStyle={{
                  color:
                    enabledSources === 0
                      ? undefined
                      : healthySources === enabledSources
                      ? "#52c41a"
                      : "#faad14",
                }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic
                title="可安装远程"
                value={remote.length}
                prefix={<CloudDownloadOutlined />}
                valueStyle={{ color: remote.length > 0 ? "#13c2c2" : undefined }}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small">
              <Statistic title="当前显示" value={filtered.length} />
            </Card>
          </Col>
        </Row>

        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            value={filter}
            onChange={setFilter}
            style={{ width: 150 }}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
          <Input.Search
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索工具/feature..."
            style={{ width: 250 }}
            allowClear
          />
          <Button
            icon={<FolderOpenOutlined />}
            onClick={async () => {
              try {
                await openPluginsDir();
              } catch (e) {
                message.error("打开插件目录失败: " + String(e));
              }
            }}
          >
            打开插件目录
          </Button>
          <Button icon={<ReloadOutlined />} onClick={refreshExt} loading={loading}>
            刷新外部插件
          </Button>
          <Button
            type={marketSources.length === 0 ? "primary" : "default"}
            icon={<LinkOutlined />}
            onClick={() => setSourceMgrOpen(true)}
          >
            管理市场源 {marketSources.length > 0 && `(${marketSources.length})`}
          </Button>
          {disabled.length > 0 && (
            <Button onClick={() => setDisabled([])} title="启用所有内置工具">
              全部启用内置
            </Button>
          )}
        </Space>

        <Divider style={{ margin: "12px 0" }} />

        {erroredPlugins.length > 0 && (
          <Card
            size="small"
            type="inner"
            title={
              <Space>
                <ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />
                <span style={{ color: "#ff4d4f" }}>插件加载错误</span>
              </Space>
            }
            style={{ marginBottom: 16, borderColor: "#ffa39e" }}
          >
            {erroredPlugins.map((p) => (
              <div key={p.id} style={{ marginBottom: 6, fontSize: 13 }}>
                <Tag color="red">{p.id}</Tag>
                <code style={{ color: "#ff7875" }}>{p.error}</code>
              </div>
            ))}
          </Card>
        )}

        {filtered.length === 0 ? (
          <Empty description="没有匹配的工具" />
        ) : (
          <Row gutter={[16, 16]}>
            {filtered.map((t) => (
              <Col xs={24} sm={12} md={8} lg={6} key={t.key}>
                <Card
                  size="small"
                  hoverable
                  style={{
                    opacity: t.enabled ? 1 : 0.55,
                    transition: "opacity 0.2s",
                    height: "100%",
                  }}
                  title={
                    <Space wrap>
                      {t.kind === "external" ? (
                        <Tag color="purple">📦 外部</Tag>
                      ) : t.kind === "remote" ? (
                        <>
                          <Tag color="cyan">🌐 远程</Tag>
                          {t.updateFrom && <Tag color="orange">有新版本</Tag>}
                        </>
                      ) : (
                        <Tag color="blue">内置</Tag>
                      )}
                      <Typography.Text strong>{t.name}</Typography.Text>
                    </Space>
                  }
                  extra={
                    t.kind === "builtin" ? (
                      <Tooltip title={t.enabled ? "点击禁用" : "点击启用"}>
                        <Switch
                          size="small"
                          checked={t.enabled}
                          onChange={() => toggleDisabled(t.key)}
                        />
                      </Tooltip>
                    ) : t.kind === "remote" ? (
                      <Button
                        size="small"
                        type="primary"
                        icon={<CloudDownloadOutlined />}
                        loading={installing === t.key}
                        onClick={() => handleInstall(t)}
                      >
                        {t.updateFrom ? "更新" : "安装"}
                      </Button>
                    ) : null
                  }
                >
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t.description}
                  </Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    <Tag style={{ fontFamily: "var(--mono-font)", fontSize: 11 }}>
                      {t.key}
                    </Tag>
                    {t.kind === "remote" && t.updateFrom ? (
                      <Tag color="orange">v{t.updateFrom} → v{t.version}</Tag>
                    ) : t.kind === "remote" ? (
                      <Tag>v{t.version}</Tag>
                    ) : t.enabled ? (
                      <Tag color="green">已启用</Tag>
                    ) : (
                      <Tag color="default">未启用</Tag>
                    )}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}

        <Divider style={{ margin: "16px 0 8px" }} />

        <Space size="small" style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            <CodeOutlined /> 开发外部插件:{" "}
            <code style={{ padding: "0 4px", background: "var(--ant-color-fill-tertiary)", borderRadius: 3 }}>
              ~/Library/Application Support/com.zifang.z-biz-tool-box/plugins/{`<id>`}/plugin.json
            </code>
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            本地扫描: {lastScan ? new Date(lastScan).toLocaleTimeString() : "—"} ·{" "}
            {extPlugins.length} 个本地插件
          </Typography.Text>
        </Space>
      </Card>

      <MarketSourceManager
        open={sourceMgrOpen}
        onClose={() => setSourceMgrOpen(false)}
      />
    </>
  );
}

// =====================================================================
// 市场源管理 Modal
// =====================================================================

