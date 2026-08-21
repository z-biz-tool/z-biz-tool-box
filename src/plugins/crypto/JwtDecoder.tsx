import { useState } from "react";
import { Input, Card, Row, Col, Tag, Alert, Typography, Space } from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "jwt",
  label: "JWT 解码",
  description: "JWT Token Header/Payload/Signature 解析",
  icon: "api",
};


export default function JwtDecoder() {
  const [token, setToken] = useState("");
  const [parts, setParts] = useState<{
    header: unknown;
    payload: unknown;
    signature: string;
  } | null>(null);
  const [error, setError] = useState("");

  const decode = (value: string) => {
    setToken(value);
    if (!value.trim()) {
      setParts(null);
      setError("");
      return;
    }
    const segments = value.trim().split(".");
    if (segments.length < 2) {
      setError("无效的 JWT：至少需要 header.payload 两部分");
      setParts(null);
      return;
    }
    try {
      setError("");
      const decodeB64 = (s: string): string => {
        // JWT 用 base64url，需要补齐 padding 并转换字符
        let str = s.replace(/-/g, "+").replace(/_/g, "/");
        while (str.length % 4) str += "=";
        return decodeURIComponent(escape(atob(str)));
      };
      const header = JSON.parse(decodeB64(segments[0]));
      const payload = JSON.parse(decodeB64(segments[1]));
      const signature = segments[2] || "(无签名)";
      setParts({ header, payload, signature });
    } catch (e) {
      setError("解码失败：" + String(e));
      setParts(null);
    }
  };

  const pretty = (obj: unknown) => JSON.stringify(obj, null, 2);

  // 检查过期
  const isExpired = () => {
    if (!parts || typeof parts.payload !== "object" || !parts.payload) return false;
    const p = parts.payload as Record<string, number>;
    if (p.exp) {
      return Date.now() / 1000 > p.exp;
    }
    return false;
  };

  return (
    <Card title="JWT 解码器" bordered={false}>
      <Input.TextArea
        rows={4}
        value={token}
        onChange={(e) => decode(e.target.value)}
        placeholder="粘贴 JWT token (eyJhbGciOi...)"
      />
      {error && <Alert type="error" message={error} style={{ margin: "12px 0" }} />}
      {parts && (
        <div style={{ marginTop: 12 }}>
          <Space>
            <Tag color="blue">
              算法: {String((parts.header as Record<string, unknown>)?.alg || "unknown")}
            </Tag>
            <Tag color={isExpired() ? "red" : "green"}>{isExpired() ? "已过期" : "有效"}</Tag>
            {(parts.payload as Record<string, number>)?.iat && (
              <Tag>
                签发:{" "}
                {new Date((parts.payload as Record<string, number>).iat * 1000).toLocaleString()}
              </Tag>
            )}
            {(parts.payload as Record<string, number>)?.exp && (
              <Tag>
                过期:{" "}
                {new Date((parts.payload as Record<string, number>).exp * 1000).toLocaleString()}
              </Tag>
            )}
          </Space>
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={8}>
              <Card size="small" title={<Tag color="purple">Header</Tag>} type="inner">
                <pre
                  style={{
                    fontSize: 12,
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {pretty(parts.header)}
                </pre>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title={<Tag color="cyan">Payload</Tag>} type="inner">
                <pre
                  style={{
                    fontSize: 12,
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {pretty(parts.payload)}
                </pre>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title={<Tag color="orange">Signature</Tag>} type="inner">
                <Typography.Text code style={{ wordBreak: "break-all", fontSize: 12 }}>
                  {parts.signature}
                </Typography.Text>
              </Card>
            </Col>
          </Row>
          <Alert
            type="warning"
            message="注意：JWT 解码不等于验证。此工具仅解码 Base64 部分，未校验签名。"
            style={{ marginTop: 12 }}
            showIcon
          />
        </div>
      )}
    </Card>
  );
}
