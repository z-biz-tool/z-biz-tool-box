import { useState, useEffect } from "react";
import { List, Typography } from "antd";

export default function ClipboardTool() {
  const [history, setHistory] = useState<string[]>([]);

  return (
    <div>
      <h3>剪贴板历史</h3>
      <List
        dataSource={history}
        locale={{ emptyText: "剪贴板历史将显示在这里" }}
        renderItem={(item, index) => (
          <List.Item>
            <Typography.Text>{item}</Typography.Text>
          </List.Item>
        )}
      />
    </div>
  );
}
