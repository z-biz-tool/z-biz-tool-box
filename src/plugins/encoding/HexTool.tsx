import { useState } from "react";
import { Input, Button, Space, Card, message, Row, Col, Radio } from "antd";
import { usePluginInput } from "../../_shared";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "hex",
  label: "Hex 编解码",
  description: "十六进制编码与解码",
  icon: "hex",
};


type Mode = "string" | "bytes";

export default function HexTool() {
  const [input, setInput] = usePluginInput("hex");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<Mode>("string");

  const encode = () => {
    try {
      let hex = "";
      if (mode === "string") {
        // 按 UTF-8 字节编码
        const bytes = new TextEncoder().encode(input);
        hex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");
      } else {
        // 把输入当作空格分隔的十进制字节
        const bytes = input
          .trim()
          .split(/\s+/)
          .map((s) => parseInt(s, 10));
        hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
      }
      setOutput(hex.toUpperCase());
    } catch {
      message.error("编码失败");
    }
  };

  const decode = () => {
    try {
      const hexStr = input.replace(/0x/gi, "").replace(/[^0-9a-fA-F]/g, "");
      if (hexStr.length % 2 !== 0) {
        message.error("Hex 长度必须为偶数");
        return;
      }
      const bytes = new Uint8Array(hexStr.length / 2);
      for (let i = 0; i < hexStr.length; i += 2) {
        bytes[i / 2] = parseInt(hexStr.substr(i, 2), 16);
      }
      setOutput(new TextDecoder().decode(bytes));
    } catch {
      message.error("解码失败：无效的 Hex");
    }
  };

  const copyOut = () => {
    navigator.clipboard.writeText(output);
    message.success("已复制到剪贴板");
  };

  return (
    <Card title="Hex 十六进制编解码" bordered={false}>
      <Radio.Group
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        style={{ marginBottom: 12 }}
      >
        <Radio.Button value="string">字符串→Hex</Radio.Button>
        <Radio.Button value="bytes">字节→Hex</Radio.Button>
      </Radio.Group>
      <Row gutter={16}>
        <Col span={12}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>输入</div>
          <Input.TextArea
            rows={8}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "string" ? "输入文本字符串" : "输入空格分隔的十进制字节"}
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
