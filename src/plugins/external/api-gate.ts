/**
 * zBiz API 权限裁剪 — 宿主把"能力白名单"再收窄成"这个插件真正拿到的 API"。
 *
 * ## 与协议层的关系
 *
 * `bridge-protocol.ts` 的 `parseRpc` 已经在**协议解析**阶段按权限拒包。
 * 但那是**防御性**的第二道闸: 它保证越权的包不会被 dispatch。
 *
 * 本模块是第一道闸: **API 表面本身**就按权限裁剪。
 *
 * 为什么要两道? 因为它们防的不是同一件事:
 *  - 协议层防的是**恶意包**: 伪造的 method、越权的 args。
 *  - 本模块防的是**宿主自身的调用路径**: 任何一处新增的代码路径,
 *    只要持有 api 对象, 就不能因为"忘了判权限"而拿到能力。
 *
 * 换句话说: 协议层是"不信任来包", 本模块是"不信任自己的调用方"。
 * 只有协议层时, 一条新增的内部调用路径(比如某个 UI 组件直接调
 * `api.readClipboard()`)就能绕过全部授权判定。
 *
 * ## 拒绝的形态
 *
 * 台账 T1.9 写的是「未授权方法调用返回 PermissionDenied」。
 * 所以拒绝**不是**"方法不存在"(那样插件只会看到 `is not a function`,
 * 查不出原因), 而是:
 *  - 有 `{ ok, error }` 信封的方法 ⇒ 返回 `{ ok: false, error: "PermissionDenied: ..." }`
 *  - 没有信封的方法(如 invoke) ⇒ 抛出 `Error("PermissionDenied: ...")`
 *
 * 两种形态的错误文本都带 `PermissionDenied` 前缀, 插件作者一眼能认出
 * 是授权问题而不是 bug。
 */
import {
  denialReason,
  permissionFor,
  permissionForCommand,
  type PermissionSet,
} from "./permissions.ts";

/** 拒绝时出现在错误文本里的固定标记 */
export const PERMISSION_DENIED = "PermissionDenied";

