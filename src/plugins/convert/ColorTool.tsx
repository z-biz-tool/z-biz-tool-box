import { useState, useMemo } from "react";
import { Card, Input, Row, Col, Space, Tag, message, ColorPicker } from "antd";

type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

function hexToRgb(hex: string): RGB | null {
  const m = hex.replace("#", "").match(/^([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(rgb: RGB): string {
  return (
    "#" + [rgb.r, rgb.g, rgb.b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")
  );
}

function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255,
    g = rgb.g / 255,
    b = rgb.b / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360,
    s = hsl.s / 100,
    l = hsl.l / 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

const PRESETS = [
  "#1890ff",
  "#52c41a",
  "#722ed1",
  "#eb2f96",
  "#fa541c",
  "#faad14",
  "#13c2c2",
  "#2f54eb",
  "#a0d911",
  "#f5222d",
  "#fa8c16",
  "#08979c",
  "#000000",
  "#ffffff",
  "#595959",
  "#8c8c8c",
  "#bfbfbf",
  "#d9d9d9",
];

export default function ColorTool() {
  const [hex, setHex] = useState("#1890ff");
  const [rgb, setRgb] = useState<RGB>({ r: 24, g: 144, b: 255 });
  const [hsl, setHsl] = useState<HSL>({ h: 211, s: 100, l: 55 });

  const updateFromHex = (value: string) => {
    const parsed = hexToRgb(value);
    if (parsed) {
      setHex(value);
      setRgb(parsed);
      setHsl(rgbToHsl(parsed));
    } else {
      setHex(value);
    }
  };

  const updateFromRgb = (key: keyof RGB, value: number) => {
    const newRgb = { ...rgb, [key]: value };
    setRgb(newRgb);
    setHex(rgbToHex(newRgb));
    setHsl(rgbToHsl(newRgb));
  };

  const updateFromHsl = (key: keyof HSL, value: number) => {
    const newHsl = { ...hsl, [key]: value };
    setHsl(newHsl);
    const newRgb = hslToRgb(newHsl);
    setRgb(newRgb);
    setHex(rgbToHex(newRgb));
  };

  const complementary = useMemo(() => {
    const comp = { ...hsl, h: (hsl.h + 180) % 360 };
    return rgbToHex(hslToRgb(comp));
  }, [hsl]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("已复制: " + text);
  };

  return (
    <Card title="颜色转换" bordered={false}>
      <Row gutter={16}>
        <Col span={8}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>预览</div>
          <div
            style={{
              width: "100%",
              height: 120,
              background: hex,
              borderRadius: 8,
              border: "1px solid #d9d9d9",
              marginBottom: 8,
            }}
          />
          <ColorPicker value={hex} onChange={(c) => updateFromHex(c.toHexString())} showText />
        </Col>
        <Col span={16}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>预设色板</div>
            <Space wrap>
              {PRESETS.map((c) => (
                <div
                  key={c}
                  onClick={() => updateFromHex(c)}
                  style={{
                    width: 32,
                    height: 32,
                    background: c,
                    borderRadius: 4,
                    cursor: "pointer",
                    border: "2px solid #fff",
                    boxShadow: "0 0 0 1px #d9d9d9",
                  }}
                  title={c}
                />
              ))}
            </Space>
          </div>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Card size="small" title={<Tag color="red">HEX</Tag>} type="inner">
            <Input
              value={hex}
              onChange={(e) => updateFromHex(e.target.value)}
              style={{ fontFamily: "monospace" }}
            />
            <a onClick={() => copy(hex)} style={{ fontSize: 12 }}>
              复制
            </a>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title={<Tag color="green">RGB</Tag>} type="inner">
            <Space>
              <Input
                type="number"
                min={0}
                max={255}
                value={rgb.r}
                onChange={(e) => updateFromRgb("r", +e.target.value)}
                addonBefore="R"
                style={{ width: 100 }}
              />
              <Input
                type="number"
                min={0}
                max={255}
                value={rgb.g}
                onChange={(e) => updateFromRgb("g", +e.target.value)}
                addonBefore="G"
                style={{ width: 100 }}
              />
              <Input
                type="number"
                min={0}
                max={255}
                value={rgb.b}
                onChange={(e) => updateFromRgb("b", +e.target.value)}
                addonBefore="B"
                style={{ width: 100 }}
              />
            </Space>
            <div style={{ marginTop: 8 }}>
              <a onClick={() => copy(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`)} style={{ fontSize: 12 }}>
                复制 rgb()
              </a>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title={<Tag color="blue">HSL</Tag>} type="inner">
            <Space>
              <Input
                type="number"
                min={0}
                max={360}
                value={hsl.h}
                onChange={(e) => updateFromHsl("h", +e.target.value)}
                addonBefore="H"
                style={{ width: 100 }}
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={hsl.s}
                onChange={(e) => updateFromHsl("s", +e.target.value)}
                addonBefore="S"
                style={{ width: 100 }}
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={hsl.l}
                onChange={(e) => updateFromHsl("l", +e.target.value)}
                addonBefore="L"
                style={{ width: 100 }}
              />
            </Space>
            <div style={{ marginTop: 8 }}>
              <a
                onClick={() => copy(`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`)}
                style={{ fontSize: 12 }}
              >
                复制 hsl()
              </a>
            </div>
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card size="small" type="inner" title="互补色">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  background: hex,
                  borderRadius: 4,
                  border: "1px solid #d9d9d9",
                }}
              />
              <span>→</span>
              <div
                style={{
                  width: 40,
                  height: 40,
                  background: complementary,
                  borderRadius: 4,
                  border: "1px solid #d9d9d9",
                  cursor: "pointer",
                }}
                onClick={() => updateFromHex(complementary)}
              />
              <Tag>{complementary}</Tag>
            </div>
          </Card>
        </Col>
      </Row>
    </Card>
  );
}
