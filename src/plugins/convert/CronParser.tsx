import { useState } from "react";
import { Card, Input, Button, Space, Tag, Alert, Row, Col } from "antd";

import { useToolState } from "../../_shared";
import type { PluginMeta } from "../_types";
// 解析/描述/下次运行时间的纯逻辑在 cronLogic.ts：
// 组件只负责渲染，计算与校验全在纯逻辑模块里（可被 node --test 直接测）。
import { getCronDescription } from "./cronLogic";
export const meta: PluginMeta = {
  key: "cron",
  label: "Cron 解析",
  description: "Cron 表达式中文描述",
  cmds: ["cron", "cron parse", "cron expression", "Cron", "Cron解析"],
  icon: "clock",
};


interface CronField {
  name: string;
  value: string;
  min: number;
  max: number;
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
  const [expr, setExpr] = useToolState("cron", "expr", "0 9 * * 1-5");
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
