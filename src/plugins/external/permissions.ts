/**
 * 插件权限模型 — manifest 声明 + 宿主按声明放行。
 *
 * ## 为什么要有这一层
 *
 * 协议白名单只回答"哪些方法存在"，不回答"哪个插件能用哪些"。
 * 早期版本里**所有**外部插件都无条件拿到完整 zBiz API，包括
 * `readClipboard`（读走用户剪贴板里的验证码/密码）、任意 URL 的
 * `http_request`（内网探测 + 中间人）、`hideMainWindow`（把用户正在用的
 * 窗口藏起来）。于是一个恶意或写错的插件，不需要任何提权，
 * 就获得了这些能力 —— 白名单从"授权清单"退化成"能力目录"。
 *
 * ## 三条设计原则
 *
 * 1. **默认拒绝。** manifest 没写 `permissions` 的插件只拿到
 *    [`IMPLICIT_PERMISSIONS`] 那一档（只影响插件自身或用户可见）。
 *    想要别的就在 plugin.json 里显式写出来。
 * 2. **判定放在协议解析层。** 权限不满足的包在 `parseRpc` 阶段就被拒，
 *    不会进到 `dispatchBridgeMethod` —— 与 invoke 命令白名单同一处收口。
 * 3. **拒绝要给出可执行的原因。** 静默丢弃会让插件作者永远查不出问题；
 *    所以被权限拦下的包会带一句"往 plugin.json 里加哪一条"。
 *
 * ## 权限取值是开放字符串
 *
 * 刻意**不**做成封闭联合类型：宿主与外部插件是**分别发布的**，
 * 新版本宿主要能认得老插件没写过的权限名（进 `unknownDeclared` 报出来），
 * 而不是解析 manifest 时直接抛错导致插件整个加载不了。
 */

/** 权限名。开放集合，见文件头说明。 */
export const PERMISSIONS = [
  /** 日志。只进宿主 console。 */
  "log",
  /** 主应用级 toast。 */
  "notify",
  /** 插件私有 KV（key 自动加插件 id 前缀）。 */
  "storage",
  /** 写系统剪贴板。 */
  "clipboard.write",
  /** 读系统剪贴板。会读走验证码/密码。 */
  "clipboard.read",
  /** 隐藏/显示/聚焦主窗口。 */
  "window.control",
  /** 经 http_request 发起网络请求。 */
  "http",
  /** invoke Tauri 后端命令（还需该命令自身对应的权限）。 */
  "invoke",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_SET: ReadonlySet<string> = new Set<string>(PERMISSIONS);

/** 无需声明即可使用的一档：只影响插件自身，或用户一眼能看见。 */
export const IMPLICIT_PERMISSIONS: readonly Permission[] = ["log", "notify", "storage"];

/** 解析后的权限集合 */
export interface PermissionSet {
  /** 实际可用的权限（隐式档 + manifest 声明的合法项） */
  readonly granted: ReadonlySet<Permission>;
  /** manifest 写了但宿主不认识的权限名 —— 拼错的可能性最大，必须报出来 */
  readonly unknownDeclared: readonly string[];
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * 从 manifest 解析权限。
 *
 * 刻意不抛错：`permissions` 写成字符串、数字、对象、带洞的数组时，
 * 全部按"没有声明任何额外权限"处理并继续加载插件。
 * 让一个插件因为多写了个逗号就打不开，比让它少几个能力更糟 ——
 * 但少掉的能力必须是**显式可见**的（见 IMPLICIT_PERMISSIONS 与 UI 提示）。
 */
export function resolvePermissions(manifest: unknown): PermissionSet {
  const granted = new Set<Permission>(IMPLICIT_PERMISSIONS);
  const unknown: string[] = [];

  const rec = asRecord(manifest);
  const raw = rec?.permissions;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "string") continue; // 非字符串直接忽略, 不算 unknown
      const name = item.trim();
      if (!name) continue;
      if (PERMISSION_SET.has(name)) {
        granted.add(name as Permission);
      } else {
        unknown.push(name);
      }
    }
  }

  return { granted, unknownDeclared: unknown };
}

/** 显式全开。仅供测试与「用户手动放开一切」的调试路径使用。 */
export function allPermissions(): PermissionSet {
  return { granted: new Set<Permission>(PERMISSIONS), unknownDeclared: [] };
}

/** 只拿到隐式档，等价于 manifest 里什么都没写 */
export function noPermissions(): PermissionSet {
  return { granted: new Set<Permission>(IMPLICIT_PERMISSIONS), unknownDeclared: [] };
}

/** 该方法需要哪一条权限 */
export function permissionFor(method: string): Permission | null {
  switch (method) {
    case "log":
      return "log";
    case "notify":
      return "notify";
    case "storage.get":
    case "storage.set":
    case "storage.remove":
      return "storage";
    case "copyToClipboard":
      return "clipboard.write";
    case "readClipboard":
      return "clipboard.read";
    case "hideMainWindow":
    case "showMainWindow":
      return "window.control";
    case "invoke":
      return "invoke";
    default:
      return null; // 不在协议白名单内的方法, 由 parseRpc 另行拒绝
  }
}

/**
 * invoke 某个后端命令额外需要的权限。
 *
 * 与 {@link permissionFor} 的 invoke 档是**叠加**关系：拿到 `invoke` 只代表
 * "可以调后端命令"，具体命令还有各自的权限。
 */
export function permissionForCommand(cmd: string): Permission | null {
  switch (cmd) {
    case "http_request":
      return "http";
    default:
      return null;
  }
}

/** 该方法在当前权限集下是否可用 */
export function isMethodPermitted(perms: PermissionSet, method: string): boolean {
  const need = permissionFor(method);
  // 不认识的方法不由这里判 —— 返回"放行"，让 parseRpc 的白名单去拒它。
  // 两层判据分工明确：白名单管"存在性"，权限管"授权"。
  if (need === null) return true;
  return perms.granted.has(need);
}

/** invoke 是否被允许（含命令级附加权限） */
export function isInvokePermitted(perms: PermissionSet, cmd: string): boolean {
  if (!perms.granted.has("invoke")) return false;
  const need = permissionForCommand(cmd);
  return need === null || perms.granted.has(need);
}

/** 被拒时给插件作者的可执行说明 */
export function denialReason(perms: PermissionSet, method: string, cmd?: string): string {
  const need = permissionFor(method);
  if (method === "invoke") {
    if (!perms.granted.has("invoke")) {
      return "zBiz 权限不足：该插件的 plugin.json 未声明 \"invoke\"，已拒绝调用后端命令。";
    }
    const extra = cmd ? permissionForCommand(cmd) : null;
    if (extra && !perms.granted.has(extra)) {
      return `zBiz 权限不足：命令 "${cmd}" 需要 "${extra}" 权限，plugin.json 未声明。`;
    }
    return "zBiz 权限不足：该命令不在宿主白名单内。";
  }
  if (need === null) return `zBiz 权限不足：方法 "${method}" 不在白名单内。`;
  return `zBiz 权限不足：该插件的 plugin.json 未声明 "${need}"，已拒绝 ${method}。`;
}

/** UI 提示用：把声明了但宿主不认识的权限名列出来 */
export function describeUnknown(perms: PermissionSet): string | null {
  if (perms.unknownDeclared.length === 0) return null;
  const list = perms.unknownDeclared.join("、");
  return `该插件声明了宿主不认识的权限：${list}。可能是拼写错误，这些权限不会生效。`;
}
