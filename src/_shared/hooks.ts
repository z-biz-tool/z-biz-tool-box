import { useCallback } from "react";
import { message } from "antd";

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
