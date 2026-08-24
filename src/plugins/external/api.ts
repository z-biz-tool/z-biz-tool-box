/**
 * zBiz API — 主应用注入到 iframe.contentWindow 的受限 API 集合。
 *
 * 设计原则 (仿 utools):
 *  - 显式列出,没有 access to Node / fs / network (除非显式 invoke 转发)
 *  - 通过 postMessage 走事件回调,避免 iframe.contentWindow 的循环引用
 *  - 所有错误返回 (而不是 throw),方便插件内 try/catch
 */
import { invoke } from "@tauri-apps/api/core";
import { writeText as clipboardWrite } from "@tauri-apps/plugin-clipboard-manager";
import { message } from "antd";

export interface ZBizApi {
  /** 复制文本到系统剪贴板 */
  copyToClipboard: (text: string) => Promise<{ ok: boolean; error?: string }>;
  /** 读取系统剪贴板 */
  readClipboard: () => Promise<{ ok: boolean; text?: string; error?: string }>;
  /** 显示通知(主应用级别 toast) */
  notify: (msg: string) => void;
  /** 调用 Tauri 后端命令(白名单制:仅 http_request) */
  invoke: (cmd: "http_request", args: Record<string, unknown>) => Promise<unknown>;
  /** 简单 KV 存储(plugin-scoped,key 前缀自动加 plugin id) */
  storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  /** 插件自身 id(注入时绑定) */
  pluginId: string;
  /** 隐藏主窗口 */
  hideMainWindow: () => Promise<void>;
  /** 显示主窗口 */
  showMainWindow: () => Promise<void>;
  /** 日志(主应用 console + antd message) */
  log: (...args: unknown[]) => void;
}

const STORAGE_PREFIX = "zBiz.plugin.";

export function buildZbizApi(pluginId: string): ZBizApi {
  const storageKey = (k: string) => `${STORAGE_PREFIX}${pluginId}.${k}`;

  return {
    pluginId,
    copyToClipboard: async (text) => {
      try {
        await clipboardWrite(text);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    readClipboard: async () => {
      try {
        const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
        const text = await readText();
        return { ok: true, text };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    notify: (msg) => {
      try {
        message.info(msg);
      } catch {
        // antd 未挂载时 fallback
        console.log("[zBiz.notify]", msg);
      }
    },
    invoke: async (cmd, args) => {
      // 白名单:只允许 http_request (实际安全考虑可以加更多)
      if (cmd !== "http_request") {
        throw new Error(`zBiz.invoke: cmd "${cmd}" 不在白名单`);
      }
      return await invoke(cmd, args);
    },
    storage: {
      get: async (key) => localStorage.getItem(storageKey(key)),
      set: async (key, value) => localStorage.setItem(storageKey(key), value),
      remove: async (key) => localStorage.removeItem(storageKey(key)),
    },
    hideMainWindow: async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().hide();
      } catch (e) {
        console.warn("[zBiz.hideMainWindow]", e);
      }
    },
    showMainWindow: async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().show();
        await getCurrentWindow().setFocus();
      } catch (e) {
        console.warn("[zBiz.showMainWindow]", e);
      }
    },
    log: (...args) => console.log(`[${pluginId}]`, ...args),
  };
}
