import { useState } from "react";
import { Input, Button, Space, Card, message } from "antd";
import { invoke } from "@tauri-apps/api/core";

export default function Base64Tool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const encode = async () => {
    try {
      const result = await invoke<string>("execute_plugin", {
        pluginId: "base64", action: "encode", input,
      });
      setOutput(result);
    } catch {
      // 回退到前端实现
      try {
        setOutput(btoa(unescape(encodeURIComponent(input))));
      } catch {
        message.error("编码失败");
      }
    }
  };

  const decode = async () => {
    try {
      const result = await invoke<string>("execute_plugin", {
        pluginId: "base64", action: "decode", input,
      });
      setOutput(result);
    } catch {
      try {
        setOutput(decodeURIComponent(escape(atob(input))));
      } catch {
        message.error("解码失败：无效的 Base64");
      }
    }
  };

  const copyOut = () => {
    navigator.clipboard.writeText(output);
    message.success("已复制到剪贴板");
  };

  return (
    <Card title="Base64 编解码" bordered={false}>
      <Input.TextArea
        rows={5}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入要编码/解码的文本"
      />
      <Space style={{ margin: "12px 0" }}>
        <Button type="primary" onClick={encode}>编码</Button>
        <Button onClick={decode}>解码</Button>
        <Button onClick={() => { setInput(""); setOutput(""); }}>清空</Button>
        <Button onClick={copyOut} disabled={!output}>复制结果</Button>
      </Space>
      <Input.TextArea rows={5} value={output} readOnly style={{ fontFamily: "monospace" }} />
    </Card>
  );
}
