import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Input,
  Button,
  Space,
  Tabs,
  Tag,
  Row as AntRow,
  Col,
  message,
  Tooltip,
  Empty,
  Switch,
  Select,
  Typography,
} from "antd";
import {
  CopyOutlined,
  FormatPainterOutlined,
  CompressOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  FileTextOutlined,
  SwapOutlined,
  CodeOutlined,
  ApartmentOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  ClearOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { MONO_FONT } from "../../_shared";
import type { PluginMeta } from "../_types";

export const meta: PluginMeta = {
  key: "json",
  label: "JSON 工具",
  description: "格式化/校验/Tree 视图/多格式转换/搜索/统计",
  cmds: [
    "json",
    "json format",
    "json格式化",
    "jsonpath",
    "JSON工具",
    "JSONPath",
    "json viewer",
    "json tree",
  ],
  icon: "database",
};

// ================== 主组件 ==================
export default function JsonTool() {
  const [input, setInput] = useState(
    '{\n  "name": "z-biz-tool-box",\n  "version": "0.1.0",\n  "tags": ["tool", "productivity"],\n  "stats": { "stars": 12, "forks": 3 },\n  "users": [\n    { "id": 1, "name": "alice", "active": true },\n    { "id": 2, "name": "bob", "active": false }\n  ]\n}',
  );
  const [indent, setIndent] = useState<number>(2);
  const [sortKeys, setSortKeys] = useState<boolean>(false);
  const [msgApi, msgContext] = message.useMessage();

  const safeParse = useCallback((text: string): { ok: true; value: unknown } | { ok: false; error: string } => {
    if (!text.trim()) return { ok: false, error: "输入为空" };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e: any) {
      return { ok: false, error: e.message ?? "解析失败" };
    }
  }, []);

  const parsed = useMemo(() => safeParse(input), [input, safeParse]);

  // 通用 stringify:支持 sortKeys + indent
  const stringify = useCallback(
    (v: unknown): string => {
      if (sortKeys) {
        return JSON.stringify(sortDeep(v), null, indent);
      }
      return JSON.stringify(v, null, indent);
    },
    [indent, sortKeys],
  );

  const format = () => {
    if (!parsed.ok) {
      msgApi.error(parsed.error);
      return;
    }
    setInput(stringify(parsed.value));
    msgApi.success("已格式化");
  };

  const minify = () => {
    if (!parsed.ok) {
      msgApi.error(parsed.error);
      return;
    }
    setInput(JSON.stringify(parsed.value));
    msgApi.success("已压缩");
  };

  const validate = () => {
    if (parsed.ok) {
      msgApi.success("✓ JSON 格式正确");
    } else {
      msgApi.error(`✗ ${parsed.error}`);
    }
  };

  const clear = () => {
    setInput("");
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => msgApi.success("已复制"),
      () => msgApi.error("复制失败"),
    );
  };

  const download = (text: string, filename: string) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 统计
  const stats = useMemo(() => computeStats(parsed.ok ? parsed.value : null), [parsed]);

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {msgContext}
      <AntRow gutter={12} align="middle" wrap={false}>
        <Col flex="auto">
          <Space wrap>
            <Tag color="blue" style={{ borderRadius: 6 }}>
              字符 {stats.chars}
            </Tag>
            <Tag color="cyan" style={{ borderRadius: 6 }}>
              行 {stats.lines}
            </Tag>
            <Tag color="purple" style={{ borderRadius: 6 }}>
              键 {stats.keys}
            </Tag>
            <Tag color="magenta" style={{ borderRadius: 6 }}>
              数组 {stats.arrays}
            </Tag>
            <Tag color="geekblue" style={{ borderRadius: 6 }}>
              深度 {stats.depth}
            </Tag>
            <Tag color={parsed.ok ? "success" : "error"} style={{ borderRadius: 6 }}>
              {parsed.ok ? "✓ 有效" : "✗ 无效"}
            </Tag>
          </Space>
        </Col>
        <Col>
          <Space>
            <Tooltip title="缩进空格数">
              <Select
                size="small"
                value={indent}
                onChange={setIndent}
                style={{ width: 80 }}
                options={[
                  { value: 2, label: "2 空格" },
                  { value: 4, label: "4 空格" },
                  { value: 0, label: "Tab" },
                ]}
              />
            </Tooltip>
            <Tooltip title="按键名字母序排序">
              <Space size={4}>
                <Typography.Text style={{ fontSize: 12 }}>排序</Typography.Text>
                <Switch size="small" checked={sortKeys} onChange={setSortKeys} />
              </Space>
            </Tooltip>
            <Button size="small" icon={<ClearOutlined />} onClick={clear}>
              清空
            </Button>
          </Space>
        </Col>
      </AntRow>

      <Tabs
        defaultActiveKey="format"
        items={[
          {
            key: "format",
            label: (
              <span>
                <FormatPainterOutlined /> 格式化
              </span>
            ),
            children: (
              <FormatTab
                input={input}
                setInput={setInput}
                error={parsed.ok ? null : parsed.error}
                onFormat={format}
                onMinify={minify}
                onValidate={validate}
                onCopy={() => copy(input)}
                onDownload={() => download(input, "input.json")}
                onSample={() => setInput(SAMPLE)}
              />
            ),
          },
          {
            key: "tree",
            label: (
              <span>
                <ApartmentOutlined /> 树视图
              </span>
            ),
            children: <TreeTab parsed={parsed} onCopy={copy} onDownload={download} />,
          },
          {
            key: "convert",
            label: (
              <span>
                <SwapOutlined /> 转换
              </span>
            ),
            children: (
              <ConvertTab
                parsed={parsed}
                indent={indent}
                onCopy={copy}
                onDownload={download}
              />
            ),
          },
          {
            key: "path",
            label: (
              <span>
                <SearchOutlined /> 搜索/Path
              </span>
            ),
            children: <PathSearchTab parsed={parsed} onCopy={copy} />,
          },
          {
            key: "tools",
            label: (
              <span>
                <ThunderboltOutlined /> 工具
              </span>
            ),
            children: <ToolsTab input={input} setInput={setInput} onCopy={copy} />,
          },
        ]}
      />
    </div>
  );
}

