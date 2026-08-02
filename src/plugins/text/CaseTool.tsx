import { useState } from "react";
import { Input, Button, Space, Card, message } from "antd";

export default function CaseTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const toUpper = () => setOutput(input.toUpperCase());
  const toLower = () => setOutput(input.toLowerCase());

  const toTitle = () => {
    setOutput(
      input.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
    );
  };

  const toCamel = () => {
    const words = input.replace(/[-_]/g, " ").split(/\s+/).filter(Boolean);
    const result = words
      .map((w, i) => {
        const lower = w.toLowerCase();
        return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join("");
    setOutput(result);
  };

  const toPascal = () => {
    const words = input.replace(/[-_]/g, " ").split(/\s+/).filter(Boolean);
    const result = words
      .map((w) => {
        const lower = w.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join("");
    setOutput(result);
  };

  const toSnake = () => {
    const result = input
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[\s-]+/g, "_")
      .replace(/_+/g, "_")
      .toLowerCase();
    setOutput(result);
  };

  const toKebab = () => {
    const result = input
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
    setOutput(result);
  };

  const toSentence = () => {
    setOutput(input.charAt(0).toUpperCase() + input.slice(1).toLowerCase());
  };

  const copyOut = () => {
    navigator.clipboard.writeText(output);
    message.success("已复制");
  };

  return (
    <Card title="大小写转换" bordered={false}>
      <Input.TextArea
        rows={5}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入要转换的文本"
      />
      <Space wrap style={{ margin: "12px 0" }}>
        <Button type="primary" onClick={toUpper}>
          UPPER 大写
        </Button>
        <Button onClick={toLower}>lower 小写</Button>
        <Button onClick={toTitle}>Title 首字母大写</Button>
        <Button onClick={toCamel}>camelCase 驼峰</Button>
        <Button onClick={toPascal}>PascalCase 帕斯卡</Button>
        <Button onClick={toSnake}>snake_case 下划线</Button>
        <Button onClick={toKebab}>kebab-case 短横线</Button>
        <Button onClick={toSentence}>Sentence 句首大写</Button>
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
      <Input.TextArea
        rows={5}
        value={output}
        readOnly
        style={{ fontFamily: "monospace", background: "#fafafa" }}
      />
    </Card>
  );
}
