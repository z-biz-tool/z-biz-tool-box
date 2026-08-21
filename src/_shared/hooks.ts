import { useCallback, useState } from "react";
import { message } from "antd";
import { useUiStore } from "../stores/uiStore";

/**
 * 复制文本到剪贴板的 hook — 统一处理 message 提示 + 容错。
 *
 * @example
 *   const copy = useCopyToClipboard();
 *   <Button onClick={() => copy(output)}>复制结果</Button>
 */
export function useCopyToClipboard() {
  return useCallback(async (text: string, label = "已复制") => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      message.success(label);
    } catch {
      // 退化方案: 用隐藏 textarea + execCommand
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        message.success(label);
      } catch {
        message.error("复制失败,请手动复制");
      }
    }
  }, []);
}

/**
 * 批量清空多个 state 的小工具。
 *
 * @example
 *   const clear = useClearAll([setInput, setOutput, setError]);
 *   <Button onClick={clear}>清空</Button>
 */
export function useClearAll(setters: Array<() => void>) {
  return useCallback(() => {
    setters.forEach((s) => s());
  }, [setters]);
}

/**
 * 工具输入持久化 hook — setInput 自动写入 uiStore,下次进入工具时自动恢复。
 *
 * @example
 *   const [input, setInput] = usePluginInput("base64");
 *   <Input.TextArea value={input} onChange={(e) => setInput(e.target.value)} />
 */
export function usePluginInput(pluginKey: string): [string, (v: string) => void] {
  const persisted = useUiStore((s) => s.inputs[pluginKey] ?? "");
  const storeSet = useUiStore((s) => s.setInput);
  const storeClear = useUiStore((s) => s.clearInput);
  const [local, setLocal] = useState(persisted);

  const setter = useCallback(
    (v: string) => {
      setLocal(v);
      if (v) storeSet(pluginKey, v);
      else storeClear(pluginKey);
    },
    [pluginKey, storeSet, storeClear]
  );

  return [local, setter];
}
