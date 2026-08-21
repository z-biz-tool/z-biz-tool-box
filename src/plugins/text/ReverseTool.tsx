import { useState } from "react";
import { Input, Button, Space, Card, message, Radio, Row, Col } from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "reverse",
  label: "文本翻转",
  description: "字符/单词/行翻转",
  icon: "retweet",
};


type Mode = "chars" | "words" | "lines" | "charsAll";

export default function ReverseTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<Mode>("chars");

  const reverse = () => {
    switch (mode) {
      case "chars":
        // 反转每个字符（正确处理 Unicode）
        setOutput(Array.from(input).reverse().join(""));
        break;
      case "charsAll":
        // 按 UTF-16 码元反转
        setOutput(input.split("").reverse().join(""));
        break;
      case "words":
        setOutput(input.split(/\s+/).reverse().join(" "));
        break;
      case "lines":
        setOutput(input.split("\n").reverse().join("\n"));
        break;
    }
    message.success("翻转完成");
  };

  return (
    <Card title="文本翻转" bordered={false}>
      <Radio.Group
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        style={{ marginBottom: 12 }}
      >
        <Radio.Button value="chars">字符翻转</Radio.Button>
        <Radio.Button value="charsAll">码元翻转</Radio.Button>
        <Radio.Button value="words">单词翻转</Radio.Button>
        <Radio.Button value="lines">行翻转</Radio.Button>
      </Radio.Group>
      <Row gutter={16}>
        <Col span={12}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>输入</div>
          <Input.TextArea
            rows={8}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入要翻转的文本"
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
        <Button type="primary" onClick={reverse}>
          翻转
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
    </Card>
  );
}
