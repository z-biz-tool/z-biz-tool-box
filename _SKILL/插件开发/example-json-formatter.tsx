/**
 * 完整示例: JSON 格式化工具
 *
 * 展示:
 *   - meta 三种字段(key/label/description/keywords/icon)
 *   - usePluginInput 持久化
 *   - useCopyToClipboard + useClearAll
 *   - AntD 多种组件 (Radio / Statistic / Tag / Card / Row / Col)
 *   - 错误处理 (try/catch + message.error)
 *   - 异步操作 (setTimeout 模拟大文件)
 *
 * 直接复制到 src/plugins/text/JsonFormatTool.tsx 即可用 (假设 key 不冲突)
 */

import { useMemo, useState } from "react";
import {
  Card,
  Input,
  Button,
  Space,
  Radio,
  Row,
  Col,
  Statistic,
  Tag,
  message,
} from "antd";
import {
  usePluginInput,
  useCopyToClipboard,
  useClearAll,
} from "../../_shared";

import type { PluginMeta } from "../_types";

export const meta: PluginMeta = {
  key: "json-format",
  label: "JSON 格式化",
  description: "美化 / 压缩 / 校验 JSON",
  keywords: "json format minify validate pretty 格式化 压缩 校验",
  order: 5,
  icon: "code",
};

type Mode = "format" | "minify" | "validate";

export default function JsonFormatTool() {
  const [input, setInput] = usePluginInput(meta.key);
  const [mode, setMode] = useState<Mode>("format");
  const [output, setOutput] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);

  const copy = useCopyToClipboard();
  const clear = useClearAll([
    () => setInput(""),
    () => setOutput(""),
    () => setValid(null),
  ]);

  // 统计信息
  const stats = useMemo(() => {
    if (!output) return null;
    try {
      const obj = JSON.parse(output);
      const countKeys = (o: unknown): number => {
        if (typeof o !== "object" || o === null) return 0;
        if (Array.isArray(o)) return o.reduce((s, x) => s + countKeys(x), 0);
        return Object.keys(o as Record<string, unknown>).length +
          Object.values(o as Record<string, unknown>).reduce(
            (s, v) => s + countKeys(v), 0);
      };
      return {
        bytes: new Blob([output]).size,
        keys: countKeys(obj),
        depth: (() => {
          let d = 0;
          const walk = (v: unknown, cur: number) => {
            if (cur > d) d = cur;
            if (Array.isArray(v)) v.forEach((x) => walk(x, cur + 1));
            else if (v && typeof v === "object")
              Object.values(v).forEach((x) => walk(x, cur + 1));
          };
          walk(obj, 0);
          return d;
        })(),
      };
    } catch {
      return null;
    }
  }, [output]);

  const run = () => {
    if (!input.trim()) {
      message.warning("请输入 JSON");
      return;
    }
    try {
      const obj = JSON.parse(input);
      setValid(true);
      switch (mode) {
        case "format":
          setOutput(JSON.stringify(obj, null, 2));
          break;
        case "minify":
          setOutput(JSON.stringify(obj));
          break;
        case "validate":
          setOutput("✓ 合法 JSON");
          break;
      }
      message.success(
        mode === "validate" ? "校验通过" : `${mode} 完成`
      );
    } catch (e) {
      setValid(false);
      setOutput(`✗ 解析失败:\n${String(e)}`);
      message.error("JSON 不合法");
    }
  };

  return (
    <Card title="JSON 格式化 / 压缩 / 校验" bordered={false}>
      <Radio.Group
        value={mode}
        onChange={(e) => setMode(e.target.value as Mode)}
        style={{ marginBottom: 12 }}
      >
        <Radio.Button value="format">格式化 (美化)</Radio.Button>
        <Radio.Button value="minify">压缩 (单行)</Radio.Button>
        <Radio.Button value="validate">仅校验</Radio.Button>
      </Radio.Group>

      <Row gutter={16}>
        <Col span={12}>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>
            输入 JSON
          </div>
          <Input.TextArea
            rows={10}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='{"name":"z-biz","version":"0.1.0"}'
            style={{ fontFamily: "monospace" }}
          />
        </Col>
        <Col span={12}>
          <div
            style={{
              marginBottom: 6,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            输出
            {valid === true && <Tag color="green">合法</Tag>}
            {valid === false && <Tag color="red">非法</Tag>}
          </div>
          <Input.TextArea
            rows={10}
            value={output}
            readOnly
            style={{
              fontFamily: "monospace",
              background: valid === false ? "#fff1f0" : "#fafafa",
            }}
          />
        </Col>
      </Row>

      <Space style={{ marginTop: 12 }}>
        <Button type="primary" onClick={run}>
          执行
        </Button>
        <Button onClick={clear}>清空</Button>
        <Button onClick={() => copy(output)} disabled={!output}>
          复制结果
        </Button>
      </Space>

      {stats && (
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={8}>
            <Statistic title="字节数" value={stats.bytes} />
          </Col>
          <Col span={8}>
            <Statistic title="键总数" value={stats.keys} />
          </Col>
          <Col span={8}>
            <Statistic title="最大深度" value={stats.depth} />
          </Col>
        </Row>
      )}
    </Card>
  );
}
