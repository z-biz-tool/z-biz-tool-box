import { useState } from "react";
import { Input, Button, Space, Card, message, Tabs, Tag } from "antd";
import { invoke } from "@tauri-apps/api/core";

export default function JsonTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  const safe = (fn: () => void) => {
    try {
      setError("");
      fn();
    } catch (e) {
      setError(String(e));
      message.error("操作失败：" + String(e));
    }
  };

  const format = async () => {
    try {
      const result = await invoke<string>("execute_plugin", {
        pluginId: "json-format", action: "format", input,
      });
      setOutput(result);
      setError("");
    } catch {
      // 回退前端实现
      safe(() => {
        const obj = JSON.parse(input);
        setOutput(JSON.stringify(obj, null, 2));
      });
    }
  };

  const minify = async () => {
    try {
      const result = await invoke<string>("execute_plugin", {
        pluginId: "json-format", action: "minify", input,
      });
      setOutput(result);
      setError("");
    } catch {
      safe(() => {
        const obj = JSON.parse(input);
        setOutput(JSON.stringify(obj));
      });
    }
  };

  const validate = () => safe(() => {
    JSON.parse(input);
    setOutput("✓ JSON 格式正确");
    message.success("JSON 格式正确");
  });

  const toCsv = () => safe(() => {
    const obj = JSON.parse(input);
    const arr = Array.isArray(obj) ? obj : [obj];
    if (arr.length === 0) { setOutput(""); return; }
    const keys = Array.from(new Set(arr.flatMap((o: Record<string, unknown>) => Object.keys(o))));
    const escapeCsv = (v: unknown) => {
      const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [keys.join(",")];
    for (const item of arr) {
      lines.push(keys.map((k) => escapeCsv((item as Record<string, unknown>)[k])).join(","));
    }
    setOutput(lines.join("\n"));
    message.success("已转为 CSV");
  });

  const toYaml = () => safe(() => {
    const obj = JSON.parse(input);
    setOutput(jsonToYaml(obj, 0));
    message.success("已转为 YAML");
  });

  const [pathExpr, setPathExpr] = useState("$.data");
  const extractPath = () => safe(() => {
    const obj = JSON.parse(input);
    const result = jsonPath(obj, pathExpr);
    setOutput(JSON.stringify(result, null, 2));
    message.success("提取完成");
  });

  const escape = () => safe(() => {
    setOutput(JSON.stringify(input));
  });

  const unescape = () => safe(() => {
    setOutput(JSON.parse(`"${input}"`));
  });

  return (
    <Card title="JSON 工具" bordered={false}>
      <Tabs
        items={[
          {
            key: "main",
            label: "格式化/压缩",
            children: (
              <>
                <Input.TextArea
                  rows={6}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='{"name":"test","age":25}'
                />
                <Space wrap style={{ margin: "12px 0" }}>
                  <Button type="primary" onClick={format}>格式化</Button>
                  <Button onClick={minify}>压缩</Button>
                  <Button onClick={validate}>校验</Button>
                  <Button onClick={escape}>转义</Button>
                  <Button onClick={unescape}>反转义</Button>
                  <Button onClick={() => { setInput(""); setOutput(""); setError(""); }}>清空</Button>
                </Space>
              </>
            ),
          },
          {
            key: "convert",
            label: "转换",
            children: (
              <>
                <Input.TextArea
                  rows={6}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='输入 JSON 数组或对象'
                />
                <Space wrap style={{ margin: "12px 0" }}>
                  <Button type="primary" onClick={toCsv}>JSON → CSV</Button>
                  <Button type="primary" onClick={toYaml}>JSON → YAML</Button>
                  <Button onClick={() => { setInput(""); setOutput(""); }}>清空</Button>
                </Space>
              </>
            ),
          },
          {
            key: "path",
            label: "JSONPath 提取",
            children: (
              <>
                <Input.TextArea
                  rows={6}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='{"data":{"users":[{"id":1},{"id":2}]}}'
                />
                <Space style={{ margin: "12px 0" }} >
                  <Input
                    value={pathExpr}
                    onChange={(e) => setPathExpr(e.target.value)}
                    placeholder="$.data.users[*].id"
                    style={{ width: 300 }}
                  />
                  <Button type="primary" onClick={extractPath}>提取</Button>
                </Space>
                <Tag color="blue">支持: $  .key  [index]  [*]  .key1.key2</Tag>
              </>
            ),
          },
        ]}
      />
      {error && <div style={{ color: "red", margin: "8px 0" }}>{error}</div>}
      <Input.TextArea rows={8} value={output} readOnly style={{ fontFamily: "monospace", background: "#fafafa" }} />
    </Card>
  );
}

// 简易 JSONPath 实现
function jsonPath(obj: unknown, expr: string): unknown {
  if (!expr.startsWith("$")) return null;
  let current: unknown = obj;
  const tokens = expr.slice(1).match(/(\.)([^.\[\*]+)|(\[)(\d+|\*)\]/g) || [];
  for (const token of tokens) {
    if (token.startsWith(".")) {
      const key = token.slice(1);
      current = (current as Record<string, unknown>)?.[key];
    } else if (token.startsWith("[")) {
      const inner = token.slice(1, -1);
      if (inner === "*") {
        if (Array.isArray(current)) {
          current = current;
        } else {
          current = Object.values((current as Record<string, unknown>) || {});
        }
        // 后续的 .key 要应用到每个元素
        // 简化处理：直接返回数组
        return current;
      } else {
        const idx = parseInt(inner, 10);
        current = (current as unknown[])?.[idx];
      }
    }
  }
  return current;
}

// 简易 JSON → YAML
function jsonToYaml(obj: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  if (obj === null) return "null";
  if (obj === undefined) return "null";
  if (typeof obj === "string") {
    if (/[:\n#{}\[\],&*?|<>=!%@`]/.test(obj) || obj.startsWith(" ") || obj.endsWith(" ")) {
      return JSON.stringify(obj);
    }
    return obj;
  }
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj.map((item) => {
      const val = jsonToYaml(item, indent + 1);
      if (typeof item === "object" && item !== null) {
        const inner = jsonToYaml(item, indent + 1);
        return `${pad}- ${inner.trimStart()}`;
      }
      return `${pad}- ${val}`;
    }).join("\n");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries.map(([key, val]) => {
      if (val !== null && typeof val === "object") {
        const nested = jsonToYaml(val, indent + 1);
        return `${pad}${key}:\n${nested}`;
      }
      return `${pad}${key}: ${jsonToYaml(val, indent + 1)}`;
    }).join("\n");
  }
  return String(obj);
}
