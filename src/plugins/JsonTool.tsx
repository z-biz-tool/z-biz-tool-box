import { useState } from "react";
import { Input, Button, Space } from "antd";
import { invoke } from "@tauri-apps/api/core";

export default function JsonTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const format = async () => {
    const result = await invoke<string>("execute_plugin", {
      pluginId: "json-format", action: "format", input
    });
    setOutput(result);
  };

  const minify = async () => {
    const result = await invoke<string>("execute_plugin", {
      pluginId: "json-format", action: "minify", input
    });
    setOutput(result);
  };

  return (
    <div>
      <h3>JSON 格式化</h3>
      <Input.TextArea
        rows={6}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder='{"name":"test","age":25}'
      />
      <Space style={{ margin: "12px 0" }}>
        <Button type="primary" onClick={format}>格式化</Button>
        <Button onClick={minify}>压缩</Button>
        <Button onClick={() => { setInput(""); setOutput(""); }}>清空</Button>
      </Space>
      <Input.TextArea rows={6} value={output} readOnly style={{ fontFamily: "monospace" }} />
    </div>
  );
}
