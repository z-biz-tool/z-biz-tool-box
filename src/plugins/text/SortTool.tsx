import { useState } from "react";
import { Input, Button, Space, Card, message, Radio } from "antd";

type Mode = "asc" | "desc" | "shuffle" | "reverse" | "natural";

export default function SortTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<Mode>("asc");

  const sort = () => {
    const lines = input.split("\n");
    let result = [...lines];
    switch (mode) {
      case "asc":
        result.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
        break;
      case "desc":
        result.sort((a, b) => b.localeCompare(a, "zh-Hans-CN"));
        break;
      case "shuffle":
        // Fisher-Yates 洗牌
        for (let i = result.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [result[i], result[j]] = [result[j], result[i]];
        }
        break;
      case "reverse":
        result.reverse();
        break;
      case "natural":
        // 自然排序（数字部分按数值比较）
        result.sort((a, b) => {
          const ax: (string | number)[] = [],
            bx: (string | number)[] = [];
          a.replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
            ax.push($1 ? parseInt($1, 10) : $2);
            return "";
          });
          b.replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
            bx.push($1 ? parseInt($1, 10) : $2);
            return "";
          });
          while (ax.length && bx.length) {
            const an = ax.shift()!,
              bn = bx.shift()!;
            const nn = (typeof an === "number" ? 1 : 0) - (typeof bn === "number" ? 1 : 0);
            if (nn) return nn;
            if (an < bn) return -1;
            if (an > bn) return 1;
          }
          return ax.length - bx.length;
        });
        break;
    }
    setOutput(result.join("\n"));
    message.success("排序完成");
  };

  return (
    <Card title="文本排序" bordered={false}>
      <Radio.Group
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        style={{ marginBottom: 12 }}
      >
        <Radio.Button value="asc">升序 A→Z</Radio.Button>
        <Radio.Button value="desc">降序 Z→A</Radio.Button>
        <Radio.Button value="natural">自然排序</Radio.Button>
        <Radio.Button value="reverse">反转</Radio.Button>
        <Radio.Button value="shuffle">随机打乱</Radio.Button>
      </Radio.Group>
      <Input.TextArea
        rows={6}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="每行一条，输入要排序的文本"
      />
      <Space style={{ margin: "12px 0" }}>
        <Button type="primary" onClick={sort}>
          排序
        </Button>
        <Button
          onClick={() => {
            setInput("");
            setOutput("");
          }}
        >
          清空
        </Button>
        <Button
          onClick={() => {
            navigator.clipboard.writeText(output);
            message.success("已复制");
          }}
          disabled={!output}
        >
          复制结果
        </Button>
      </Space>
      <Input.TextArea
        rows={6}
        value={output}
        readOnly
        style={{ fontFamily: "monospace", background: "#fafafa" }}
      />
    </Card>
  );
}
