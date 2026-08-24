import { useState } from "react";
import { Input, Button, Space, Card, message, Radio, Statistic, Row, Col } from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "dedup",
  label: "文本去重",
  description: "按行/按词/去空行",
  cmds: ["dedup", "deduplicate", "unique", "去重"],
  icon: "filter",
};


type Mode = "line" | "word" | "trim";

export default function DedupTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<Mode>("line");

  const dedup = () => {
    if (mode === "line") {
      const lines = input.split("\n");
      const seen = new Set<string>();
      const result: string[] = [];
      for (const line of lines) {
        if (!seen.has(line)) {
          seen.add(line);
          result.push(line);
        }
      }
      setOutput(result.join("\n"));
    } else if (mode === "word") {
      const words = input.split(/\s+/).filter(Boolean);
      const seen = new Set<string>();
      const result: string[] = [];
      for (const w of words) {
        if (!seen.has(w)) {
          seen.add(w);
          result.push(w);
        }
      }
      setOutput(result.join(" "));
    } else {
      // trim 模式：去除空白行
      const lines = input.split("\n");
      const seen = new Set<string>();
      const result: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !seen.has(trimmed)) {
          seen.add(trimmed);
          result.push(line);
        }
      }
      setOutput(result.join("\n"));
    }
    message.success("去重完成");
  };

  const inputCount =
    mode === "line"
      ? input.split("\n").length
      : mode === "word"
        ? input.split(/\s+/).filter(Boolean).length
        : input.split("\n").filter((l) => l.trim()).length;
  const outputCount =
    mode === "line"
      ? output.split("\n").length
      : mode === "word"
        ? output.split(/\s+/).filter(Boolean).length
        : output.split("\n").filter((l) => l.trim()).length;

  return (
    <Card title="文本去重" bordered={false}>
      <Radio.Group
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        style={{ marginBottom: 12 }}
      >
        <Radio.Button value="line">按行去重</Radio.Button>
        <Radio.Button value="word">按词去重</Radio.Button>
        <Radio.Button value="trim">去空行+去重</Radio.Button>
      </Radio.Group>
      <Input.TextArea
        rows={6}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入要去重的文本"
      />
      <Space style={{ margin: "12px 0" }}>
        <Button type="primary" onClick={dedup}>
          去重
        </Button>
        <Button
          onClick={() => {
            setInput("");
            setOutput("");
          }}
        >
          清空
        </Button>
        <Button
          onClick={() => {
            navigator.clipboard.writeText(output);
            message.success("已复制");
          }}
          disabled={!output}
        >
          复制结果
        </Button>
      </Space>
      {output && (
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Statistic title="去重前" value={inputCount} suffix={mode === "line" ? "行" : "词"} />
          </Col>
          <Col span={6}>
            <Statistic title="去重后" value={outputCount} suffix={mode === "line" ? "行" : "词"} />
          </Col>
          <Col span={6}>
            <Statistic
              title="删除"
              value={inputCount - outputCount}
              suffix={mode === "line" ? "行" : "词"}
            />
          </Col>
        </Row>
      )}
      <Input.TextArea
        rows={6}
        value={output}
        readOnly
        style={{ fontFamily: "monospace", background: "#fafafa" }}
      />
    </Card>
  );
}
