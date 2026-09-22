import { useState, useMemo, useCallback } from "react";
import {
  Input,
  Button,
  Space,
  Tag,
  Row as AntRow,
  Col,
  message,
  Typography,
  Table,
  Switch,
  Tooltip,
} from "antd";
import {
  SearchOutlined,
  CopyOutlined,
  ClearOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import { MONO_FONT } from "../../_shared";
import type { PluginMeta } from "../_types";

export const meta: PluginMeta = {
  key: "regex",
  label: "正则测试器",
  description: "正则表达式可视化测试、匹配高亮、捕获组查看",
  cmds: ["regex", "正则", "正则测试", "regexp", "pattern"],
  icon: "code",
};

// 预设的常用正则表达式
const PRESETS = [
  { label: "邮箱", pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}" },
  { label: "手机号 (中国)", pattern: "1[3-9]\\d{9}" },
  { label: "IP 地址", pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b" },
  { label: "URL", pattern: "https?:\\/\\/[^\\s]+" },
  { label: "日期 (YYYY-MM-DD)", pattern: "\\d{4}-\\d{2}-\\d{2}" },
  { label: "中文字符", pattern: "[\\u4e00-\\u9fa5]+" },
  { label: "十六进制颜色", pattern: "#[0-9a-fA-F]{6}\\b" },
  { label: "HTML 标签", pattern: "<([a-z]+)[^>]*>(.*?)<\\/\\1>" },
];

// 颜色数组用于高亮不同的捕获组
const GROUP_COLORS = [
  "#1890ff",
  "#52c41a",
  "#faad14",
  "#ff4d4f",
  "#722ed1",
  "#13c2c2",
  "#eb2f96",
  "#fa8c16",
];

export default function RegexTester() {
  const [pattern, setPattern] = useState("\\b\\w+@\\w+\\.\\w+\\b");
  const [flags, setFlags] = useState("g");
  const [testString, setTestString] = useState(
    "联系我们：support@example.com 或 sales@test.org\n客服电话：13800138000\n官网：https://www.example.com"
  );
  const [showGroups, setShowGroups] = useState(true);
  const [msgApi, msgContext] = message.useMessage();

  // 解析正则表达式
  const regex = useMemo(() => {
    try {
      return new RegExp(pattern, flags);
    } catch (e: any) {
      return null;
    }
  }, [pattern, flags]);

  // 执行匹配
  const matches = useMemo(() => {
    if (!regex || !testString) return [];
    const results: Array<{
      match: string;
      index: number;
      groups: string[];
      namedGroups: Record<string, string>;
    }> = [];

    // 重置 lastIndex（因为使用了 g 标志）
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = regex.exec(testString)) !== null) {
      results.push({
        match: m[0],
        index: m.index,
        groups: m.slice(1).map((g) => g ?? ""),
        namedGroups: m.groups ?? {},
      });
      // 防止无限循环（空匹配）
      if (m[0].length === 0) {
        regex.lastIndex++;
      }
    }

    return results;
  }, [regex, testString]);

  // 生成高亮 HTML
  const highlightedHtml = useMemo(() => {
    if (!regex || !testString || matches.length === 0) {
      return escapeHtml(testString);
    }

    // 构建匹配位置数组
    const parts: Array<{ start: number; end: number; matchIndex: number }> = [];
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    let idx = 0;

    while ((m = regex.exec(testString)) !== null) {
      parts.push({
        start: m.index,
        end: m.index + m[0].length,
        matchIndex: idx++,
      });
      if (m[0].length === 0) {
        regex.lastIndex++;
      }
    }

    // 生成高亮文本
    let result = "";
    let lastEnd = 0;

    for (const part of parts) {
      // 添加匹配前的文本
      if (part.start > lastEnd) {
        result += escapeHtml(testString.slice(lastEnd, part.start));
      }
      // 添加高亮的匹配文本
      const color = GROUP_COLORS[part.matchIndex % GROUP_COLORS.length];
      result += `<mark style="background:${color}33;border-bottom:2px solid ${color};padding:0 2px;border-radius:2px">${escapeHtml(testString.slice(part.start, part.end))}</mark>`;
      lastEnd = part.end;
    }

    // 添加剩余文本
    if (lastEnd < testString.length) {
      result += escapeHtml(testString.slice(lastEnd));
    }

    return result;
  }, [regex, testString, matches]);

  // 切换标志位
  const toggleFlag = useCallback(
    (flag: string) => {
      setFlags((prev) => {
        if (prev.includes(flag)) {
          return prev.replace(flag, "");
        }
        return prev + flag;
      });
    },
    []
  );

  // 复制到剪贴板
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => msgApi.success("已复制"),
      () => msgApi.error("复制失败")
    );
  };

  // 清空
  const clear = () => {
    setPattern("");
    setTestString("");
  };

  return (
    <div
      style={{
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100%",
      }}
    >
      {msgContext}

      {/* 正则表达式输入 */}
      <AntRow gutter={12} align="middle">
        <Col flex="auto">
          <Input
            prefix={<SearchOutlined style={{ color: "#1890ff" }} />}
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="输入正则表达式..."
            style={{ fontFamily: MONO_FONT }}
            suffix={
              regex ? (
                <Tag color="success" style={{ margin: 0 }}>
                  <CheckCircleOutlined /> 有效
                </Tag>
              ) : (
                <Tag color="error" style={{ margin: 0 }}>
                  <CloseCircleOutlined /> 无效
                </Tag>
              )
            }
          />
        </Col>
        <Col>
          <Space>
            <Tooltip title="全局匹配 (g)">
              <Switch
                size="small"
                checked={flags.includes("g")}
                onChange={() => toggleFlag("g")}
                checkedChildren="g"
                unCheckedChildren="g"
              />
            </Tooltip>
            <Tooltip title="忽略大小写 (i)">
              <Switch
                size="small"
                checked={flags.includes("i")}
                onChange={() => toggleFlag("i")}
                checkedChildren="i"
                unCheckedChildren="i"
              />
            </Tooltip>
            <Tooltip title="多行模式 (m)">
              <Switch
                size="small"
                checked={flags.includes("m")}
                onChange={() => toggleFlag("m")}
                checkedChildren="m"
                unCheckedChildren="m"
              />
            </Tooltip>
          </Space>
        </Col>
      </AntRow>

      {/* 预设正则 */}
      <Space wrap size={[4, 4]}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          预设:
        </Typography.Text>
        {PRESETS.map((p) => (
          <Tag
            key={p.label}
            style={{ cursor: "pointer", borderRadius: 4 }}
            onClick={() => setPattern(p.pattern)}
          >
            {p.label}
          </Tag>
        ))}
      </Space>

      {/* 统计信息 */}
      <Space>
        <Tag color="blue" style={{ borderRadius: 6 }}>
          匹配 {matches.length} 处
        </Tag>
        {regex && (
          <Tag color="cyan" style={{ borderRadius: 6 }}>
            标志: {flags || "无"}
          </Tag>
        )}
      </Space>

      {/* 主内容区 */}
      <AntRow gutter={16} style={{ flex: 1, minHeight: 0 }}>
        {/* 左侧：测试字符串 */}
        <Col span={12} style={{ height: "100%" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography.Text strong>测试字符串</Typography.Text>
              <Space size={4}>
                <Button size="small" icon={<CopyOutlined />} onClick={() => copy(testString)}>
                  复制
                </Button>
                <Button size="small" icon={<ClearOutlined />} onClick={clear}>
                  清空
                </Button>
              </Space>
            </div>
            <Input.TextArea
              value={testString}
              onChange={(e) => setTestString(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                minHeight: 200,
                fontFamily: MONO_FONT,
                fontSize: 13,
                resize: "none",
              }}
              placeholder="输入要测试的字符串..."
            />
          </div>
        </Col>

        {/* 右侧：高亮结果 */}
        <Col span={12} style={{ height: "100%" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography.Text strong>匹配结果 (高亮)</Typography.Text>
              <Tooltip title="显示捕获组详情">
                <Switch
                  size="small"
                  checked={showGroups}
                  onChange={setShowGroups}
                  checkedChildren="组"
                  unCheckedChildren="组"
                />
              </Tooltip>
            </div>
            <div
              className="zBizScroll"
              style={{
                flex: 1,
                minHeight: 200,
                overflow: "auto",
                background: "var(--ant-color-bg-layout)",
                borderRadius: 8,
                padding: 12,
                fontFamily: MONO_FONT,
                fontSize: 13,
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </div>
        </Col>
      </AntRow>

      {/* 捕获组详情 */}
      {showGroups && matches.length > 0 && (
        <div
          style={{
            background: "var(--ant-color-bg-layout)",
            borderRadius: 8,
            padding: 12,
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          <Typography.Text strong style={{ marginBottom: 8, display: "block" }}>
            捕获组详情
          </Typography.Text>
          <Table
            size="small"
            pagination={false}
            dataSource={matches.map((m, i) => ({
              key: i,
              index: m.index,
              match: m.match,
              groups: m.groups,
            }))}
            columns={[
              {
                title: "#",
                dataIndex: "key",
                width: 50,
                render: (_, __, i) => i + 1,
              },
              {
                title: "位置",
                dataIndex: "index",
                width: 80,
              },
              {
                title: "完整匹配",
                dataIndex: "match",
                render: (text: string) => (
                  <Tag color="blue" style={{ fontFamily: MONO_FONT }}>
                    {text}
                  </Tag>
                ),
              },
              {
                title: "捕获组",
                dataIndex: "groups",
                render: (groups: string[]) =>
                  groups.length > 0 ? (
                    <Space size={[4, 4]} wrap>
                      {groups.map((g, i) => (
                        <Tag
                          key={i}
                          color={GROUP_COLORS[i % GROUP_COLORS.length]}
                          style={{ fontFamily: MONO_FONT }}
                        >
                          ${i + 1}: {g}
                        </Tag>
                      ))}
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">无</Typography.Text>
                  ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

// HTML 转义
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}