/**
 * 插件桥接安全自检(无测试框架, 直接 node 跑):
 *   node --experimental-strip-types scripts/check-plugin-bridge.ts
 * 断言两件事: 沙箱不出现 allow-same-origin; 协议层拒绝伪造/越权 RPC。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ALLOWED_METHODS,
  PLUGIN_SANDBOX,
  HOST_REPLY_TARGET_ORIGIN,
  createBudget,
  dispatchBridgeMethod,
  parseHello,
  parseRpc as realParseRpc,
  readyMessage,
  responseMessage,
} from "../src/plugins/external/bridge-protocol.ts";
import {
  allPermissions,
  noPermissions,
  resolvePermissions,
} from "../src/plugins/external/permissions.ts";

/**
 * 本脚本测**协议层**: 白名单 + 结构校验, 所以把权限这层显式全开。
 *
 * 证据: 最初直接写 `parseRpc(p)`, 被新加的运行期守卫
 * "parseRpc: 缺少权限集" 当场拦下 —— 这条守卫正是为了兜住
 * 「tsconfig 的 include 只有 src, 脚本与测试不受类型检查保护」这个盲区。
 */
const PERMS = allPermissions();
const parseRpc = (data: unknown) => realParseRpc(data, PERMS);

const here = dirname(fileURLToPath(import.meta.url));
const iframeSrc = readFileSync(join(here, "../src/plugins/external/PluginIframe.tsx"), "utf8");
// 注释里会解释历史漏洞, 断言只看真实代码
const codeOnly = iframeSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let failed = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failed++;
};

// ---- 1. 沙箱属性 ----
const tokens = PLUGIN_SANDBOX.split(/\s+/);
check("sandbox 不含 allow-same-origin", !tokens.includes("allow-same-origin"));
check("sandbox 保留 allow-scripts(插件代码仍可运行)", tokens.includes("allow-scripts"));
check("PluginIframe 用常量设置 sandbox", /sandbox=\{PLUGIN_SANDBOX\}/.test(codeOnly));
check("真实代码里没有 allow-same-origin", !codeOnly.includes("allow-same-origin"));
check("旧的原型链取值路径已删除", !/method\.split\("\."\)/.test(codeOnly));
check("宿主仍按 frame 窗口句柄校验来源", /ev\.source !== iframe\.contentWindow/.test(codeOnly));
check("回复走统一 targetOrigin 常量", /postMessage\(msg, HOST_REPLY_TARGET_ORIGIN\)/.test(codeOnly));
check("不透明源下 targetOrigin 只能是 *", HOST_REPLY_TARGET_ORIGIN === "*");

// ---- 2. 握手 ----
check("解析 {__zbiz_hello:1}", parseHello({ __zbiz_hello: 1 }) === true);
check("拒绝伪握手包", parseHello({ __zbiz_hello: "yes" }) === false && parseHello(null) === false);
check("ready 包带 pluginId", readyMessage("a.b").pluginId === "a.b");
check("rsp 包错误序列化", responseMessage("r1", undefined, "boom").error === "boom");

// ---- 3. 真实插件(10003001)实际发送的包必须仍然被接受 ----
const realPackets = [
  { __zbiz: 1, id: "r1", method: "invoke", args: ["http_request", { url: "http://x/y", body: "{}" }] },
  { __zbiz: 1, id: "r2", method: "copyToClipboard", args: ["trace-abc"] },
  { __zbiz: 1, id: "r3", method: "readClipboard", args: [] },
  { __zbiz: 1, id: "r4", method: "notify", args: ["已复制"] },
  { __zbiz: 1, id: "r5", method: "storage.get", args: ["history"] },
  { __zbiz: 1, id: "r6", method: "storage.set", args: ["history", "[]"] },
  { __zbiz: 1, id: "r7", method: "hideMainWindow", args: [] },
  { __zbiz: 1, id: "r8", method: "showMainWindow", args: [] },
  { __zbiz: 1, id: "r9", method: "log", args: ["debug", 1] },
];
for (const p of realPackets) {
  check(`接受插件真实调用 ${p.method}`, parseRpc(p)?.method === p.method);
}