// ================== Tab 1: 格式化 ==================
function FormatTab({
  input,
  setInput,
  error,
  onFormat,
  onMinify,
  onValidate,
  onCopy,
  onDownload,
  onSample,
}: {
  input: string;
  setInput: (v: string) => void;
  error: string | null;
  onFormat: () => void;
  onMinify: () => void;
  onValidate: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onSample: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <Space wrap>
        <Button type="primary" icon={<FormatPainterOutlined />} onClick={onFormat}>
          格式化
        </Button>
        <Button icon={<CompressOutlined />} onClick={onMinify}>
          压缩
        </Button>
        <Button icon={<CheckCircleOutlined />} onClick={onValidate}>
          校验
        </Button>
        <Button icon={<CopyOutlined />} onClick={onCopy}>
          复制
        </Button>
        <Button icon={<DownloadOutlined />} onClick={onDownload}>
          下载
        </Button>
        <Button onClick={onSample}>示例</Button>
      </Space>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            minHeight: 360,
            fontFamily: MONO_FONT,
            fontSize: 13,
            resize: "none",
            borderColor: error ? "#ff4d4f" : undefined,
          }}
          placeholder='{"name":"test","age":25}'
        />
        {error && (
          <div style={{ color: "#ff4d4f", fontSize: 12, marginTop: 6, fontFamily: MONO_FONT }}>
            ✗ {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ================== Tab 2: 树视图 ==================
function TreeTab({
  parsed,
  onCopy,
  onDownload,
}: {
  parsed: { ok: true; value: unknown } | { ok: false; error: string };
  onCopy: (s: string) => void;
  onDownload: (s: string, name: string) => void;
}) {
  if (!parsed.ok) {
    return <Empty description={parsed.error} />;
  }
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <Space>
        <Button
          size="small"
          icon={<CopyOutlined />}
          onClick={() => onCopy(JSON.stringify(parsed.value, null, 2))}
        >
          复制全部
        </Button>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={() => onDownload(JSON.stringify(parsed.value, null, 2), "tree.json")}
        >
          下载 .json
        </Button>
      </Space>
      <div
        className="zBizScroll"
        style={{
          flex: 1,
          minHeight: 360,
          overflow: "auto",
          background: "var(--ant-color-bg-layout)",
          borderRadius: 8,
          padding: 12,
          fontFamily: MONO_FONT,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <JsonTree value={parsed.value} defaultExpanded />
      </div>
    </div>
  );
}

function JsonTree({ value, name, defaultExpanded = false, depth = 0 }: { value: unknown; name?: string; defaultExpanded?: boolean; depth?: number }) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 2);
  const [copied, setCopied] = useState(false);

  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);

  const toggle = () => isObject && setExpanded((e) => !e);

  const copyValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = isObject ? JSON.stringify(value, null, 2) : String(value);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  const renderKey = () => {
    if (name === undefined) return null;
    return <span style={{ color: "#8b5cf6", fontWeight: 500 }}>"{name}"</span>;
  };

  const renderColon = () => <span style={{ color: "var(--ant-color-text-tertiary)" }}>: </span>;

  if (!isObject) {
    return (
      <div style={{ paddingLeft: depth * 16, display: "flex", alignItems: "center", gap: 4 }}>
        {renderKey()}
        {name !== undefined && renderColon()}
        <PrimitivePreview value={value} />
        {name !== undefined && <CopyBtn onClick={copyValue} copied={copied} />}
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>);
  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";
  const isEmpty = entries.length === 0;

  return (
    <div>
      <div
        onClick={toggle}
        style={{
          paddingLeft: depth * 16,
          cursor: isEmpty ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          userSelect: "none",
        }}
      >
        {!isEmpty && (
          <span style={{ width: 12, color: "var(--ant-color-text-tertiary)", fontSize: 10 }}>
            {expanded ? "▼" : "▶"}
          </span>
        )}
        {renderKey()}
        {name !== undefined && renderColon()}
        <span style={{ color: "var(--ant-color-text-tertiary)" }}>{open}</span>
        {isEmpty && <span style={{ color: "var(--ant-color-text-tertiary)" }}>{close}</span>}
        {!isEmpty && !expanded && (
          <span style={{ color: "var(--ant-color-text-tertiary)", fontSize: 11 }}>
            {" "}
            {entries.length} {isArray ? "项" : "键"} …
          </span>
        )}
        {!isEmpty && !expanded && <span style={{ color: "var(--ant-color-text-tertiary)" }}>{close}</span>}
        {name !== undefined && <CopyBtn onClick={copyValue} copied={copied} />}
      </div>
      {expanded && !isEmpty && (
        <>
          {entries.map(([k, v]) => (
            <JsonTree key={k} name={k} value={v} depth={depth + 1} />
          ))}
          <div style={{ paddingLeft: depth * 16, color: "var(--ant-color-text-tertiary)" }}>{close}</div>
        </>
      )}
    </div>
  );
}

function PrimitivePreview({ value }: { value: unknown }) {
  if (value === null) return <span style={{ color: "#06b6d4", fontStyle: "italic" }}>null</span>;
  if (typeof value === "string") return <span style={{ color: "#10b981" }}>"{value}"</span>;
  if (typeof value === "number") return <span style={{ color: "#f59e0b" }}>{String(value)}</span>;
  if (typeof value === "boolean") return <span style={{ color: "#1677ff" }}>{String(value)}</span>;
  return <span>{String(value)}</span>;
}

function CopyBtn({ onClick, copied }: { onClick: (e: React.MouseEvent) => void; copied: boolean }) {
  return (
    <Tooltip title={copied ? "已复制" : "复制值"}>
      <span
        onClick={onClick}
        style={{
          marginLeft: 4,
          cursor: "pointer",
          fontSize: 11,
          color: copied ? "#10b981" : "var(--ant-color-text-tertiary)",
        }}
      >
        {copied ? "✓" : "📋"}
      </span>
    </Tooltip>
  );
}

// ================== Tab 3: 多格式转换 ==================
function ConvertTab({
  parsed,
  indent,
  onCopy,
  onDownload,
}: {
  parsed: { ok: true; value: unknown } | { ok: false; error: string };
  indent: number;
  onCopy: (s: string) => void;
  onDownload: (s: string, name: string) => void;
}) {
  const [msgApi, msgContext] = message.useMessage();
  const [output, setOutput] = useState("");

  if (!parsed.ok) {
    return <Empty description={parsed.error} />;
  }

  const convert = (kind: ConvertKind) => {
    try {
      const text = converters[kind](parsed.value, indent);
      setOutput(text);
      msgApi.success(`已转为 ${kind.toUpperCase()}`);
    } catch (e: any) {
      msgApi.error(`转换失败: ${e.message}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {msgContext}
      <Space wrap>
        {(["yaml", "csv", "xml", "typescript", "go", "json5"] as ConvertKind[]).map((k) => (
          <Button key={k} icon={CONVERT_ICONS[k]} onClick={() => convert(k)}>
            {CONVERT_LABELS[k]}
          </Button>
        ))}
      </Space>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Space style={{ marginBottom: 6 }}>
          <Button size="small" icon={<CopyOutlined />} disabled={!output} onClick={() => onCopy(output)}>
            复制
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            disabled={!output}
            onClick={() => onDownload(output, `output.${outputExt(output)}`)}
          >
            下载
          </Button>
        </Space>
        <Input.TextArea
          value={output}
          readOnly
          spellCheck={false}
          style={{ flex: 1, minHeight: 320, fontFamily: MONO_FONT, fontSize: 13, resize: "none" }}
          placeholder="选择上方按钮生成对应格式"
        />
      </div>
    </div>
  );
}

type ConvertKind = "yaml" | "csv" | "xml" | "typescript" | "go" | "json5";

const CONVERT_ICONS: Record<ConvertKind, React.ReactNode> = {
  yaml: <FileTextOutlined />,
  csv: <FileTextOutlined />,
  xml: <CodeOutlined />,
  typescript: <CodeOutlined />,
  go: <CodeOutlined />,
  json5: <FormatPainterOutlined />,
};

const CONVERT_LABELS: Record<ConvertKind, string> = {
  yaml: "→ YAML",
  csv: "→ CSV",
  xml: "→ XML",
  typescript: "→ TS Interface",
  go: "→ Go Struct",
  json5: "→ JSON5 (无引号)",
};

const converters: Record<ConvertKind, (v: unknown, indent: number) => string> = {
  yaml: (v, indent) => jsonToYaml(v, 0, indent),
  csv: (v) => jsonToCsv(v),
  xml: (v, indent) => jsonToXml(v, indent),
  typescript: (v, indent) => jsonToTs(v, "Root", indent),
  go: (v, indent) => jsonToGo(v, "Root", indent),
  json5: (v) => jsonToJson5(v),
};

function outputExt(text: string): string {
  if (text.startsWith("package ")) return "go";
  if (text.startsWith("<?xml")) return "xml";
  if (text.startsWith("export interface")) return "ts";
  if (text.includes("\n  - ") || text.match(/^\w+:/m)) return "yaml";
  if (text.includes(",") && text.split("\n").length > 1 && !text.includes(":")) return "csv";
  return "json5";
}

// ================== Tab 4: 搜索 / JSONPath ==================
function PathSearchTab({
  parsed,
  onCopy,
}: {
  parsed: { ok: true; value: unknown } | { ok: false; error: string };
  onCopy: (s: string) => void;
}) {
  const [path, setPath] = useState("$.users[*].name");
  const [keyQuery, setKeyQuery] = useState("");
  const [, msgContext] = message.useMessage();
  const [matches, setMatches] = useState<Array<{ path: string; value: unknown }>>([]);

  useEffect(() => {
    if (!parsed.ok) {
      setMatches([]);
      return;
    }
    const results: Array<{ path: string; value: unknown }> = [];
    const search = (node: unknown, p: string) => {
      if (keyQuery) {
        if (node !== null && typeof node === "object") {
          for (const [k, v] of Object.entries(node)) {
            const childPath = Array.isArray(node) ? `${p}[${k}]` : `${p}.${k}`;
            if (k.toLowerCase().includes(keyQuery.toLowerCase())) {
              results.push({ path: childPath, value: v });
            }
            search(v, childPath);
          }
        }
      } else {
        // 直接把 path 当成 JSONPath
        try {
          const r = jsonPath(node, path);
          if (r !== undefined) {
            // 一次只展示一个结果,实际可以多次追加
            results.length = 0;
            results.push({ path, value: r });
            setMatches([{ path, value: r }]);
            return;
          }
        } catch {
          /* ignore */
        }
      }
    };
    if (keyQuery) {
      search(parsed.value, "$");
      setMatches(results);
    } else {
      search(parsed.value, "$");
    }
  }, [parsed, path, keyQuery]);

  if (!parsed.ok) {
    return <Empty description={parsed.error} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {msgContext}
      <Space wrap>
        <Input
          prefix={<SearchOutlined />}
          placeholder="按 key 模糊搜索 (例: name)"
          value={keyQuery}
          onChange={(e) => setKeyQuery(e.target.value)}
          style={{ width: 240 }}
          allowClear
        />
        <Typography.Text type="secondary">或</Typography.Text>
        <Input
          prefix={<LinkOutlined />}
          placeholder="JSONPath (例: $.users[*].name)"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          style={{ width: 280 }}
        />
        <Tag color="blue">支持 $ .key [index] [*]</Tag>
      </Space>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Typography.Text style={{ fontSize: 12, marginBottom: 6 }}>
          命中 {matches.length} 条
        </Typography.Text>
        <div
          className="zBizScroll"
          style={{
            flex: 1,
            minHeight: 280,
            overflow: "auto",
            background: "var(--ant-color-bg-layout)",
            borderRadius: 8,
            padding: 12,
            fontFamily: MONO_FONT,
            fontSize: 12,
          }}
        >
          {matches.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配" />
          ) : (
            matches.map((m, i) => (
              <div
                key={i}
                style={{
                  padding: "6px 0",
                  borderBottom: "1px dashed var(--ant-color-border-secondary)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Tag color="purple" style={{ fontSize: 11 }}>
                    {m.path}
                  </Tag>
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => onCopy(JSON.stringify(m.value, null, 2))}
                  >
                    复制值
                  </Button>
                </div>
                <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {JSON.stringify(m.value, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ================== Tab 5: 工具 ==================
function ToolsTab({
  input,
  setInput,
  onCopy,
}: {
  input: string;
  setInput: (v: string) => void;
  onCopy: (s: string) => void;
}) {
  const [msgApi, msgContext] = message.useMessage();

  const escape = () => {
    setInput(JSON.stringify(input));
    msgApi.success("已转义");
  };
  const unescape = () => {
    try {
      setInput(JSON.parse(`"${input.replace(/\\"/g, '"').replace(/^"|"$/g, "")}"`));
      msgApi.success("已反转义");
    } catch {
      msgApi.error("反转义失败");
    }
  };
  const toBase64 = () => {
    try {
      onCopy(encodeBase64(input));
    } catch {
      msgApi.error("base64 失败");
    }
  };
  const fromBase64 = () => {
    try {
      setInput(decodeBase64(input.trim()));
      msgApi.success("已 base64 解码");
    } catch {
      msgApi.error("base64 解码失败");
    }
  };
  const toUrlEncoded = () => {
    onCopy(encodeURIComponent(input));
  };
  const fromUrlEncoded = () => {
    try {
      setInput(decodeURIComponent(input));
      msgApi.success("已 URL 解码");
    } catch {
      msgApi.error("URL 解码失败");
    }
  };
  const sortByKey = () => {
    try {
      const v = JSON.parse(input);
      setInput(JSON.stringify(sortDeep(v), null, 2));
      msgApi.success("已按键名字母序排序");
    } catch (e: any) {
      msgApi.error("解析失败: " + e.message);
    }
  };
  const randomCase = () => {
    const flip = (s: string) =>
      s
        .split("")
        .map((c) => (Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()))
        .join("");
    setInput(flip(input));
  };
  const removeWhitespace = () => {
    setInput(input.replace(/\s+/g, " ").trim());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {msgContext}
      <AntRow gutter={[16, 16]}>
        <Col span={8}>
          <ToolCard title="字符串处理" icon={<SwapOutlined />}>
            <Space wrap>
              <Button onClick={escape}>转义</Button>
              <Button onClick={unescape}>反转义</Button>
              <Button onClick={removeWhitespace}>合并空白</Button>
              <Button onClick={randomCase}>随机大小写</Button>
            </Space>
          </ToolCard>
        </Col>
        <Col span={8}>
          <ToolCard title="编码转换" icon={<CodeOutlined />}>
            <Space wrap>
              <Button onClick={toBase64}>→ Base64</Button>
              <Button onClick={fromBase64}>Base64 →</Button>
              <Button onClick={toUrlEncoded}>→ URL 编码</Button>
              <Button onClick={fromUrlEncoded}>URL →</Button>
            </Space>
          </ToolCard>
        </Col>
        <Col span={8}>
          <ToolCard title="结构变换" icon={<SortAscendingOutlined />}>
            <Space wrap>
              <Button onClick={sortByKey}>按键名字母序</Button>
            </Space>
          </ToolCard>
        </Col>
      </AntRow>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
        💡 这些操作直接修改输入框,可在「格式化」标签页看结果。
      </Typography.Paragraph>
    </div>
  );
}

function ToolCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--ant-color-bg-layout)",
        borderRadius: 8,
        padding: 14,
        height: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontWeight: 600 }}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

