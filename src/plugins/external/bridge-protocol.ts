/**
 * zBiz 桥接协议 — 宿主与外部插件之间唯一的通信定义, 集中在此文件便于审计。
 *
 * 信任模型:
 *  - 插件 main.html 是不可信代码: iframe 沙箱不给 allow-same-origin,
 *    文档处于不透明源(opaque origin), 既拿不到 asset:// 的私有文件域, 也读不到宿主
 *    cookie/localStorage, 更无法摘掉自身 sandbox。
 *  - 因此插件只能经 postMessage 申请能力, 能力来自下面的显式白名单。
 *  - 不透明源下 ev.origin 恒为 "null", 无法据源判定身份, 所以用
 *    `ev.source === iframe.contentWindow` 把消息绑定到本插件的 frame 窗口句柄。
 *  - 回复消息的 targetOrigin 只能是 "*": 目标文档源不透明, 任何具体 origin
 *    都会被浏览器丢弃(见 HOST_REPLY_TARGET_ORIGIN); 泄露面为零 — 只回给已核验
 *    source 的那个 frame, 内容仅为该插件自己的 RPC 结果。
 */
import type { ZBizApi } from "./api";
// 这里必须带 `.ts` 后缀: 本文件是 node --experimental-strip-types 直接加载的
// 测试依赖链上的一环, node 不做扩展名补全。tsconfig 的
// allowImportingTsExtensions 已显式允许, vite 也能正常解析。
import {
  denialReason,
  isInvokePermitted,
  isMethodPermitted,
  type PermissionSet,
} from "./permissions.ts";

/** 沙箱权限: 不含 allow-same-origin, 保证插件文档为不透明源 */
export const PLUGIN_SANDBOX = "allow-scripts allow-forms allow-modals allow-popups";

/** 见文件头: 不透明源目标的 postMessage 只能用 "*" */
export const HOST_REPLY_TARGET_ORIGIN = "*";

/** 单条 RPC 的 args 上限 */
export const MAX_ARGS_COUNT = 8;
export const MAX_ARGS_BYTES = 256 * 1024;
export const MAX_ARGS_DEPTH = 6;
/** 每个挂载的 iframe 的调用配额(令牌桶, 按秒回填) */
export const RPC_BURST = 20;
export const RPC_REFILL_PER_SEC = 10;

/**
 * invoke 可转发的 Tauri 命令白名单 — 加条目等于开新后端能力, 需评审。
 * api.ts 与协议层共用这一份, 避免出现第二个"真实"名单。
 */
export const ALLOWED_INVOKE_COMMANDS: readonly string[] = ["http_request"];

export type BridgeMethodName =
  | "copyToClipboard"
  | "readClipboard"
  | "notify"
  | "log"
  | "invoke"
  | "storage.get"
  | "storage.set"
  | "storage.remove"
  | "hideMainWindow"
  | "showMainWindow";

/** 显式能力白名单 — 没有 fs / shell / 任意 invoke / 原型链 */
export const ALLOWED_METHODS: readonly BridgeMethodName[] = [
  "copyToClipboard",
  "readClipboard",
  "notify",
  "log",
  "invoke",
  "storage.get",
  "storage.set",
  "storage.remove",
  "hideMainWindow",
  "showMainWindow",
];

export interface HelloRequest {
  __zbiz_hello: 1;
}

export interface ReadyResponse {
  __zbiz_ready: 1;
  pluginId: string;
}

export interface RpcRequest {
  __zbiz: 1;
  id: string;
  method: BridgeMethodName;
  args: unknown[];
}

export interface RpcResponse {
  __zbiz_rsp: 1;
  id: string;
  result?: unknown;
  error?: string;
}

export type BridgeMessage = ReadyResponse | RpcResponse;

const MSG_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function helloMessage(): HelloRequest {
  return { __zbiz_hello: 1 };
}

export function readyMessage(pluginId: string): ReadyResponse {
  return { __zbiz_ready: 1, pluginId };
}

