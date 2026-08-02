import { useState } from "react";
import { Button, Input, Space, message } from "antd";
import { invoke } from "@tauri-apps/api/core";

export default function UuidTool() {
  const [uuid, setUuid] = useState("");

  const generate = async () => {
    const result = await invoke<string>("execute_plugin", {
      pluginId: "uuid", action: "generate", input: ""
    });
    setUuid(result);
  };

  const copy = () => {
    navigator.clipboard.writeText(uuid);
    message.success("已复制");
  };

  return (
    <div>
      <h3>UUID 生成器</h3>
      <Space style={{ margin: "12px 0" }}>
        <Button type="primary" onClick={generate}>生成 UUID</Button>
        <Button onClick={copy} disabled={!uuid}>复制</Button>
      </Space>
      {uuid && <Input value={uuid} readOnly style={{ fontFamily: "monospace" }} />}
    </div>
  );
}
