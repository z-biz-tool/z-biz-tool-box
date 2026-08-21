import { useState, useMemo } from "react";
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
  Badge,
  Switch,
  Tooltip,
  Empty,
  Divider,
} from "antd";
import { ReloadOutlined, AppstoreOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useUiStore } from "../../stores/uiStore";
import { ALL_TOOLS, TOOL_GROUPS } from "../_registry";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "market",
  label: "插件市场",
  description: "插件浏览/启用/扩展",
  icon: "appstore",
};

const CATEGORIES = ["全部", "启用", "禁用", "编码", "文本", "加密", "转换", "网络", "系统"];

const CATEGORY_COLORS: Record<string, string> = {
  编码: "blue",
  文本: "green",
  加密: "orange",
  转换: "purple",
  网络: "cyan",
  系统: "magenta",
};

export default function PluginMarket() {
  const [filter, setFilter] = useState("全部");
  const [search, setSearch] = useState("");
  const disabled = useUiStore((s) => s.disabled);
  const toggleDisabled = useUiStore((s) => s.toggleDisabled);
  const setDisabled = useUiStore((s) => s.setDisabled);

  // 派生所有工具, 加上启用状态
  const allTools = useMemo(() => {
    return TOOL_GROUPS.flatMap((g) =>
      g.tools.map((t) => ({
        key: t.key,
        name: t.label,
        description: t.description,
        category: g.label,
        icon: t.key,
        enabled: !disabled.includes(t.key),
      }))
    );
  }, [disabled]);

  const filtered = useMemo(() => {
    return allTools.filter((tool) => {
      // 状态过滤
      if (filter === "启用" && !tool.enabled) return false;
      if (filter === "禁用" && tool.enabled) return false;
      if (
        filter !== "全部" &&
        filter !== "启用" &&
        filter !== "禁用" &&
        tool.category !== filter
      )
        return false;
      // 搜索
      if (search) {
        const q = search.toLowerCase();
        if (
          !tool.name.toLowerCase().includes(q) &&
          !tool.description.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [allTools, filter, search]);

  const enabledCount = allTools.filter((t) => t.enabled).length;
  const disabledCount = allTools.length - enabledCount;

  return (
    <Card title="插件市场" bordered={false}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="总工具数" value={allTools.length} prefix={<AppstoreOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="已启用"
              value={enabledCount}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="已禁用"
              value={disabledCount}
              valueStyle={{ color: disabledCount > 0 ? "#ff4d4f" : undefined }}
            />
          </Card>
        </Col>
        <Col span={6}>
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
          placeholder="搜索工具..."
          style={{ width: 250 }}
          allowClear
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => setDisabled([])}
          disabled={disabledCount === 0}
          title="全部启用"
        >
          全部启用
        </Button>
        {CATEGORIES.filter((c) => c !== "全部" && c !== "启用" && c !== "禁用").map((cat) => (
          <Badge
            key={cat}
            count={allTools.filter((t) => t.category === cat).length}
            offset={[0, 0]}
          >
            <Tag
              color={CATEGORY_COLORS[cat] || "default"}
              style={{ cursor: "pointer", padding: "4px 12px" }}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </Tag>
          </Badge>
        ))}
      </Space>

      <Divider style={{ margin: "12px 0" }} />

      {filtered.length === 0 ? (
        <Empty description="没有匹配的工具" />
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map((tool) => (
            <Col xs={24} sm={12} md={8} lg={6} key={tool.key}>
              <Card
                size="small"
                hoverable
                style={{
                  opacity: tool.enabled ? 1 : 0.55,
                  transition: "opacity 0.2s",
                }}
                title={
                  <Space>
                    <Tag color={CATEGORY_COLORS[tool.category] || "default"}>{tool.category}</Tag>
                    <Typography.Text strong>{tool.name}</Typography.Text>
                  </Space>
                }
                extra={
                  <Tooltip title={tool.enabled ? "点击禁用" : "点击启用"}>
                    <Switch
                      size="small"
                      checked={tool.enabled}
                      onChange={() => toggleDisabled(tool.key)}
                    />
                  </Tooltip>
                }
              >
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {tool.description}
                </Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Tag color="blue" style={{ fontFamily: "monospace" }}>
                    {tool.key}
                  </Tag>
                  {tool.enabled ? (
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

      <Space size="small" style={{ width: "100%", justifyContent: "space-between" }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          <FolderOpenOutlined /> 扩展目录:
          <code style={{ marginLeft: 4, padding: "0 4px", background: "var(--ant-color-fill-tertiary)", borderRadius: 3 }}>
            ~/.config/z-biz-tool-box/extensions/*.json
          </code>
          (v2)
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          共 {ALL_TOOLS.length} 个内置工具
        </Typography.Text>
      </Space>
    </Card>
  );
}
