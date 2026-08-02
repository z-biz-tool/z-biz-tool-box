import { useState } from "react";
import { Input, Button, Space, Card, message, Row, Col } from "antd";

const NAMED_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
  " ": "&nbsp;",
  "\u00A9": "&copy;",
  "\u00AE": "&reg;",
  "\u2122": "&trade;",
  "\u20AC": "&euro;",
  "\u00A3": "&pound;",
  "\u00A5": "&yen;",
  "\u00A2": "&cent;",
  "\u00A7": "&sect;",
  "\u00B6": "&para;",
  "\u00B0": "&deg;",
  "\u00B1": "&plusmn;",
  "\u00D7": "&times;",
  "\u00F7": "&divide;",
  "\u2192": "&rarr;",
  "\u2190": "&larr;",
  "\u2191": "&uarr;",
  "\u2193": "&darr;",
  "\u2605": "&star;",
  "\u2606": "&starf;",
  "\u2022": "&bull;",
  "\u2026": "&hellip;",
  "\u2014": "&mdash;",
  "\u2013": "&ndash;",
  "\u201C": "&ldquo;",
  "\u201D": "&rdquo;",
  "\u2018": "&lsquo;",
  "\u2019": "&rsquo;",
};

export default function HtmlEntityTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const encode = () => {
    let result = "";
    for (const ch of input) {
      if (NAMED_ENTITIES[ch]) {
        result += NAMED_ENTITIES[ch];
      } else {
        const code = ch.codePointAt(0)!;
        if (code > 127) {
          result += `&#${code};`;
        } else {
          result += ch;
        }
      }
    }
    setOutput(result);
  };

  const decode = () => {
    let result = input;
    // 解码命名实体
    for (const [char, entity] of Object.entries(NAMED_ENTITIES)) {
      result = result.split(entity).join(char);
    }
    // 解码数字实体 &#123; 和 &#x7B;
    result = result.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    );
    setOutput(result);
  };

  const copyOut = () => {
    navigator.clipboard.writeText(output);
    message.success("已复制到剪贴板");
  };

  return (
    <Card title="HTML 实体编解码" bordered={false}>
      <Row gutter={16}>
        <Col span={12}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>输入</div>
          <Input.TextArea
            rows={8}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入要编码/解码的文本"
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
        <Button type="primary" onClick={encode}>
          编码
        </Button>
        <Button onClick={decode}>解码</Button>
        <Button
          onClick={() => {
            setInput("");
            setOutput("");
          }}
        >
          清空
        </Button>
        <Button onClick={copyOut} disabled={!output}>
          复制结果
        </Button>
      </Space>
    </Card>
  );
}