// ================== 工具函数 ==================
function computeStats(v: unknown) {
  if (v === null || v === undefined) {
    return { chars: 0, lines: 0, keys: 0, arrays: 0, depth: 0 };
  }
  const text = JSON.stringify(v);
  let keys = 0;
  let arrays = 0;
  let depth = 0;
  const walk = (node: unknown, d: number) => {
    depth = Math.max(depth, d);
    if (Array.isArray(node)) {
      arrays++;
      for (const item of node) walk(item, d + 1);
    } else if (node !== null && typeof node === "object") {
      keys += Object.keys(node as object).length;
      for (const v of Object.values(node as object)) walk(v, d + 1);
    }
  };
  walk(v, 1);
  return {
    chars: text.length,
    lines: text.split("\n").length,
    keys,
    arrays,
    depth,
  };
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = sortDeep(obj[k]);
    return sorted;
  }
  return v;
}

function jsonToYaml(v: unknown, indent: number, _userIndent: number): string {
  const pad = "  ".repeat(indent);
  if (v === null) return "null";
  if (v === undefined) return "null";
  if (typeof v === "string") {
    if (/[:\n#{}[\],&*?|<>=!%@`]/.test(v) || v.startsWith(" ") || v.endsWith(" ") || v === "") {
      return JSON.stringify(v);
    }
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return v
      .map((item) => {
        if (item !== null && typeof item === "object") {
          const lines = jsonToYaml(item, indent + 1, _userIndent).split("\n");
          return `${pad}-\n${lines.map((l) => "  " + l).join("\n")}`;
        }
        return `${pad}- ${jsonToYaml(item, indent + 1, _userIndent)}`;
      })
      .join("\n");
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([k, val]) => {
        if (val !== null && typeof val === "object") {
          return `${pad}${k}:\n${jsonToYaml(val, indent + 1, _userIndent)
            .split("\n")
            .map((l) => "  " + l)
            .join("\n")}`;
        }
        return `${pad}${k}: ${jsonToYaml(val, indent + 1, _userIndent)}`;
      })
      .join("\n");
  }
  return String(v);
}

