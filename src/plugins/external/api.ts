/**
 * zBiz API — 主应用注入到 iframe.contentWindow 的受限 API 集合。
 *
 * 设计原则 (仿 utools):
 *  - 显式列出,没有 access to Node / fs / network (除非显式 invoke 转发)
 *  - 通过 postMessage 走事件回调,避免 iframe.contentWindow 的循环引用
 *  - 所有错误返回 (而不是 throw),方便插件内 try/catch
 *
 * ## 权限裁剪在哪
 *
 * 本文件只提供**未裁剪**的真实实现; 按 manifest 声明的权限收窄 API 表面
 * 由 `api-gate.ts` 的 `buildGatedApi` 完成(台账 T1.9)。
 * 分成两个模块的原因: api-gate 必须是纯的 —— 它要在 node --test 里
 * 被直接断言"被拒的方法绝不能碰到底层实现", 而本文件 import 了
 * Tauri 与 antd, 在 node 里跑不起来。
 */
import { invoke } from "@tauri-apps/api/core";
import { writeText as clipboardWrite } from "@tauri-apps/plugin-clipboard-manager";
import { message } from "antd";
import { ALLOWED_INVOKE_COMMANDS } from "./bridge-protocol";
import { buildGatedApi, type ZBizApi } from "./api-gate";
import type { PermissionSet } from "./permissions.ts";

export type { ZBizApi };

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

/**
 * 构造某个插件拿到的 zBiz API。
 *
 * @param pluginId 插件 id
 * @param perms    该插件的权限集(来自 resolvePermissions(plugin))。
 *                 **必填**: 漏传会响亮地抛错, 绝不静默变成"全放行"。
 */
export function buildZbizApi(pluginId: string, perms: PermissionSet): ZBizApi {
  const storageKey = (k: string) => {
    if (typeof k !== "string" || !k || k.length > STORAGE_MAX_KEY_LEN || k.includes("\u0000")) {
      throw new Error(`zBiz.storage: 非法 key "${String(k).slice(0, 32)}"`);
    }
    return `${STORAGE_PREFIX}${pluginId}.${k}`;
  };

  // 未裁剪的真实实现
  const impl: ZBizApi = {
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
  // 按权限裁剪: 宿主真正交给这个插件的 API 表面。
  // 裁剪发生在 buildGatedApi 里, 那里保证"被拒的方法绝不触碰 impl"。
  return buildGatedApi(pluginId, perms, impl);
}
