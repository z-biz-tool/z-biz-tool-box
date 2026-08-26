/**
 * 插件开发模板 — 复制此文件, 改名, 填 meta + 组件, 即可。
 *
 * 用法:
 *   1. 复制为 src/plugins/<group>/<Name>Tool.tsx
 *      group ∈ {encoding, text, crypto, convert, network, system}
 *   2. 改 meta.key (唯一) / label / description / icon
 *   3. 实现下面的 <Name>Tool 组件
 *   4. npx tsc --noEmit 验证
 *   5. npm run tauri dev 跑起来, ⌥Space 搜 key 试
 */

import { useState } from "react";
import { Card, Input, Button, Space, message } from "antd";
import {
  usePluginInput,
  useCopyToClipboard,
  useClearAll,
  // useCommonStyles,  // 取消注释以拿到通用样式
} from "../../_shared";

import type { PluginMeta } from "../_types";

export const meta: PluginMeta = {
  // key: 全小写, 唯一, 跟 group 拼起来就是 src/plugins/<group>/<key>.tsx
  key: "my-tool",
  label: "我的工具",
  description: "一句话说明这个工具干什么",
  // keywords: 空格分隔, ⌘K 模糊搜索用, 可选
  keywords: "my tool 示例 template",
  // order: 数字越小越靠前, 默认 999, 可选
  // order: 100,
  // icon: 在 _SKILL/插件开发/SKILL.md §4 表里查, 可选
  icon: "tool",
};

export default function MyTool() {
  // —— 状态 —— //
  // 输入用 usePluginInput(key) — 跨会话持久化, 切走再回来还在
  const [input, setInput] = usePluginInput(meta.key);
  // 输出用普通 useState
  const [output, setOutput] = useState("");

  // —— 复用 hooks —— //
  const copy = useCopyToClipboard();
  const clear = useClearAll([() => setInput(""), () => setOutput("")]);

  // —— 核心逻辑 —— //
  // 替换为你自己的转换算法
  const transform = () => {
    if (!input) {
      message.warning("请输入内容");
      return;
    }
    try {
      setOutput(input.toUpperCase());
      message.success("转换完成");
    } catch (e) {
      message.error("转换失败: " + String(e));
    }
  };

  // —— 渲染 —— //
  return (
    <Card title={meta.label} bordered={false}>
      <Input.TextArea
        rows={6}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入要处理的内容..."
      />
      <Space style={{ marginTop: 12 }}>
        <Button type="primary" onClick={transform}>
          转换
        </Button>
        <Button onClick={clear}>清空</Button>
        <Button onClick={() => copy(output)} disabled={!output}>
          复制结果
        </Button>
      </Space>
      <Input.TextArea
        rows={6}
        value={output}
        readOnly
        style={{ marginTop: 12, fontFamily: "monospace" }}
      />
    </Card>
  );
}
