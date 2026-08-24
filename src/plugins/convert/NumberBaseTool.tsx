import { useState } from "react";
import { Card, Input, Row, Col, Tag, Space, Radio, message } from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "numberbase",
  label: "进制转换",
  description: "二/八/十/十六进制互转",
  cmds: ["numberbase", "base convert", "binary", "hex", "进制", "进制转换"],
  icon: "number",
};


type Base = "bin" | "oct" | "dec" | "hex";

const BASE_INFO: Record<Base, { radix: number; label: string; color: string }> = {
  bin: { radix: 2, label: "二进制 (Binary)", color: "blue" },
  oct: { radix: 8, label: "八进制 (Octal)", color: "green" },
  dec: { radix: 10, label: "十进制 (Decimal)", color: "orange" },
  hex: { radix: 16, label: "十六进制 (Hex)", color: "purple" },
};

export default function NumberBaseTool() {
  const [values, setValues] = useState<Record<Base, string>>({
    bin: "",
    oct: "",
    dec: "0",
    hex: "",
  });
  const [error, setError] = useState("");

  const convert = (from: Base, value: string) => {
    const newValues = { ...values, [from]: value };
    setError("");
    if (value.trim() === "") {
      setValues({ bin: "", oct: "", dec: "", hex: "" });
      return;
    }
    const radix = BASE_INFO[from].radix;
    const cleaned = value.trim().replace(/^0x/i, "").replace(/^0b/i, "").replace(/^0o/i, "");
    const validChars =
      from === "bin"
        ? /^[01]+$/
        : from === "oct"
          ? /^[0-7]+$/
          : from === "dec"
            ? /^-?\d+$/
            : /^[0-9a-fA-F]+$/;
    if (!validChars.test(cleaned)) {
      setError(`${BASE_INFO[from].label}输入无效`);
      setValues(newValues);
      return;
    }
    try {
      const num = parseInt(cleaned, radix);
      if (isNaN(num)) throw new Error("解析失败");
      setValues({
        bin: num.toString(2),
        oct: num.toString(8),
        dec: num.toString(10),
        hex: num.toString(16).toUpperCase(),
        [from]: value,
      });
    } catch {
      setError("转换失败");
      setValues(newValues);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("已复制");
  };

  const presets = [255, 1024, 65535, 2147483647];

  return (
    <Card title="进制转换" bordered={false}>
      <Space style={{ marginBottom: 16 }}>
        <span>快捷示例:</span>
        {presets.map((n) => (
          <Tag key={n} style={{ cursor: "pointer" }} onClick={() => convert("dec", String(n))}>
            {n}
          </Tag>
        ))}
      </Space>
      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}
      <Row gutter={[16, 16]}>
        {(Object.keys(BASE_INFO) as Base[]).map((base) => (
          <Col span={24} key={base}>
            <Card
              size="small"
              type="inner"
              title={<Tag color={BASE_INFO[base].color}>{BASE_INFO[base].label}</Tag>}
            >
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  value={values[base]}
                  onChange={(e) => convert(base, e.target.value)}
                  placeholder={`输入${BASE_INFO[base].label}数值`}
                  style={{ fontFamily: "monospace", fontSize: 16 }}
                />
                <button
                  type="button"
                  onClick={() => values[base] && copy(values[base])}
                  style={{
                    padding: "0 16px",
                    border: "1px solid #d9d9d9",
                    borderLeft: "none",
                    cursor: "pointer",
                    background: "#fafafa",
                  }}
                >
                  复制
                </button>
              </Space.Compact>
            </Card>
          </Col>
        ))}
      </Row>
      <Radio.Group
        style={{ marginTop: 16 }}
        onChange={(e) => convert("dec", String(e.target.value))}
      >
        <Radio.Button value={0}>0</Radio.Button>
        <Radio.Button value={1}>1</Radio.Button>
        <Radio.Button value={-1}>-1</Radio.Button>
      </Radio.Group>
    </Card>
  );
}
