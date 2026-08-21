import { useState } from "react";
import {
  Card,
  Input,
  Button,
  Space,
  Select,
  Tag,
  Row,
  Col,
  Statistic,
  message,
  Divider,
} from "antd";
import { invoke } from "@tauri-apps/api/core";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "http",
  label: "HTTP 测试",
  description: "GET/POST/PUT/DELETE/PATCH 调试",
  icon: "thunder",
};

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

interface Header {
  key: string;
  value: string;
}

interface Response {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
}

export default function HttpTester() {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://httpbin.org/get");
  const [headers, setHeaders] = useState<Header[]>([
    { key: "Content-Type", value: "application/json" },
  ]);
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!url) {
      message.warning("请输入 URL");
      return;
    }
    setLoading(true);
    setResponse(null);
    try {
      // 走 Rust 后端 — 支持 30s timeout + 强制忽略证书验证
      const headerObj: Record<string, string> = {};
      headers.forEach((h) => {
        if (h.key) headerObj[h.key] = h.value;
      });

      const resp = await invoke<{
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: string;
        elapsed_ms: number;
        success: boolean;
        error?: string;
      }>("http_request", {
        url,
        method,
        body: method !== "GET" && method !== "HEAD" ? body || null : null,
        headers: Object.keys(headerObj).length > 0 ? headerObj : null,
      });

      setResponse({
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
        body: resp.body,
        time: resp.elapsed_ms,
        size: new Blob([resp.body]).size,
      });
      message.success(`请求完成: ${resp.status}`);
    } catch (e) {
      setResponse({
        status: 0,
        statusText: "Error",
        headers: {},
        body: String(e),
        time: 0,
        size: 0,
      });
      message.error("请求失败: " + String(e));
    } finally {
      setLoading(false);
    }
  };

  const addHeader = () => setHeaders([...headers, { key: "", value: "" }]);
  const updateHeader = (index: number, field: keyof Header, value: string) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    setHeaders(newHeaders);
  };
  const removeHeader = (index: number) => setHeaders(headers.filter((_, i) => i !== index));

  const statusColor = response
    ? response.status >= 200 && response.status < 300
      ? "green"
      : response.status >= 300 && response.status < 400
        ? "blue"
        : response.status >= 400
          ? "red"
          : "default"
    : "default";

  // 尝试格式化 JSON
  const formattedBody = response?.body
    ? (() => {
        try {
          return JSON.stringify(JSON.parse(response.body), null, 2);
        } catch {
          return response.body;
        }
      })()
    : "";

  return (
    <Card title="HTTP 请求测试" bordered={false}>
      <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
        <Select
          value={method}
          onChange={setMethod}
          style={{ width: 120 }}
          options={METHODS.map((m) => ({ value: m, label: m }))}
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/endpoint"
          style={{ flex: 1 }}
        />
        <Button type="primary" onClick={send} loading={loading}>
          {loading ? "请求中..." : "发送"}
        </Button>
      </Space.Compact>

      <Card size="small" type="inner" title="请求头" style={{ marginBottom: 12 }}>
        {headers.map((h, i) => (
          <Space key={i} style={{ display: "flex", marginBottom: 8 }}>
            <Input
              value={h.key}
              onChange={(e) => updateHeader(i, "key", e.target.value)}
              placeholder="Header 名"
              style={{ width: 200 }}
            />
            <Input
              value={h.value}
              onChange={(e) => updateHeader(i, "value", e.target.value)}
              placeholder="Header 值"
              style={{ width: 300 }}
            />
            <Button danger size="small" onClick={() => removeHeader(i)}>
              删除
            </Button>
          </Space>
        ))}
        <Button size="small" onClick={addHeader} style={{ marginTop: 8 }}>
          + 添加请求头
        </Button>
      </Card>

      {method !== "GET" && method !== "HEAD" && (
        <Card size="small" type="inner" title="请求体" style={{ marginBottom: 12 }}>
          <Input.TextArea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder='{"key": "value"}'
            style={{ fontFamily: "monospace" }}
          />
        </Card>
      )}

      {response && (
        <>
          <Divider>响应</Divider>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <div style={{ fontSize: 12, color: "#999" }}>状态码</div>
                <Tag color={statusColor} style={{ fontSize: 18, marginTop: 4 }}>
                  {response.status} {response.statusText}
                </Tag>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="耗时" value={response.time} suffix="ms" />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="响应大小" value={response.size} suffix="B" />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="响应头数" value={Object.keys(response.headers).length} />
              </Card>
            </Col>
          </Row>
          <Card size="small" type="inner" title="响应头" style={{ marginBottom: 12 }}>
            <div
              style={{ fontFamily: "monospace", fontSize: 12, maxHeight: 150, overflow: "auto" }}
            >
              {Object.entries(response.headers).map(([k, v]) => (
                <div key={k}>
                  <Tag color="blue">{k}</Tag>: {v}
                </div>
              ))}
            </div>
          </Card>
          <Card size="small" type="inner" title="响应体" styles={{ body: { padding: 8 } }}>
            <Input.TextArea
              rows={10}
              value={formattedBody}
              readOnly
              style={{ fontFamily: "monospace", background: "#fafafa" }}
            />
          </Card>
        </>
      )}
    </Card>
  );
}
