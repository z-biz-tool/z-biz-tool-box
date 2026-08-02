import { useState } from "react";
import { Input, Button, Space, Card, Row, Col } from "antd";

export default function DiffTool() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [diff, setDiff] = useState<{ type: "add" | "del" | "eq"; text: string }[]>([]);

  // 基于 LCS 的行级 diff
  const computeDiff = () => {
    const a = left.split("\n");
    const b = right.split("\n");
    const n = a.length, m = b.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const result: { type: "add" | "del" | "eq"; text: string }[] = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        result.push({ type: "eq", text: a[i] });
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        result.push({ type: "del", text: a[i] });
        i++;
      } else {
        result.push({ type: "add", text: b[j] });
        j++;
      }
    }
    while (i < n) { result.push({ type: "del", text: a[i++] }); }
    while (j < m) { result.push({ type: "add", text: b[j++] }); }
    setDiff(result);
  };

  return (
    <Card title="文本 Diff 对比" bordered={false}>
      <Row gutter={16}>
        <Col span={12}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>原始文本</div>
          <Input.TextArea
            rows={10}
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            placeholder="左侧文本"
          />
        </Col>
        <Col span={12}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>对比文本</div>
          <Input.TextArea
            rows={10}
            value={right}
            onChange={(e) => setRight(e.target.value)}
            placeholder="右侧文本"
          />
        </Col>
      </Row>
      <Space style={{ margin: "12px 0" }}>
        <Button type="primary" onClick={computeDiff}>计算差异</Button>
        <Button onClick={() => { setLeft(""); setRight(""); setDiff([]); }}>清空</Button>
      </Space>
      <div>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>差异结果</div>
        <div style={{ background: "#fafafa", padding: 12, borderRadius: 6, fontFamily: "monospace", minHeight: 100 }}>
          {diff.length === 0 && <span style={{ color: "#999" }}>点击"计算差异"查看结果</span>}
          {diff.map((line, idx) => (
            <div
              key={idx}
              style={{
                padding: "2px 8px",
                background: line.type === "add" ? "#f6ffed" : line.type === "del" ? "#fff1f0" : "transparent",
                color: line.type === "add" ? "#52c41a" : line.type === "del" ? "#ff4d4f" : "#333",
                borderLeft: line.type === "add" ? "3px solid #52c41a" : line.type === "del" ? "3px solid #ff4d4f" : "3px solid transparent",
              }}
            >
              {line.type === "add" ? "+ " : line.type === "del" ? "- " : "  "}{line.text || " "}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