function jsonToCsv(v: unknown): string {
  const arr = Array.isArray(v) ? v : [v];
  if (arr.length === 0) return "";
  const keys = Array.from(
    new Set(arr.flatMap((o) => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o as object) : []))),
  );
  if (keys.length === 0) {
    return arr.map((o) => (o === null ? "" : typeof o === "object" ? JSON.stringify(o) : String(o))).join("\n");
  }
  const esc = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const s = typeof val === "object" ? JSON.stringify(val) : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [keys.join(",")];
  for (const item of arr) {
    lines.push(keys.map((k) => esc((item as Record<string, unknown>)?.[k])).join(","));
  }
  return lines.join("\n");
}

function jsonToXml(v: unknown, indent: number): string {
  const inner = (node: unknown, name: string, d: number): string => {
    const p = "  ".repeat(d);
    if (node === null || node === undefined) return `${p}<${name}/>`;
    if (Array.isArray(node)) {
      return node.map((item) => inner(item, name, d)).join("\n");
    }
    if (typeof node === "object") {
      const entries = Object.entries(node as Record<string, unknown>);
      if (entries.length === 0) return `${p}<${name}/>`;
      return `${p}<${name}>\n${entries
        .map(([k, val]) => inner(val, k, d + 1))
        .join("\n")}\n${p}</${name}>`;
    }
    const s = String(node);
    const safe = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `${p}<${name}>${safe}</${name}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${inner(v, "root", indent)}`;
}

function jsonToTs(v: unknown, rootName: string, indent: number): string {
  const make = (node: unknown, name: string, d: number): string => {
    const p = "  ".repeat(d);
    if (node === null) return `${p}${name}: any;`;
    if (Array.isArray(node)) {
      if (node.length === 0) return `${p}${name}: any[];`;
      const sample = node[0];
      const itemType = `${capitalize(name)}Item`;
      if (sample !== null && typeof sample === "object" && !Array.isArray(sample)) {
        return `${p}${name}: ${itemType}[];\n${make(sample, itemType, d)}`;
      }
      return `${p}${name}: (${jsonTypeOf(sample)})[];`;
    }
    if (typeof node === "object") {
      const entries = Object.entries(node as Record<string, unknown>);
      const lines: string[] = [];
      lines.push(`${p}interface ${name} {`);
      for (const [k, val] of entries) {
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
          const childName = capitalize(k);
          lines.push(make(val, childName, d + 1));
          lines.push(`${p}  ${JSON.stringify(k)}: ${childName};`);
        } else if (Array.isArray(val) && val.length > 0 && val[0] !== null && typeof val[0] === "object") {
          const childName = capitalize(k) + "Item";
          lines.push(make(val[0], childName, d + 1));
          lines.push(`${p}  ${JSON.stringify(k)}: ${childName}[];`);
        } else {
          lines.push(`${p}  ${JSON.stringify(k)}: ${jsonTypeOf(val)};`);
        }
      }
      lines.push(`${p}}`);
      return lines.join("\n");
    }
    return `${p}${name}: ${jsonTypeOf(node)};`;
  };
  return make(v, rootName, indent);
}

