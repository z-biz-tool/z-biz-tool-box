import { useState } from "react";
import { Input, Button, Space, Card, message } from "antd";
import { useCopyToClipboard, useClearAll } from "../../_shared";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "base64",
  label: "Base64",
  description: "Base64 编码与解码",
  icon: "code",
};

export default function Base64Tool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const copy = useCopyToClipboard();
  const clear = useClearAll([() => setInput(""), () => setOutput("")]);

  const encode = () => {
    try {
      setOutput(btoa(unescape(encodeURIComponent(input))));
    } catch {
      message.error("编码失败");
    }
  };

  const decode = () => {
    try {
      setOutput(decodeURIComponent(escape(atob(input))));
    } catch {
      message.error("解码失败:无效的 Base64");
    }
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
        <Button onClick={clear}>清空</Button>
        <Button onClick={() => copy(output)} disabled={!output}>复制结果</Button>
      </Space>
      <Input.TextArea rows={5} value={output} readOnly style={{ fontFamily: "monospace" }} />
    </Card>
  );
}
