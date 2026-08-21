import { useState, useEffect, useMemo } from "react";
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
  message,
  Statistic,
  Badge,
} from "antd";
import { invoke } from "@tauri-apps/api/core";
import { EmptyState } from "../../_shared";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "market",
  label: "插件市场",
  description: "插件浏览/启用/扩展",
  icon: "appstore",
};


interface PluginInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  category?: string;
}

// 本地工具元数据（前端实现的工具）
const LOCAL_TOOLS: {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
}[] = [
  // 编码
  { id: "url", name: "URL 编解码", description: "URL 编码/解码", category: "编码", icon: "link" },
  {
    id: "html-entity",
    name: "HTML 实体",
    description: "HTML 实体编解码",
    category: "编码",
    icon: "code",
  },
  { id: "hex", name: "Hex 编解码", description: "十六进制编解码", category: "编码", icon: "hex" },
  { id: "hash", name: "哈希计算", description: "MD5/SHA 哈希", category: "编码", icon: "key" },
  { id: "base64", name: "Base64", description: "Base64 编解码", category: "编码", icon: "code" },
  // 文本
  {
    id: "json-format",
    name: "JSON 工具",
    description: "格式化/转换/提取",
    category: "文本",
    icon: "code",
  },
  { id: "diff", name: "文本对比", description: "文本 Diff", category: "文本", icon: "diff" },
  {
    id: "case",
    name: "大小写转换",
    description: "大小写/驼峰/下划线",
    category: "文本",
    icon: "font",
  },
  { id: "dedup", name: "文本去重", description: "按行/按词去重", category: "文本", icon: "filter" },
  { id: "sort", name: "文本排序", description: "升序/降序/打乱", category: "文本", icon: "sort" },
  {
    id: "wordcount",
    name: "字数统计",
    description: "字符/单词/行",
    category: "文本",
    icon: "stats",
  },
  {
    id: "reverse",
    name: "文本翻转",
    description: "字符/单词/行翻转",
    category: "文本",
    icon: "swap",
  },
  { id: "lorem", name: "Lorem Ipsum", description: "占位文本生成", category: "文本", icon: "text" },
  // 加密
  { id: "jwt", name: "JWT 解码", description: "JWT token 解析", category: "加密", icon: "key" },
  { id: "pwdgen", name: "密码生成", description: "随机密码生成器", category: "加密", icon: "lock" },
  { id: "pwdstr", name: "密码强度", description: "密码强度检测", category: "加密", icon: "shield" },
  { id: "uuid", name: "UUID 生成", description: "UUID v4 批量生成", category: "加密", icon: "id" },
  // 转换
  {
    id: "color",
    name: "颜色转换",
    description: "HEX/RGB/HSL 互转",
    category: "转换",
    icon: "color",
  },
  {
    id: "numberbase",
    name: "进制转换",
    description: "二/八/十/十六进制",
    category: "转换",
    icon: "number",
  },
  {
    id: "unit",
    name: "单位换算",
    description: "长度/重量/温度等",
    category: "转换",
    icon: "ruler",
  },
  {
    id: "exchange",
    name: "汇率换算",
    description: "货币汇率转换",
    category: "转换",
    icon: "money",
  },
  {
    id: "cron",
    name: "Cron 解析",
    description: "Cron 表达式中文描述",
    category: "转换",
    icon: "clock",
  },
  { id: "timestamp", name: "时间戳", description: "时间戳转换", category: "转换", icon: "clock" },
  // 网络
  { id: "http", name: "HTTP 测试", description: "HTTP 请求测试", category: "网络", icon: "globe" },
  { id: "ip", name: "IP 工具", description: "子网计算器", category: "网络", icon: "network" },
];

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
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [category, setCategory] = useState("全部");
  const [search, setSearch] = useState("");

  useEffect(() => {
    invoke<PluginInfo[]>("list_plugins")
      .then((result) => {
        setPlugins(result);
      })
      .catch(() => {
        setPlugins([]);
      });
  }, []);

  const allTools = useMemo(() => {
    const remote = plugins.map((p) => ({
      ...p,
      category: p.category || "Rust 插件",
    }));
    return [...LOCAL_TOOLS.map((t) => ({ ...t, enabled: true })), ...remote];
  }, [plugins]);

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

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("已复制");
  };

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
            <Statistic title="Rust 插件" value={plugins.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="分类数" value={CATEGORIES.length - 1} />
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
          title={allTools.length === 0 ? "插件市场暂无可用插件" : "未找到匹配的工具"}
          description={allTools.length === 0 ? "请稍后再来查看" : "尝试更换关键词或分类筛选"}
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
                  <Button size="small" type="link" onClick={() => copy(tool.id)}>
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