function jsonToGo(v: unknown, name: string, indent: number): string {
  const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const make = (node: unknown, typeName: string, d: number): string => {
    const p = "  ".repeat(d);
    if (node === null || node === undefined) return "";
    if (typeof node !== "object" || Array.isArray(node)) return "";
    const entries = Object.entries(node as Record<string, unknown>);
    if (entries.length === 0) return `${p}type ${typeName} struct {}`;

    const fields: string[] = [];
    const nestedTypes: string[] = [];
    for (const [k, val] of entries) {
      const fieldName = upper(k);
      const tag = `\`json:"${k}"\``;
      if (val === null) {
        fields.push(`${p}  ${fieldName} interface{} ${tag}`);
      } else if (Array.isArray(val)) {
        if (val.length > 0) {
          const sample = val[0];
          if (sample !== null && typeof sample === "object" && !Array.isArray(sample)) {
            const childType = upper(k) + "Item";
            nestedTypes.push(make(sample, childType, d));
            fields.push(`${p}  ${fieldName} []${childType} ${tag}`);
          } else {
            fields.push(`${p}  ${fieldName} []${jsonTypeOfGo(sample)} ${tag}`);
          }
        } else {
          fields.push(`${p}  ${fieldName} []interface{} ${tag}`);
        }
      } else if (typeof val === "object") {
        const childType = upper(k);
        nestedTypes.push(make(val, childType, d));
        fields.push(`${p}  ${fieldName} ${childType} ${tag}`);
      } else {
        fields.push(`${p}  ${fieldName} ${jsonTypeOfGo(val)} ${tag}`);
      }
    }
    return `${p}type ${typeName} struct {\n${fields.join("\n")}\n${p}}\n\n${nestedTypes.join("\n")}`;
  };

  return `package model\n\n${make(v, name, indent)}`.trimEnd() + "\n";
}