export function responseMessage(id: string, result: unknown, error?: string): RpcResponse {
  return error === undefined
    ? { __zbiz_rsp: 1, id, result }
    : { __zbiz_rsp: 1, id, error };
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

/** 深度 + 体积双重限制, 拒绝插件用巨型/嵌套 payload 拖垮宿主 */
function fitsLimits(value: unknown, depth = 0): boolean {
  if (depth > MAX_ARGS_DEPTH) return false;
  if (value === null || value === undefined) return true;
  const t = typeof value;
  if (t === "string") return (value as string).length <= MAX_ARGS_BYTES;
  if (t === "number" || t === "boolean") return true;
  if (Array.isArray(value)) {
    return value.every((v) => fitsLimits(v, depth + 1));
  }
  if (t === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 256) return false;
    return entries.every(([, v]) => fitsLimits(v, depth + 1));
  }
  return false; // function / symbol / DOM 句柄等一律拒绝
}

function withinByteBudget(value: unknown): boolean {
  try {
    const size = JSON.stringify(value)?.length ?? 0;
    return size <= MAX_ARGS_BYTES;
  } catch {
    return false; // 循环引用等
  }
}

/** 握手包解析: 只认 {__zbiz_hello:1} */
export function parseHello(data: unknown): boolean {
  return isRecord(data) && data.__zbiz_hello === 1;
}

/**
 * RPC 包解析 — 校验失败返回 null(静默丢弃, 不执行任何能力)。
 * 关键: method 必须命中白名单, 不做任何属性遍历, 所以
 * "constructor.constructor" 之类的取道宿主 global 的路径被彻底堵死。
 *
 * ## 为什么 `perms` 是必填参数
 *
 * 写成可选(`perms?:`)的话, 任何一处新增调用点忘记传就会**静默变成全放行** ——
 * 权限层在最需要它的地方静默失效, 而且这种失效不产生任何报错。
 * 必填参数把"忘了传"变成编译错误, 这是让安全判据 fail-closed 的唯一可靠办法。
 * 需要全开时显式写 `allPermissions()`。
 *
 * @param perms 该插件的权限集(来自 plugin.json 声明, 见 permissions.ts)
 */
export function parseRpc(data: unknown, perms: PermissionSet): RpcRequest | null {
  assertPermsProvided(perms);
  if (!isRecord(data)) return null;
  if (data.__zbiz !== 1) return null;
  const { id, method, args } = data;
  if (typeof id !== "string" || !MSG_ID_RE.test(id)) return null;
  if (typeof method !== "string" || !isAllowedMethod(method)) return null;
  if (!Array.isArray(args) || args.length > MAX_ARGS_COUNT) return null;
  if (!args.every((a) => fitsLimits(a))) return null;
  if (!withinByteBudget(args)) return null;
  // 权限判据: 不在 parse 阶段拦住, 就会进到 dispatch 拿能力。
  // 与 invoke 白名单同一处收口 —— 两层判据都在这里落地。
  if (!isMethodPermitted(perms, method)) return null;
  // invoke 的命令名也属于协议: 名单外(如 read_file)在解析阶段就丢, 不进 API 层
  if (method === "invoke") {
    const cmd = str(args[0]);
    if (!ALLOWED_INVOKE_COMMANDS.includes(cmd)) return null;
    // 命令级附加权限: 拿到 invoke 权限不代表能调 http
    if (!isInvokePermitted(perms, cmd)) return null;
  }
  return { __zbiz: 1, id, method, args };
}

/**
 * 运行期守卫: 权限集必须真的传进来了。
 *
 * 必填参数本来能在编译期拦住漏传, 但本仓的 tsconfig `include` 只有 `src`
 * (没有 @types/node, 不能把 tests 纳入检查), 于是**测试与脚本这一环不受类型
 * 保护** —— 实测里漏传 perms 表现为运行期的
 * "Cannot read properties of undefined (reading 'granted')"。
 *
 * 那个错虽然也会炸, 但指向不明, 容易被当成"别的模块坏了"。这里改成一句
 * 明确的话。⚠️ 关键性质: 漏传**绝不能**被当成"全放行"——
 * 权限判据静默失效是最坏的一种失效, 所以这里选择响亮地炸。
 */
