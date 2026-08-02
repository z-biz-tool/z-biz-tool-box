import { useState } from "react";
import { Card, Input, Button, Space, Tag, Alert, Row, Col } from "antd";

interface CronField {
  name: string;
  value: string;
  min: number;
  max: number;
}

function parseField(value: string, _min: number, _max: number, fieldName: string): string {
  if (value === "*") return `每${fieldName}`;
  if (value.startsWith("*/")) {
    const step = parseInt(value.slice(2), 10);
    if (isNaN(step)) return `无效的${fieldName}步长`;
    return `每隔${step}${fieldName}`;
  }
  if (value.includes(",")) {
    const parts = value.split(",").map((v) => v.trim());
    return `指定的${fieldName}: ${parts.join("、")}`;
  }
  if (value.includes("-")) {
    const [start, end] = value.split("-").map((v) => parseInt(v.trim(), 10));
    if (isNaN(start) || isNaN(end)) return `无效的${fieldName}范围`;
    return `${fieldName}从${start}到${end}`;
  }
  const num = parseInt(value, 10);
  if (!isNaN(num)) return `第${num}${fieldName}`;
  return `无效的${fieldName}`;
}

function getCronDescription(expr: string): {
  description: string;
  nextRuns: Date[];
  error?: string;
} {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return {
      description: "",
      nextRuns: [],
      error: "Cron 表达式必须有 5 或 6 个字段（分 时 日 月 周 [秒]）",
    };
  }

  const hasSeconds = parts.length === 6;
  const offset = hasSeconds ? 1 : 0;
  const minute = parts[offset];
  const hour = parts[offset + 1];
  const dayOfMonth = parts[offset + 2];
  const month = parts[offset + 3];
  const dayOfWeek = parts[offset + 4];
  const second = hasSeconds ? parts[0] : "0";

  const descMin = parseField(minute, 0, 59, "分钟");
  const descHour = parseField(hour, 0, 23, "小时");
  const descDay = parseField(dayOfMonth, 1, 31, "日");
  const descMonth = parseField(month, 1, 12, "月");
  const descWeek = parseField(dayOfWeek, 0, 7, "周");

  const weekMap: Record<string, string> = {
    "0": "日",
    "1": "一",
    "2": "二",
    "3": "三",
    "4": "四",
    "5": "五",
    "6": "六",
    "7": "日",
  };
  let descWeekZh = descWeek;
  if (/^[0-7]$/.test(dayOfWeek)) {
    descWeekZh = `每周${weekMap[dayOfWeek] || dayOfWeek}`;
  } else if (dayOfWeek === "*") {
    descWeekZh = "每天";
  } else if (dayOfWeek.startsWith("*/")) {
    descWeekZh = `每${dayOfWeek.slice(2)}周`;
  }

  const monthMap: Record<string, string> = {
    "1": "一月",
    "2": "二月",
    "3": "三月",
    "4": "四月",
    "5": "五月",
    "6": "六月",
    "7": "七月",
    "8": "八月",
    "9": "九月",
    "10": "十月",
    "11": "十一月",
    "12": "十二月",
  };
  let descMonthZh = descMonth;
  if (/^[1-9]$|^1[0-2]$/.test(month)) {
    descMonthZh = monthMap[month] || month;
  }

  let description = `${descMonthZh} ${descDay === "每日" ? "" : descDay} ${descWeekZh === "每天" ? "" : descWeekZh} ${descHour} ${descMin}`;
  if (hasSeconds) {
    description += `，${parseField(second, 0, 59, "秒")}`;
  }

  // 计算下次运行时间（简化版）
  const nextRuns: Date[] = [];
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const next = new Date(now.getTime() + (i + 1) * 60000);
    nextRuns.push(next);
  }

  return { description, nextRuns };
}

const EXAMPLES = [
  { expr: "0 * * * *", desc: "每小时整点" },
  { expr: "*/5 * * * *", desc: "每 5 分钟" },
  { expr: "0 0 * * *", desc: "每天凌晨" },
  { expr: "0 0 * * 1", desc: "每周一凌晨" },
  { expr: "0 0 1 * *", desc: "每月 1 号凌晨" },
  { expr: "0 9 * * 1-5", desc: "工作日早上 9 点" },
  { expr: "30 3 * * *", desc: "每天凌晨 3:30" },
  { expr: "0 0,12 * * *", desc: "每天 0 点和 12 点" },
  { expr: "0 0 1 1 *", desc: "每年 1 月 1 号凌晨" },
  { expr: "*/30 * * * *", desc: "每半小时" },
];

export default function CronParser() {
  const [expr, setExpr] = useState("0 9 * * 1-5");
  const [result, setResult] = useState(() => getCronDescription("0 9 * * 1-5"));

  const parse = (value: string) => {
    setExpr(value);
    setResult(getCronDescription(value));
  };

  const fields: CronField[] = [
    { name: "秒(可选)", value: expr.split(/\s+/)[5] || "-", min: 0, max: 59 },
    { name: "分钟", value: expr.split(/\s+/)[0], min: 0, max: 59 },
    { name: "小时", value: expr.split(/\s+/)[1], min: 0, max: 23 },
    { name: "日", value: expr.split(/\s+/)[2], min: 1, max: 31 },
    { name: "月", value: expr.split(/\s+/)[3], min: 1, max: 12 },
    { name: "周", value: expr.split(/\s+/)[4], min: 0, max: 7 },
  ];

  return (
    <Card title="Cron 表达式解析" bordered={false}>
      <Space style={{ marginBottom: 16 }}>
        <Input
          value={expr}
          onChange={(e) => parse(e.target.value)}
          placeholder="*/5 * * * *"
          style={{ width: 300, fontFamily: "monospace", fontSize: 16 }}
        />
        <Button onClick={() => navigator.clipboard.writeText(expr)}>复制表达式</Button>
      </Space>
      {result.error && <Alert type="error" message={result.error} style={{ marginBottom: 12 }} />}
      {result.description && (
        <>
          <Card size="small" type="inner" style={{ marginBottom: 12, background: "#f6ffed" }}>
            <Space>
              <Tag color="green">中文描述</Tag>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{result.description}</span>
            </Space>
          </Card>
          <Row gutter={16} style={{ marginBottom: 12 }}>
            {fields.map((f) => (
              <Col span={4} key={f.name}>
                <Card size="small" type="inner" title={f.name} styles={{ body: { padding: 8 } }}>
                  <Tag color="blue" style={{ fontFamily: "monospace" }}>
                    {f.value}
                  </Tag>
                </Card>
              </Col>
            ))}
          </Row>
          <Card size="small" type="inner" title="字段说明">
            <Space wrap>
              <Tag>*</Tag>
              <span>任意值</span>
              <Tag>*/N</Tag>
              <span>每 N 个</span>
              <Tag>A-B</Tag>
              <span>范围 A 到 B</span>
              <Tag>A,B,C</Tag>
              <span>列表</span>
              <Tag>A</Tag>
              <span>具体值</span>
            </Space>
          </Card>
        </>
      )}
      <Card size="small" type="inner" title="常用示例" style={{ marginTop: 12 }}>
        <Space wrap>
          {EXAMPLES.map((ex) => (
            <Tag
              key={ex.expr}
              color="blue"
              style={{ cursor: "pointer", fontFamily: "monospace" }}
              onClick={() => parse(ex.expr)}
            >
              {ex.expr} = {ex.desc}
            </Tag>
          ))}
        </Space>
      </Card>
    </Card>
  );
}