// ---- 4. 伪造/越权包必须被拒 ----
const forged: unknown[] = [
  // 原型链逃逸: 旧实现经 reduce 取到 Function, 拼出宿主 window(含 __TAURI_INTERNALS__)
  { __zbiz: 1, id: "r1", method: "constructor.constructor", args: ["return this"] },
  { __zbiz: 1, id: "r2", method: "__proto__.constructor", args: [] },
  { __zbiz: 1, id: "r3", method: "constructor", args: [] },
  { __zbiz: 1, id: "r4", method: "storage", args: [] },
  { __zbiz: 1, id: "r5", method: "invoke", args: ["read_file", { path: "/etc/passwd" }] },
  { __zbiz: 1, id: "r6", method: "fs", args: [] },
  { __zbiz: 1, id: "r7", method: "copyToClipboard" }, // 缺 args
  { __zbiz: 1, id: "", method: "notify", args: [] }, // 空 id
  { __zbiz: 1, id: "a".repeat(200), method: "notify", args: [] }, // id 过长
  { __zbiz: 1, id: "r9", method: "notify", args: "not-an-array" },
  { __zbiz: 1, id: "r10", method: "notify", args: new Array(50).fill("x") }, // args 过多
  { __zbiz: 1, id: "r11", method: "storage.set", args: ["k", "x".repeat(300 * 1024)] }, // 超大
  { __zbiz: 1, id: "r12", method: "storage.set", args: ["k", { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } }] }, // 超深
  { __zbiz: 1, method: "notify", args: [] }, // 缺 id
  { __zbiz: 2, id: "r14", method: "notify", args: [] }, // 标记不对
  { __zbiz: 1, id: "r15", method: 42, args: [] },
  { hello: 1 },
  "string-payload",
  null,
];
forged.forEach((p, i) => {
  check(`拒绝伪造包 #${i}`, parseRpc(p) === null);
});
// undefined 参数由 str() 收敛成 ""(能力不变), 不算伪造
check(
  "undefined 参数降级为空串而不是丢包",
  parseRpc({ __zbiz: 1, id: "r13", method: "notify", args: [undefined] })?.method === "notify"
);
check("未知方法不在白名单", !ALLOWED_METHODS.includes("constructor.constructor" as never));

// ---- 5. 分发只走白名单实现 ----
const calls: string[] = [];
const fakeApi = new Proxy(
  {
    pluginId: "p",
    copyToClipboard: async (t: string) => (calls.push(`copy:${t}`), { ok: true }),
    readClipboard: async () => (calls.push("read"), { ok: true, text: "" }),
    notify: (m: string) => calls.push(`notify:${m}`),
    log: (...a: unknown[]) => calls.push(`log:${a.length}`),
    invoke: async (c: string, args: Record<string, unknown>) => (calls.push(`invoke:${c}:${Object.keys(args).length}`), null),
    storage: {
      get: async (k: string) => (calls.push(`get:${k}`), "v"),
      set: async (k: string, v: string) => void calls.push(`set:${k}:${v.length}`),
      remove: async (k: string) => void calls.push(`rm:${k}`),
    },
    hideMainWindow: async () => calls.push("hide"),
    showMainWindow: async () => calls.push("show"),
  } as any,
  {
    get(target, prop) {
      if (prop === "then") return undefined;
      if (typeof prop === "symbol") return undefined;
      if (!(prop in target)) throw new Error(`分发访问了未知能力: ${String(prop)}`);
      return target[prop];
    },
  }
);
for (const p of realPackets) {
  const rpc = parseRpc(p)!;
  dispatchBridgeMethod(fakeApi, rpc.method, rpc.args);
}
check(
  "9 个真实调用各自命中一次实现",
  calls.length === 9 &&
    calls[0].startsWith("invoke:http_request:") &&
    calls[7] === "show" &&
    calls[8] === "log:2"
);
check("args 被收敛为基础类型(未把宿主对象交给插件)", /set:history:2/.test(calls.join("|")));

// ---- 6. RPC 配额 ----
const budget = createBudget(3, 0);
check("令牌桶按 burst 放行", budget() && budget() && budget() && !budget());

// ---- 7. 权限模型: 默认拒绝 ----
// 这段是本仓对外的核心承诺, 放在自检里而不是只放在 tests 里:
// `npm run check:bridge` 是改这块时最快能跑的那条命令。
const bare = { __zbiz: 1, id: "p1", method: "readClipboard", args: [] };
check("没声明权限的插件调 readClipboard 被拒", realParseRpc(bare, noPermissions()) === null);
check(
  "没声明权限的插件调 invoke(http_request) 被拒",
  realParseRpc({ ...bare, method: "invoke", args: ["http_request", {}] }, noPermissions()) === null,
);
check(
  "没声明权限的插件控制主窗口被拒",
  realParseRpc({ ...bare, method: "hideMainWindow", args: [] }, noPermissions()) === null,
);
check(
  "隐式档放行 notify",
  realParseRpc({ ...bare, method: "notify", args: ["hi"] }, noPermissions()) !== null,
);
check(
  "声明后才放行",
  realParseRpc(bare, resolvePermissions({ permissions: ["clipboard.read"] })) !== null,
);
check(
  "拿到 invoke 权限但没 http 权限时仍调不了 http_request",
  realParseRpc({ ...bare, method: "invoke", args: ["http_request", {}] },
    resolvePermissions({ permissions: ["invoke"] })) === null,
);
check(
  "权限层不能放宽白名单: 全开也放行不了名单外方法",
  realParseRpc({ ...bare, method: "readFile" }, PERMS) === null,
);

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
