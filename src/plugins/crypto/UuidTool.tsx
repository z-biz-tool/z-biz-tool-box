import { useState } from "react";
import {
  Button,
  Input,
  Space,
  Card,
  message,
  InputNumber,
  Select,
  List,
  Tag,
  Typography,
} from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "uuid",
  label: "UUID 生成",
  description: "UUID v4 批量生成/历史",
  cmds: ["uuid", "guid", "UUID生成"],
  icon: "id",
};


export default function UuidTool() {
  const [uuid, setUuid] = useState("");
  const [count, setCount] = useState(1);
  const [version, setVersion] = useState<"v4" | "nil">("v4");
  const [uppercase, setUppercase] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [history, setHistory] = useState<string[]>([]);

  const generateV4 = (): string => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // 设置版本位 (version 4)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // 设置变体位
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    let result = hyphens
      ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      : hex;
    if (uppercase) result = result.toUpperCase();
    return result;
  };

  const generateNil = (): string => {
    return uppercase
      ? "00000000-0000-0000-0000-000000000000"
      : "00000000-0000-0000-0000-000000000000";
  };

  const generate = () => {
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      results.push(version === "v4" ? generateV4() : generateNil());
    }
    if (count === 1) {
      setUuid(results[0]);
      setHistory([results[0], ...history].slice(0, 50));
    } else {
      setUuid(results.join("\n"));
      setHistory([...results, ...history].slice(0, 50));
    }
    message.success(`已生成 ${count} 个 UUID`);
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("已复制");
  };

  return (
    <Card title="UUID 生成器" bordered={false}>
      <Space wrap style={{ marginBottom: 12 }}>
        <span>版本:</span>
        <Select
          value={version}
          onChange={setVersion}
          style={{ width: 120 }}
          options={[
            { value: "v4", label: "UUID v4 随机" },
            { value: "nil", label: "Nil UUID (全0)" },
          ]}
        />
        <span style={{ marginLeft: 16 }}>批量数量:</span>
        <InputNumber min={1} max={1000} value={count} onChange={(v) => setCount(v || 1)} />
        <Tag.CheckableTag checked={uppercase} onChange={(c) => setUppercase(c)}>
          大写
        </Tag.CheckableTag>
        <Tag.CheckableTag checked={hyphens} onChange={(c) => setHyphens(c)}>
          连字符
        </Tag.CheckableTag>
      </Space>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={generate}>
          生成 UUID
        </Button>
        <Button onClick={() => uuid && copy(uuid)} disabled={!uuid}>
          复制
        </Button>
        <Button
          onClick={() => {
            setUuid("");
          }}
        >
          清空
        </Button>
      </Space>
      {uuid && (
        <Input.TextArea
          rows={count > 1 ? 6 : 2}
          value={uuid}
          readOnly
          style={{ fontFamily: "monospace", marginBottom: 12 }}
        />
      )}
      {history.length > 0 && (
        <Card size="small" title={`历史记录 (${history.length})`} type="inner">
          <List
            size="small"
            dataSource={history.slice(0, 20)}
            renderItem={(item, index) => (
              <List.Item
                actions={[
                  <Button size="small" onClick={() => copy(item)}>
                    复制
                  </Button>,
                ]}
              >
                <Typography.Text code style={{ fontFamily: "monospace", fontSize: 12 }}>
                  {index + 1}. {item}
                </Typography.Text>
              </List.Item>
            )}
          />
        </Card>
      )}
    </Card>
  );
}
