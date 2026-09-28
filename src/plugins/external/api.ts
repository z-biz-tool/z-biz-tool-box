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
import { ALLOWED_INVOKE_COMMANDS } from "./bridge-protocol";

export interface ZBizApi {
  /** 复制文本到系统剪贴板 */
  copyToClipboard: (text: string) => Promise<{ ok: boolean; error?: string }>;
  /** 读取系统剪贴板 */
  readClipboard: () => Promise<{ ok: boolean; text?: string; error?: string }>;
  /** 显示通知(主应用级别 toast) */
  notify: (msg: string) => void;
  /** 调用 Tauri 后端命令(cmd 为任意字符串, 由下方白名单判定; 名单外直接抛错) */
  invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
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
/** 转发的 Tauri 命令白名单(与协议层共用同一份) */
const INVOKE_ALLOWLIST = new Set<string>(ALLOWED_INVOKE_COMMANDS);
const STORAGE_MAX_KEY_LEN = 128;
const STORAGE_MAX_BYTES = 256 * 1024;

const byteLen = (v: unknown): number => {
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

export function buildZbizApi(pluginId: string): ZBizApi {
  const storageKey = (k: string) => {
    if (typeof k !== "string" || !k || k.length > STORAGE_MAX_KEY_LEN || k.includes("\u0000")) {
      throw new Error(`zBiz.storage: 非法 key "${String(k).slice(0, 32)}"`);
    }
    return `${STORAGE_PREFIX}${pluginId}.${k}`;
  };

  const api: ZBizApi = {
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
      if (!INVOKE_ALLOWLIST.has(cmd)) {
        throw new Error(`zBiz.invoke: cmd "${cmd}" 不在白名单`);
      }
      if (byteLen(args) > STORAGE_MAX_BYTES) {
        throw new Error("zBiz.invoke: args 超出体积上限");
      }
      return await invoke(cmd, { ...args });
    },
    storage: {
      get: async (key) => {
        try {
          return localStorage.getItem(storageKey(key));
        } catch (e) {
          throw new Error(`zBiz.storage.get: ${String(e)}`);
        }
      },
      set: async (key, value) => {
        if (byteLen(value) > STORAGE_MAX_BYTES) {
          throw new Error("zBiz.storage.set: value 超出体积上限");
        }
        try {
          localStorage.setItem(storageKey(key), value);
        } catch (e) {
          // 配额打满属于用户侧问题, 明确报错而不是静默丢数据
          throw new Error(`zBiz.storage.set 写入失败(可能存储空间已满): ${String(e)}`);
        }
      },
      remove: async (key) => {
        try {
          localStorage.removeItem(storageKey(key));
        } catch (e) {
          throw new Error(`zBiz.storage.remove: ${String(e)}`);
        }
      },
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
  // 冻结: 桥接每次拿到的都是只读快照, 避免运行期被替换实现
  return Object.freeze({ ...api, storage: Object.freeze(api.storage) });
}
