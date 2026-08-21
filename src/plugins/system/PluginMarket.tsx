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
} from "antd";
import { EmptyState, useCopyToClipboard } from "../../_shared";
import { TOOL_GROUPS } from "../_registry";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "market",
  label: "插件市场",
  description: "插件浏览/启用/扩展",
  icon: "appstore",
};

const CATEGORIES = ["全部", "编码", "文本", "加密", "转换", "网络", "系统"];

const CATEGORY_COLORS: Record<string, string> = {
  编码: "blue",
  文本: "green",
  加密: "orange",
  转换: "purple",
  网络: "cyan",
  系统: "magenta",
};

export default function PluginMarket() {
  const [category, setCategory] = useState("全部");
  const [search, setSearch] = useState("");
  const copy = useCopyToClipboard();

  // 直接从 _registry 派生所有工具(已包含 group/label/description/icon)
  const allTools = useMemo(() => {
    return TOOL_GROUPS.flatMap((g) =>
      g.tools.map((t) => ({
        id: t.key,
        name: t.label,
        description: t.description,
        category: g.label,
        icon: t.key,
        enabled: true,
      }))
    );
  }, []);

  const filtered = useMemo(() => {
    return allTools.filter((tool) => {
      const matchCat = category === "全部" || tool.category === category;
      const matchSearch =
        !search ||
        tool.name.toLowerCase().includes(search.toLowerCase()) ||
        tool.description.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [allTools, category, search]);

  return (
    <Card title="插件市场" bordered={false}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="总工具数" value={allTools.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="当前显示" value={filtered.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="分类数" value={CATEGORIES.length - 1} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="来源" value="内置" />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          value={category}
          onChange={setCategory}
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
        {CATEGORIES.filter((c) => c !== "全部").map((cat) => (
          <Badge
            key={cat}
            count={allTools.filter((t) => t.category === cat).length}
            offset={[0, 0]}
          >
            <Tag
              color={CATEGORY_COLORS[cat] || "default"}
              style={{ cursor: "pointer", padding: "4px 12px" }}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </Tag>
          </Badge>
        ))}
      </Space>

      {filtered.length === 0 ? (
        <EmptyState
          title="未找到匹配的工具"
          description="尝试更换关键词或分类筛选"
        />
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map((tool) => (
            <Col xs={24} sm={12} md={8} lg={6} key={tool.id}>
              <Card
                size="small"
                hoverable
                title={
                  <Space>
                    <Tag color={CATEGORY_COLORS[tool.category || ""] || "default"}>
                      {tool.category}
                    </Tag>
                    <Typography.Text strong>{tool.name}</Typography.Text>
                  </Space>
                }
                actions={[
                  <Button key="copy" size="small" type="link" onClick={() => copy(tool.id)}>
                    复制ID
                  </Button>,
                ]}
              >
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {tool.description}
                </Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Tag color="blue" style={{ fontFamily: "monospace" }}>
                    {tool.id}
                  </Tag>
                  {tool.enabled !== undefined && (
                    <Tag color={tool.enabled ? "green" : "default"}>
                      {tool.enabled ? "已启用" : "未启用"}
                    </Tag>
                  )}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
}