function jsonToJson5(v: unknown): string {
  // JSON5 简化版:key 不加引号(如果是合法标识符),string 优先用单引号
  const seen = new WeakSet();
  const isIdent = (s: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
  const render = (node: unknown, depth: number): string => {
    if (node === null) return "null";
    if (typeof node === "boolean") return String(node);
    if (typeof node === "number") return String(node);
    if (typeof node === "string") {
      // 优先用单引号
      if (!node.includes("'")) return `'${node}'`;
      return `'${node.replace(/'/g, "\\'")}'`;
    }
    if (Array.isArray(node)) {
      if (node.length === 0) return "[]";
      const items = node.map((v) => "  ".repeat(depth + 1) + render(v, depth + 1));
      return `[\n${items.join(",\n")},\n${"  ".repeat(depth)}]`;
    }
    if (typeof node === "object") {
      if (seen.has(node as object)) return "<circular>";
      seen.add(node as object);
      const entries = Object.entries(node as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      const items = entries.map(
        ([k, v]) =>
          `${"  ".repeat(depth + 1)}${isIdent(k) ? k : JSON.stringify(k)}: ${render(v, depth + 1)}`,
      );
      return `{\n${items.join(",\n")},\n${"  ".repeat(depth)}}`;
    }
    return String(node);
  };
  return render(v, 0);
}

function jsonTypeOf(v: unknown): string {
  if (v === null) return "any";
  if (Array.isArray(v)) return "any[]";
  if (typeof v === "string") return "string";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "object") return "object";
  return "any";
}

function jsonTypeOfGo(v: unknown): string {
  if (v === null) return "interface{}";
  if (typeof v === "string") return "string";
  if (typeof v === "number") return Number.isInteger(v) ? "int64" : "float64";
  if (typeof v === "boolean") return "bool";
  return "interface{}";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// UTF-8 安全的 base64 编解码 (避免 deprecated unescape/escape)
function encodeBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(s: string): string {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// 简易 JSONPath:支持 $ .key [index] [*]
function jsonPath(obj: unknown, expr: string): unknown {
  if (!expr.startsWith("$")) return undefined;
  let current: any = obj;
  const tokens = parseJsonPath(expr.slice(1));
  for (const token of tokens) {
    if (current === undefined || current === null) return undefined;
    if (token.kind === "key") {
      current = current[token.value];
    } else if (token.kind === "index") {
      current = Array.isArray(current) ? current[Number(token.value)] : undefined;
    } else if (token.kind === "wildcard") {
      if (Array.isArray(current)) {
        // 收集所有元素
        const rest = tokens.slice(tokens.indexOf(token) + 1);
        const results: unknown[] = [];
        for (const item of current) {
          if (rest.length === 0) {
            results.push(item);
          } else {
            const sub = jsonPath(item, "$" + rest.map(jsonPathTokenToString).join(""));
            if (sub !== undefined) results.push(sub);
          }
        }
        return results;
      } else if (current && typeof current === "object") {
        current = Object.values(current);
      } else {
        return undefined;
      }
    } else if (token.kind === "descendant") {
      // 暂不实现递归下降
      return undefined;
    }
  }
  return current;
}

type PathToken = { kind: "key" | "index" | "wildcard" | "descendant"; value: string };

function parseJsonPath(s: string): PathToken[] {
  const tokens: PathToken[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ".") {
      if (s[i + 1] === "*") {
        tokens.push({ kind: "wildcard", value: "*" });
        i += 2;
      } else {
        i++;
        let j = i;
        while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
        if (j > i) {
          tokens.push({ kind: "key", value: s.slice(i, j) });
        }
        i = j;
      }
    } else if (c === "[") {
      let j = i + 1;
      while (j < s.length && s[j] !== "]") j++;
      const inner = s.slice(i + 1, j);
      if (inner === "*") {
        tokens.push({ kind: "wildcard", value: "*" });
      } else if (/^\d+$/.test(inner)) {
        tokens.push({ kind: "index", value: inner });
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return tokens;
}

function jsonPathTokenToString(t: PathToken): string {
  if (t.kind === "key") return `.${t.value}`;
  if (t.kind === "index") return `[${t.value}]`;
  if (t.kind === "wildcard") return "[*]";
  return "";
}

const SAMPLE = `{
  "name": "z-biz-tool-box",
  "version": "0.1.0",
  "tags": ["tool", "productivity"],
  "stats": { "stars": 12, "forks": 3 },
  "users": [
    { "id": 1, "name": "alice", "active": true },
    { "id": 2, "name": "bob", "active": false }
  ]
}`;
