import { useState } from "react";
import { Card, Select, InputNumber, Row, Col, Statistic, Space, message } from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "unit",
  label: "单位换算",
  description: "长度/重量/温度/面积/体积/速度/数据/时间",
  cmds: ["unit", "unit convert", "length", "weight", "temperature", "单位", "单位换算"],
  icon: "scale",
};


type Category = "length" | "weight" | "temperature" | "area" | "volume" | "speed" | "data" | "time";

// 基准单位转换 (值 → 基准单位)
const UNITS: Record<Category, { unit: string; factor: number; label: string }[]> = {
  length: [
    { unit: "mm", factor: 0.001, label: "毫米 mm" },
    { unit: "cm", factor: 0.01, label: "厘米 cm" },
    { unit: "m", factor: 1, label: "米 m" },
    { unit: "km", factor: 1000, label: "千米 km" },
    { unit: "in", factor: 0.0254, label: "英寸 in" },
    { unit: "ft", factor: 0.3048, label: "英尺 ft" },
    { unit: "yd", factor: 0.9144, label: "码 yd" },
    { unit: "mi", factor: 1609.344, label: "英里 mi" },
    { unit: "nmi", factor: 1852, label: "海里 nmi" },
    { unit: "li", factor: 0.5, label: "市尺 li" },
    { unit: "jin_chi", factor: 1 / 3, label: "市尺(1/3m)" },
  ],
  weight: [
    { unit: "mg", factor: 0.000001, label: "毫克 mg" },
    { unit: "g", factor: 0.001, label: "克 g" },
    { unit: "kg", factor: 1, label: "千克 kg" },
    { unit: "t", factor: 1000, label: "吨 t" },
    { unit: "oz", factor: 0.0283495, label: "盎司 oz" },
    { unit: "lb", factor: 0.453592, label: "磅 lb" },
    { unit: "jin", factor: 0.5, label: "市斤 jin" },
    { unit: "liang", factor: 0.05, label: "市两 liang" },
  ],
  temperature: [
    { unit: "C", factor: 1, label: "摄氏度 °C" },
    { unit: "F", factor: 1, label: "华氏度 °F" },
    { unit: "K", factor: 1, label: "开尔文 K" },
    { unit: "R", factor: 1, label: "兰氏度 °R" },
  ],
  area: [
    { unit: "mm2", factor: 0.000001, label: "平方毫米 mm²" },
    { unit: "cm2", factor: 0.0001, label: "平方厘米 cm²" },
    { unit: "m2", factor: 1, label: "平方米 m²" },
    { unit: "km2", factor: 1000000, label: "平方千米 km²" },
    { unit: "ha", factor: 10000, label: "公顷 ha" },
    { unit: "mu", factor: 666.6667, label: "亩 mu" },
    { unit: "acre", factor: 4046.86, label: "英亩 acre" },
    { unit: "ft2", factor: 0.092903, label: "平方英尺 ft²" },
    { unit: "in2", factor: 0.00064516, label: "平方英寸 in²" },
  ],
  volume: [
    { unit: "ml", factor: 0.001, label: "毫升 ml" },
    { unit: "l", factor: 1, label: "升 L" },
    { unit: "m3", factor: 1000, label: "立方米 m³" },
    { unit: "gal_us", factor: 3.78541, label: "加仑(美) gal" },
    { unit: "gal_uk", factor: 4.54609, label: "加仑(英) gal" },
    { unit: "qt", factor: 0.946353, label: "夸脱 qt" },
    { unit: "pt", factor: 0.473176, label: "品脱 pt" },
    { unit: "cup", factor: 0.236588, label: "杯 cup" },
    { unit: "floz", factor: 0.0295735, label: "液量盎司 fl oz" },
  ],
  speed: [
    { unit: "mps", factor: 1, label: "米/秒 m/s" },
    { unit: "kmh", factor: 0.277778, label: "千米/时 km/h" },
    { unit: "mph", factor: 0.44704, label: "英里/时 mph" },
    { unit: "knot", factor: 0.514444, label: "节 knot" },
    { unit: "fts", factor: 0.3048, label: "英尺/秒 ft/s" },
    { unit: "mach", factor: 343, label: "马赫 mach" },
  ],
  data: [
    { unit: "b", factor: 1, label: "比特 bit" },
    { unit: "B", factor: 8, label: "字节 B" },
    { unit: "KB", factor: 8 * 1024, label: "千字节 KB" },
    { unit: "MB", factor: 8 * 1024 * 1024, label: "兆字节 MB" },
    { unit: "GB", factor: 8 * 1024 ** 3, label: "吉字节 GB" },
    { unit: "TB", factor: 8 * 1024 ** 4, label: "太字节 TB" },
    { unit: "PB", factor: 8 * 1024 ** 5, label: "拍字节 PB" },
  ],
  time: [
    { unit: "ms", factor: 0.001, label: "毫秒 ms" },
    { unit: "s", factor: 1, label: "秒 s" },
    { unit: "min", factor: 60, label: "分钟 min" },
    { unit: "h", factor: 3600, label: "小时 h" },
    { unit: "d", factor: 86400, label: "天 day" },
    { unit: "wk", factor: 604800, label: "周 week" },
    { unit: "mo", factor: 2629800, label: "月 month" },
    { unit: "yr", factor: 31557600, label: "年 year" },
  ],
};

