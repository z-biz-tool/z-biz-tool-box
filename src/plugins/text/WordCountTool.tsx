import { useState, useMemo } from "react";
import { Input, Card, Row, Col, Statistic } from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "wordcount",
  label: "字数统计",
  description: "字符/单词/行/段/句统计",
  icon: "chart",
};


export default function WordCountTool() {
  const [input, setInput] = useState("");

  const stats = useMemo(() => {
    const chars = input.length;
    const charsNoSpace = input.replace(/\s/g, "").length;
    const words = input.trim() ? input.trim().split(/\s+/).length : 0;
    const lines = input ? input.split("\n").length : 0;
    const paragraphs = input.trim()
      ? input
          .trim()
          .split(/\n\s*\n/)
          .filter((p) => p.trim()).length
      : 0;
    const sentences = input.trim()
      ? input
          .trim()
          .split(/[。！？.!?\n]+/)
          .filter((s) => s.trim()).length
      : 0;
    const bytes = new Blob([input]).size;
    const readingTime = Math.ceil(words / 200); // 200字/分钟
    return { chars, charsNoSpace, words, lines, paragraphs, sentences, bytes, readingTime };
  }, [input]);

  return (
    <Card title="字数统计" bordered={false}>
      <Input.TextArea
        rows={8}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入文本，实时统计..."
      />
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="字符数" value={stats.chars} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="字符数(不含空格)" value={stats.charsNoSpace} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="单词数" value={stats.words} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="行数" value={stats.lines} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="段落数" value={stats.paragraphs} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="句数" value={stats.sentences} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="字节数" value={stats.bytes} suffix="B" />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="预计阅读" value={stats.readingTime} suffix="分钟" />
          </Card>
        </Col>
      </Row>
    </Card>
  );
}
