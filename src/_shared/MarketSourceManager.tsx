/**
 * MarketSourceManager — 市场源管理 Modal(共享组件)。
 *
 * 被以下两处复用:
 *   - src/plugins/system/PluginMarket.tsx (插件市场 工具页, 顶部 "管理市场源" 按钮)
 *   - src/_shared/MarketView.tsx           (Spotlight 浮层里的"插件应用市场"视图, 顶栏图标)
 *
 * 之前只在工具页里能找到, Spotlight 浮层里没入口, 用户找不到地方填 URL ——
 * 这是该组件被抽到 _shared 的根本原因。
 */

import { useState } from "react";
import {
  Modal,
  Card,
  Input,
  Button,
  Space,
  List,
  Tag,
  Tooltip,
  Switch,
  Popconfirm,
  Empty,
  Divider,
  Alert,
  Typography,
  message,
} from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import { useUiStore } from "../stores/uiStore";
import { fetchMarketSource, validateMarketUrl } from "../plugins/external/market";
import type { MarketSource } from "../plugins/external/types";

export interface MarketSourceManagerProps {
  open: boolean;
  onClose: () => void;
}

export function MarketSourceManager({ open, onClose }: MarketSourceManagerProps) {
  const sources = useUiStore((s) => s.marketSources);
  const addMarketSource = useUiStore((s) => s.addMarketSource);
  const removeMarketSource = useUiStore((s) => s.removeMarketSource);
  const toggleMarketSource = useUiStore((s) => s.toggleMarketSource);
  const renameMarketSource = useUiStore((s) => s.renameMarketSource);
  const setMarketSourceCache = useUiStore((s) => s.setMarketSourceCache);
  const setMarketSourceError = useUiStore((s) => s.setMarketSourceError);

  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const handleAdd = async () => {
    let safeUrl: string;
    try {
      safeUrl = validateMarketUrl(newUrl);
    } catch (e) {
      message.error(`URL 不合法: ${(e as Error).message}`);
      return;
    }
    setAdding(true);
    const id = addMarketSource(safeUrl, newLabel.trim() || undefined);
    setNewUrl("");
    setNewLabel("");
    // 添加后立即拉一次
    setRefreshing((m) => ({ ...m, [id]: true }));
    const src = useUiStore.getState().marketSources.find((s) => s.id === id);
    if (src) {
      const r = await fetchMarketSource(src);
      if (r.ok) setMarketSourceCache(id, r.list);
      else setMarketSourceError(id, r.error);
    }
    setRefreshing((m) => ({ ...m, [id]: false }));
    setAdding(false);
  };

  const handleRefresh = async (src: MarketSource) => {
    setRefreshing((m) => ({ ...m, [src.id]: true }));
    const r = await fetchMarketSource(src);
    if (r.ok) {
      setMarketSourceCache(src.id, r.list);
      message.success(`${src.label ?? new URL(src.url).hostname} 拉取成功,${r.list.plugins.length} 个插件`);
    } else {
      setMarketSourceError(src.id, r.error);
      message.error(`拉取失败: ${r.error}`);
    }
    setRefreshing((m) => ({ ...m, [src.id]: false }));
  };

  return (
    <Modal
      title="管理市场源"
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          <span>
            市场源是一个 HTTP(S) <strong>base URL</strong>。
            客户端会自动 GET <Typography.Text code>{"{base}/list"}</Typography.Text> 拿市场索引,
            按 <Typography.Text code>docs/market-spec.md</Typography.Text> v1.0 规范解析。
            支持多个源并行, 已连接源里的插件可一键下载到本地。
          </span>
        }
      />

      <Card size="small" type="inner" title="添加市场源" style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            placeholder="https://example.com/market/v1   (注意不要带 /list)"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onPressEnter={handleAdd}
            style={{ width: "55%" }}
          />
          <Input
            placeholder="别名(可选)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onPressEnter={handleAdd}
            style={{ width: "25%" }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={adding}
            disabled={!newUrl.trim()}
            onClick={handleAdd}
          >
            添加并连接
          </Button>
        </Space.Compact>
      </Card>

      {sources.length === 0 ? (
        <Empty description="还没有配置市场源" />
      ) : (
        <List
          dataSource={sources}
          renderItem={(s) => {
            const editing = editingId === s.id;
            return (
              <List.Item
                key={s.id}
                actions={[
                  <Tooltip key="refresh" title="重新拉取 list">
                    <Button
                      type="text"
                      icon={<ReloadOutlined spin={refreshing[s.id]} />}
                      loading={refreshing[s.id]}
                      onClick={() => handleRefresh(s)}
                    />
                  </Tooltip>,
                  <Switch
                    key="toggle"
                    size="small"
                    checked={s.enabled}
                    onChange={() => toggleMarketSource(s.id)}
                  />,
                  <Popconfirm
                    key="del"
                    title="删除这个市场源?"
                    description="不会影响本地已安装的插件,只删除配置"
                    onConfirm={() => removeMarketSource(s.id)}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    s.enabled && s.cachedList && !s.lastError ? (
                      <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 18 }} />
                    ) : s.lastError ? (
                      <CloseCircleOutlined style={{ color: "#ff4d4f", fontSize: 18 }} />
                    ) : (
                      <WifiOutlined style={{ color: "#bfbfbf", fontSize: 18 }} />
                    )
                  }
                  title={
                    <Space wrap>
                      {editing ? (
                        <Input
                          size="small"
                          value={editingLabel}
                          autoFocus
                          onChange={(e) => setEditingLabel(e.target.value)}
                          onPressEnter={() => {
                            renameMarketSource(s.id, editingLabel);
                            setEditingId(null);
                          }}
                          onBlur={() => {
                            renameMarketSource(s.id, editingLabel);
                            setEditingId(null);
                          }}
                          style={{ width: 200 }}
                        />
                      ) : (
                        <>
                          <Typography.Text strong>
                            {s.label ?? new URL(s.url).hostname}
                          </Typography.Text>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => {
                              setEditingId(s.id);
                              setEditingLabel(s.label ?? "");
                            }}
                          />
                        </>
                      )}
                      {s.cachedList && (
                        <Tag color="cyan">{s.cachedList.plugins.length} 个插件</Tag>
                      )}
                      {!s.enabled && <Tag>已禁用</Tag>}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={2} style={{ width: "100%" }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }} copyable>
                        {s.url}
                      </Typography.Text>
                      {s.lastError && (
                        <Typography.Text type="danger" style={{ fontSize: 12 }}>
                          <ExclamationCircleOutlined /> {s.lastError}
                        </Typography.Text>
                      )}
                      {s.cachedList?.description && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {s.cachedList.description}
                        </Typography.Text>
                      )}
                      {s.lastFetchAt && (
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          上次拉取: {new Date(s.lastFetchAt).toLocaleString()}
                        </Typography.Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}

      <Divider style={{ margin: "16px 0 8px" }} />
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        规范: GET {"{base}/list"} → 顶层含 schemaVersion=1 / name / plugins[]。
        每个 plugin 必须有 id / name / version, 下载时按 {"{base}/plugins/{id}/plugin.json + main.html"} 拼。
      </Typography.Text>
    </Modal>
  );
}
