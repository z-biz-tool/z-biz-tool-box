import { useState } from "react";
import { Input, Button, Space, Card, message, Row, Col } from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "url",
  label: "URL 编解码",
  description: "URL/URI 编码与解码",
  icon: "link",
};


export default function UrlTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const encode = () => {
    try {
      setOutput(encodeURIComponent(input));
    } catch {
      message.error("编码失败");
    }
  };

  const decode = () => {
    try {
      setOutput(decodeURIComponent(input));
    } catch {
      message.error("解码失败：无效的 URL 编码");
    }
  };

  const encodeAll = () => {
    // 对所有字符进行编码（包括中文等）
    try {
      setOutput(
        Array.from(input)
          .map((c) => {
            const code = c.codePointAt(0)!;
            if (code < 128) {
              return "%" + code.toString(16).toUpperCase().padStart(2, "0");
            }
            return encodeURIComponent(c);
          })
          .join("")
      );
    } catch {
      message.error("编码失败");
    }
  };

  const copyOut = () => {
    navigator.clipboard.writeText(output);
    message.success("已复制到剪贴板");
  };

  return (
    <Card title="URL 编解码" bordered={false}>
      <Row gutter={16}>
        <Col span={12}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>输入</div>
          <Input.TextArea
            rows={8}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入要编码/解码的文本"
          />
        </Col>
        <Col span={12}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>输出</div>
          <Input.TextArea
            rows={8}
            value={output}
            readOnly
            style={{ fontFamily: "monospace", background: "#fafafa" }}
          />
        </Col>
      </Row>
      <Space style={{ margin: "12px 0" }}>
        <Button type="primary" onClick={encode}>
          编码
        </Button>
        <Button onClick={encodeAll}>全量编码</Button>
        <Button onClick={decode}>解码</Button>
        <Button
          onClick={() => {
            setInput("");
            setOutput("");
          }}
        >
          清空
        </Button>
        <Button onClick={copyOut} disabled={!output}>
          复制结果
        </Button>
      </Space>
    </Card>
  );
}
