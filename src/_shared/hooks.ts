import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
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

/**
 * 通用工具状态持久化 — useState 的直接替身, 值以 JSON 落到 uiStore.toolStates。
 * 切走再切回 / 重载后仍在; 单槽过大时只保留在内存, 不落盘(见 uiStore 的配额处理)。
 *
 * 敏感值(口令、剪贴板内容)不要用它持久化。
 *
 * @example
 *   const [mode, setMode] = useToolState("dedup", "mode", "line" as Mode);
 */
export function useToolState<T>(
  toolKey: string,
  slot: string,
  initial: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = `${toolKey}:${slot}`;
  const writeSlot = useUiStore((s) => s.setToolState);
  const [local, setLocal] = useState<T>(() => {
    const raw = useUiStore.getState().toolStates[storageKey];
    if (raw !== undefined) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        /* 历史脏数据: 回落到默认值 */
      }
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  const latest = useRef(local);
  latest.current = local;

  const update = useCallback(
    (v: T | ((prev: T) => T)) => {
      const next = typeof v === "function" ? (v as (prev: T) => T)(latest.current) : v;
      latest.current = next;
      setLocal(next);
      let raw: string | undefined;
      try {
        raw = JSON.stringify(next) ?? "null";
      } catch {
        raw = undefined; // 循环引用 / 不可序列化: 不持久化
      }
      if (raw !== undefined) writeSlot(storageKey, raw);
    },
    [storageKey, writeSlot]
  );

  return [local, update];
}
