import { useState } from "react";
import { Input, Button, Space, message } from "antd";
import { invoke } from "@tauri-apps/api/core";

export default function Base64Tool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const encode = async () => {
    const result = await invoke<string>("execute_plugin", {
      pluginId: "base64", action: "encode", input
    });
    setOutput(result);
  };

  const decode = async () => {
    const result = await invoke<string>("execute_plugin", {
      pluginId: "base64", action: "decode", input
    });
    setOutput(result);
  };

  return (
    <div>
      <h3>Base64 编解码</h3>
      <Input.TextArea
        rows={4}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入要编码/解码的文本"
      />
      <Space style={{ margin: "12px 0" }}>
        <Button type="primary" onClick={encode}>编码</Button>
        <Button onClick={decode}>解码</Button>
        <Button onClick={() => { setInput(""); setOutput(""); }}>清空</Button>
      </Space>
      <Input.TextArea rows={4} value={output} readOnly />
    </div>
  );
}
