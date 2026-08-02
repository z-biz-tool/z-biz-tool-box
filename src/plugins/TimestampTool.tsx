import { useState } from "react";
import { Input, Button, Space, Statistic } from "antd";
import { invoke } from "@tauri-apps/api/core";

export default function TimestampTool() {
  const [now, setNow] = useState("");

  const getNow = async () => {
    const result = await invoke<string>("execute_plugin", {
      pluginId: "timestamp", action: "now", input: ""
    });
    setNow(result);
  };

  return (
    <div>
      <h3>时间戳转换</h3>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Button type="primary" onClick={getNow}>获取当前时间戳</Button>
        {now && <Statistic title="当前时间戳" value={now} />}
      </Space>
    </div>
  );
}