const CATEGORY_LABELS: Record<Category, string> = {
  length: "长度",
  weight: "重量",
  temperature: "温度",
  area: "面积",
  volume: "体积",
  speed: "速度",
  data: "数据大小",
  time: "时间",
};

function convert(value: number, from: string, to: string, category: Category): number {
  if (category === "temperature") {
    // 特殊处理温度
    let celsius: number;
    if (from === "C") celsius = value;
    else if (from === "F") celsius = ((value - 32) * 5) / 9;
    else if (from === "K") celsius = value - 273.15;
    else if (from === "R") celsius = ((value - 491.67) * 5) / 9;
    else celsius = value;

    if (to === "C") return celsius;
    if (to === "F") return (celsius * 9) / 5 + 32;
    if (to === "K") return celsius + 273.15;
    if (to === "R") return ((celsius + 273.15) * 9) / 5;
    return celsius;
  }
  const units = UNITS[category];
  const fromFactor = units.find((u) => u.unit === from)?.factor || 1;
  const toFactor = units.find((u) => u.unit === to)?.factor || 1;
  return (value * fromFactor) / toFactor;
}

export default function UnitConverter() {
  const [category, setCategory] = useState<Category>("length");
  const [value, setValue] = useState(1);
  const [fromUnit, setFromUnit] = useState("m");
  const [toUnit, setToUnit] = useState("ft");

  const handleCategoryChange = (cat: Category) => {
    setCategory(cat);
    const units = UNITS[cat];
    setFromUnit(units[0].unit);
    setToUnit(units[Math.min(1, units.length - 1)].unit);
  };

  const result = convert(value, fromUnit, toUnit, category);
  const resultStr =
    Math.abs(result) < 0.0001 || Math.abs(result) > 1e10
      ? result.toExponential(6)
      : Number(result.toPrecision(10)).toString();

  const copyResult = () => {
    navigator.clipboard.writeText(resultStr);
    message.success("已复制");
  };

  return (
    <Card title="单位换算" bordered={false}>
      <Select
        value={category}
        onChange={handleCategoryChange}
        style={{ width: 200, marginBottom: 16 }}
        options={(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({
          value: c,
          label: CATEGORY_LABELS[c],
        }))}
      />
      <Row gutter={16} align="middle">
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>输入值</div>
          <InputNumber
            value={value}
            onChange={(v) => setValue(v || 0)}
            style={{ width: "100%" }}
            size="large"
          />
        </Col>
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>源单位</div>
          <Select
            value={fromUnit}
            onChange={setFromUnit}
            style={{ width: "100%" }}
            options={UNITS[category].map((u) => ({ value: u.unit, label: u.label }))}
            size="large"
          />
        </Col>
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>目标单位</div>
          <Select
            value={toUnit}
            onChange={setToUnit}
            style={{ width: "100%" }}
            options={UNITS[category].map((u) => ({ value: u.unit, label: u.label }))}
            size="large"
          />
        </Col>
      </Row>
      <Card
        size="small"
        type="inner"
        style={{ marginTop: 16, cursor: "pointer" }}
        onClick={copyResult}
      >
        <Statistic
          title="结果 (点击复制)"
          value={resultStr}
          suffix={UNITS[category].find((u) => u.unit === toUnit)?.label.split(" ")[0] || ""}
        />
      </Card>
      <Space wrap style={{ marginTop: 16 }}>
        {UNITS[category]
          .filter((u) => u.unit !== fromUnit && u.unit !== toUnit)
          .map((u) => (
            <Statistic
              key={u.unit}
              title={u.label.split(" ")[0]}
              value={Number(convert(value, fromUnit, u.unit, category).toPrecision(8))}
              valueStyle={{ fontSize: 14 }}
            />
          ))}
      </Space>
    </Card>
  );
}