/** 宿主注入到 iframe.contentWindow 的受限 API 集合 */
export interface ZBizApi {
  /** 复制文本到系统剪贴板 */
  copyToClipboard: (text: string) => Promise<{ ok: boolean; error?: string }>;
  /** 读取系统剪贴板 */
  readClipboard: () => Promise<{ ok: boolean; text?: string; error?: string }>;
  /** 显示通知(主应用级别 toast) */
  notify: (msg: string) => void;
  /** 调用 Tauri 后端命令(cmd 由白名单判定; 名单外直接抛错) */
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

/** 门禁的判定结果 */
export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

const ALLOW: GateDecision = { allowed: true };

/** 组装一条拒绝原因, 文本带固定标记 */
export function permissionDeniedError(reason: string): Error {
  return new Error(`${PERMISSION_DENIED}: ${reason}`);
}

/** 组装一条拒绝信封(给有 { ok, error } 形态的方法用) */
export function permissionDeniedResult(reason: string): {
  ok: false;
  error: string;
} {
  return { ok: false, error: `${PERMISSION_DENIED}: ${reason}` };
}

/**
 * 运行期守卫: 权限集必须真的传进来。
 *
 * 与 `parseRpc` 的同名守卫同一条纪律 —— **漏传绝不能等于全放行**。
 * 权限判据静默失效是最坏的一种失效, 所以这里选择响亮地炸。
 */
function assertPermsProvided(perms: PermissionSet | undefined | null): asserts perms is PermissionSet {
  if (!perms || typeof perms !== "object" || !(perms.granted instanceof Set)) {
    throw new Error(
      "buildGatedApi: 缺少权限集。权限判据不得默认放行 —— 请显式传入 resolvePermissions(plugin) 或 allPermissions()。",
    );
  }
}

/**
 * 某个桥接方法在当前权限集下是否可用。
 *
 * 与 `permissions.ts` 的 `isMethodPermitted` 同源, 但这里返回**原因**,
 * 好让调用方把"为什么被拒"带给插件作者。
 */
export function gateMethod(perms: PermissionSet, method: string): GateDecision {
  assertPermsProvided(perms);
  const need = permissionFor(method);
  // 不认识的方法不由这里裁决(交协议白名单拒), 理由与 isMethodPermitted 一致
  if (need === null) return ALLOW;
  if (perms.granted.has(need)) return ALLOW;
  return { allowed: false, reason: denialReason(perms, method) };
}

/**
 * invoke 某个后端命令是否可用。
 *
 * 两层: invoke 本身 + 命令级附加权限(http_request 需要 http)。
 * 与 `isInvokePermitted` 同源, 同样返回原因。
 */
export function gateInvoke(perms: PermissionSet, cmd: string): GateDecision {
  assertPermsProvided(perms);
  if (!perms.granted.has("invoke")) {
    return { allowed: false, reason: denialReason(perms, "invoke", cmd) };
  }
  const extra = permissionForCommand(cmd);
  if (extra && !perms.granted.has(extra)) {
    return { allowed: false, reason: denialReason(perms, "invoke", cmd) };
  }
  return ALLOW;
}

/**
 * 按权限裁剪出宿主真正给这个插件的 API。
 *
 * @param pluginId 插件 id(写进返回对象的 pluginId 字段)
 * @param perms    该插件的权限集(来自 resolvePermissions)
 * @param impl     **未裁剪**的真实实现。本模块只做"能不能调"的判定,
 *                 一旦判定为拒绝, 绝不触碰 impl —— 这是本模块的核心保证。
 *
 * 返回值是冻结的: 与 api.ts 里原本的 `Object.freeze` 保持一致,
 * 防止运行期被替换实现。
 */
export function buildGatedApi(
  pluginId: string,
  perms: PermissionSet,
  impl: ZBizApi,
): ZBizApi {
  assertPermsProvided(perms);

  const gated: ZBizApi = {
    pluginId,

    copyToClipboard: async (text) => {
      const d = gateMethod(perms, "copyToClipboard");
      if (!d.allowed) return permissionDeniedResult(d.reason);
      return await impl.copyToClipboard(text);
    },

    readClipboard: async () => {
      const d = gateMethod(perms, "readClipboard");
      if (!d.allowed) return permissionDeniedResult(d.reason);
      return await impl.readClipboard();
    },

    notify: (msg) => {
      const d = gateMethod(perms, "notify");
      if (!d.allowed) {
        // notify 是隐式档能力, 正常不会走到这里; 走到就说明权限集被改坏了。
        // 不抛错(通知失败不该掀翻调用方), 但必须留下痕迹。
        console.warn(`[zBiz.notify] 被拒: ${d.reason}`);
        return;
      }
      impl.notify(msg);
    },

    invoke: async (cmd, args) => {
      const d = gateInvoke(perms, cmd);
      if (!d.allowed) throw permissionDeniedError(d.reason);
      return await impl.invoke(cmd, args);
    },

    storage: {
      get: async (key) => {
        const d = gateMethod(perms, "storage.get");
        if (!d.allowed) throw permissionDeniedError(d.reason);
        return await impl.storage.get(key);
      },
      set: async (key, value) => {
        const d = gateMethod(perms, "storage.set");
        if (!d.allowed) throw permissionDeniedError(d.reason);
        return await impl.storage.set(key, value);
      },
      remove: async (key) => {
        const d = gateMethod(perms, "storage.remove");
        if (!d.allowed) throw permissionDeniedError(d.reason);
        return await impl.storage.remove(key);
      },
    },

    hideMainWindow: async () => {
      const d = gateMethod(perms, "hideMainWindow");
      if (!d.allowed) throw permissionDeniedError(d.reason);
      return await impl.hideMainWindow();
    },

    showMainWindow: async () => {
      const d = gateMethod(perms, "showMainWindow");
      if (!d.allowed) throw permissionDeniedError(d.reason);
      return await impl.showMainWindow();
    },

    log: (...args) => {
      const d = gateMethod(perms, "log");
      if (!d.allowed) {
        console.warn(`[zBiz.log] 被拒: ${d.reason}`);
        return;
      }
      impl.log(...args);
    },
  };

  return Object.freeze({ ...gated, storage: Object.freeze(gated.storage) });
}
