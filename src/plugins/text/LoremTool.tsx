import { useState } from "react";
import { Card, InputNumber, Button, Space, Input, Select, Row, Col, message } from "antd";

const WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
  "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
  "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
  "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
  "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
  "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
  "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
  "deserunt", "mollit", "anim", "id", "est", "laborum", "at", "vero", "eos",
  "accusam", "justo", "duo", "dolores", "clita", "gubergren", "no", "takimata",
];

function randomSentence(minWords = 6, maxWords = 15): string {
  const len = minWords + Math.floor(Math.random() * (maxWords - minWords + 1));
  const words: string[] = [];
  for (let i = 0; i < len; i++) {
    words.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
  }
  let sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

function randomParagraph(minSentences = 3, maxSentences = 6): string {
  const len = minSentences + Math.floor(Math.random() * (maxSentences - minSentences + 1));
  const sentences: string[] = [];
  for (let i = 0; i < len; i++) {
    sentences.push(randomSentence());
  }
  return sentences.join(" ");
}

type Unit = "paragraph" | "sentence" | "word";

export default function LoremTool() {
  const [count, setCount] = useState(3);
  const [unit, setUnit] = useState<Unit>("paragraph");
  const [output, setOutput] = useState("");
  const [startWithLorem, setStartWithLorem] = useState(true);

  const generate = () => {
    let parts: string[] = [];
    if (unit === "paragraph") {
      for (let i = 0; i < count; i++) {
        let p = randomParagraph();
        if (i === 0 && startWithLorem) {
          p = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " + p;
        }
        parts.push(p);
      }
      setOutput(parts.join("\n\n"));
    } else if (unit === "sentence") {
      for (let i = 0; i < count; i++) {
        let s = randomSentence();
        if (i === 0 && startWithLorem) {
          s = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
        }
        parts.push(s);
      }
      setOutput(parts.join(" "));
    } else {
      const words: string[] = [];
      for (let i = 0; i < count; i++) {
        words.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
      }
      if (startWithLorem && count >= 2) {
        words[0] = "lorem";
        words[1] = "ipsum";
      }
      setOutput(words.join(" "));
    }
  };

  return (
    <Card title="Lorem Ipsum 生成器" bordered={false}>
      <Row gutter={16} align="middle">
        <Col>
          <span style={{ marginRight: 8 }}>数量</span>
          <InputNumber min={1} max={100} value={count} onChange={(v) => setCount(v || 1)} />
        </Col>
        <Col>
          <span style={{ marginRight: 8, marginLeft: 16 }}>单位</span>
          <Select
            value={unit}
            onChange={setUnit}
            style={{ width: 120 }}
            options={[
              { value: "paragraph", label: "段落" },
              { value: "sentence", label: "句子" },
              { value: "word", label: "单词" },
            ]}
          />
        </Col>
        <Col>
          <Select
            value={startWithLorem ? "1" : "0"}
            onChange={(v) => setStartWithLorem(v === "1")}
            style={{ width: 180, marginLeft: 16 }}
            options={[
              { value: "1", label: "以 Lorem ipsum 开头" },
              { value: "0", label: "随机开头" },
            ]}
          />
        </Col>
      </Row>
      <Space style={{ margin: "12px 0" }}>
        <Button type="primary" onClick={generate}>生成</Button>
        <Button onClick={() => { navigator.clipboard.writeText(output); message.success("已复制"); }} disabled={!output}>复制结果</Button>
        <Button onClick={() => setOutput("")}>清空</Button>
      </Space>
      <Input.TextArea rows={10} value={output} readOnly style={{ fontFamily: "serif", background: "#fafafa" }} />
    </Card>
  );
}