function assertPermsProvided(perms: PermissionSet | undefined | null): asserts perms is PermissionSet {
  if (!perms || typeof perms !== "object" || !(perms.granted instanceof Set)) {
    throw new Error(
      "parseRpc: 缺少权限集。权限判据不得默认放行 —— 请显式传入 resolvePermissions(plugin) 或 allPermissions()。",
    );
  }
}

export function isAllowedMethod(method: string): method is BridgeMethodName {
  return (ALLOWED_METHODS as readonly string[]).includes(method);
}

/**
 * 判断一个被 parseRpc 丢掉的包, 是不是"结构合法但权限不足"。
 *
 * 为什么要单独判: `parseRpc` 对伪造包和越权包一律返回 null(静默, 这是对的 ——
 * 不给攻击者反馈)。但**插件作者自己**调用了没声明的权限时, 静默等于
 * "调用没反应", 他会一直查错方向。所以这一条只回话, 不放行。
 *
 * 注意分界: 越权方法、invoke 白名单外的命令、id 非法、超限 ——
 * 这些仍然静默, 因为它们对攻击者同样是信号, 回话等于帮忙探测。
 */
export function permissionDenial(data: unknown, perms: PermissionSet): string | null {
  assertPermsProvided(perms);
  if (!isRecord(data) || data.__zbiz !== 1) return null;
  const { id, method, args } = data;
  if (typeof id !== "string" || !MSG_ID_RE.test(id)) return null;
  if (typeof method !== "string" || !isAllowedMethod(method)) return null;
  if (!Array.isArray(args) || args.length > MAX_ARGS_COUNT) return null;
  if (!args.every((a) => fitsLimits(a))) return null;
  if (!withinByteBudget(args)) return null;

  // invoke 有两层权限: invoke 本身, 以及命令级附加权限。两层都得缺才算被拒。
  if (method === "invoke") {
    const cmd = str(args[0]);
    if (!ALLOWED_INVOKE_COMMANDS.includes(cmd)) return null; // 白名单问题, 静默
    // 真的会被放行 ⇒ 不是权限问题, 不该回话。
    // 少了这一句, 宿主会对**每一次成功的调用**都回一句"权限不足" ——
    // 本函数的第一版就是这样, 被"隐式档不该产生任何拒绝"这条用例打红的。
    if (isInvokePermitted(perms, cmd)) return null;
    return denialReason(perms, method, cmd);
  }

  if (isMethodPermitted(perms, method)) return null;
  return denialReason(perms, method);
}

/** 令牌桶: 防单个插件刷 RPC */
export function createBudget(burst = RPC_BURST, refillPerSec = RPC_REFILL_PER_SEC) {
  let tokens = burst;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/**
 * 白名单方法的落地实现 — 参数在这里显式收敛成宿主 API 的签名,
 * 插件传什么都不会多拿到一个能力。
 */
const DISPATCH: Record<BridgeMethodName, (api: ZBizApi, args: unknown[]) => unknown> = {
  copyToClipboard: (api, [text]) => api.copyToClipboard(str(text)),
  readClipboard: (api) => api.readClipboard(),
  notify: (api, [msg]) => api.notify(str(msg)),
  log: (api, args) => api.log(...args.map((a) => str(a))),
  // 命令名原样交给 api.ts, 由那里唯一的白名单判定(不在此处放宽)
  invoke: (api, [cmd, args]) => api.invoke(str(cmd), isRecord(args) ? args : {}),
  "storage.get": (api, [key]) => api.storage.get(str(key)),
  "storage.set": (api, [key, value]) => api.storage.set(str(key), str(value)),
  "storage.remove": (api, [key]) => api.storage.remove(str(key)),
  hideMainWindow: (api) => api.hideMainWindow(),
  showMainWindow: (api) => api.showMainWindow(),
};

export function dispatchBridgeMethod(api: ZBizApi, method: BridgeMethodName, args: unknown[]): unknown {
  return DISPATCH[method](api, args);
}
