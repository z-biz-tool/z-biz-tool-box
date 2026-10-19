// zBiz API 权限裁剪的行为测试（台账 T1.9）。
// 跑法：node --experimental-strip-types --test tests/*.test.ts
//
// ## 这个文件测什么
//
// 协议层(bridge-protocol.test.ts)已经保证"越权的包不会被 dispatch"。
// 这里测的是**另一道闸**：宿主交给插件的那个 API 对象本身,
// 必须已经按权限裁剪过 —— 任何新增的内部调用路径都不能绕过授权。
//
// ## 判据的方向
//
// 本文件的核心断言不是"返回值是什么", 而是 **"底层实现有没有被碰到"**。
// 用一个会记账的假实现: 被拒的方法一旦碰到它, 账上就有痕迹。
// 只断言"返回值像被拒了"是不够的 —— 实现可能先干了事再返回一个错误对象。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGatedApi,
  gateInvoke,
  gateMethod,
  PERMISSION_DENIED,
  type ZBizApi,
} from "../src/plugins/external/api-gate.ts";
import {
  allPermissions,
  noPermissions,
  resolvePermissions,
} from "../src/plugins/external/permissions.ts";

/** 会记账的假实现: 每个方法被调用就在账上记一笔 */
function makeSpyImpl() {
  const calls: string[] = [];
  const impl: ZBizApi = {
    pluginId: "spy",
    copyToClipboard: async (text) => {
      calls.push(`copyToClipboard:${text}`);
      return { ok: true };
    },
    readClipboard: async () => {
      calls.push("readClipboard");
      return { ok: true, text: "剪贴板内容" };
    },
    notify: (msg) => {
      calls.push(`notify:${msg}`);
    },
    invoke: async (cmd) => {
      calls.push(`invoke:${cmd}`);
      return "ok";
    },
    storage: {
      get: async (key) => {
        calls.push(`storage.get:${key}`);
        return "v";
      },
      set: async (key, value) => {
        calls.push(`storage.set:${key}=${value}`);
      },
      remove: async (key) => {
        calls.push(`storage.remove:${key}`);
      },
    },
    hideMainWindow: async () => {
      calls.push("hideMainWindow");
    },
    showMainWindow: async () => {
      calls.push("showMainWindow");
    },
    log: (...args) => {
      calls.push(`log:${args.length}`);
    },
  };
  return { impl, calls };
}

/* ------------------------------------------------------------------ *
 * 门禁判定本身
 * ------------------------------------------------------------------ */

test("未授权方法 ⇒ 门禁拒绝, 且理由点名要补哪条权限", () => {
  const p = noPermissions();
  const d = gateMethod(p, "readClipboard");
  assert.equal(d.allowed, false);
  assert.ok(!d.allowed);
  if (!d.allowed) {
    assert.ok(d.reason.includes("clipboard.read"), "理由要能指导修复: " + d.reason);
  }
});

test("已授权方法 ⇒ 门禁放行", () => {
  const p = resolvePermissions({ permissions: ["clipboard.read", "clipboard.write", "window.control", "http", "invoke"] });
  for (const m of ["readClipboard", "copyToClipboard", "hideMainWindow", "showMainWindow", "invoke"]) {
    assert.equal(gateMethod(p, m).allowed, true, `${m} 已声明该放行`);
  }
});

test("invoke 是两层权限: 拿 invoke 不等于能调 http_request", () => {
  const onlyInvoke = resolvePermissions({ permissions: ["invoke"] });
  const d = gateInvoke(onlyInvoke, "http_request");
  assert.equal(d.allowed, false, "没有 http 权限就不该放行 http_request");
  const both = resolvePermissions({ permissions: ["invoke", "http"] });
  assert.equal(gateInvoke(both, "http_request").allowed, true);
});

/* ------------------------------------------------------------------ *
 * 裁剪后的 API: 核心判据 —— 被拒的方法绝不碰底层实现
 * ------------------------------------------------------------------ */

test("默认档下: 读剪贴板/写剪贴板/动窗口/调后端 全部被拒, 且一次都没碰到实现", async () => {
  const { impl, calls } = makeSpyImpl();
  const api = buildGatedApi("p", noPermissions(), impl);

  const r = await api.readClipboard();
  assert.equal(r.ok, false, "读剪贴板必须失败");
  assert.ok(r.error!.startsWith(PERMISSION_DENIED), "错误要带 PermissionDenied 标记: " + r.error);

  const w = await api.copyToClipboard("x");
  assert.equal(w.ok, false);
  assert.ok(w.error!.startsWith(PERMISSION_DENIED));

  await assert.rejects(() => api.hideMainWindow(), /PermissionDenied/);
  await assert.rejects(() => api.showMainWindow(), /PermissionDenied/);
  await assert.rejects(() => api.invoke("http_request", {}), /PermissionDenied/);

  // 关键判据: 账本上**一笔都没有**
  assert.deepEqual(calls, [], "被拒的方法绝不能触碰底层实现: " + JSON.stringify(calls));
});

test("隐式档方法(日志/通知/存储)照常工作", async () => {
  const { impl, calls } = makeSpyImpl();
  const api = buildGatedApi("p", noPermissions(), impl);
  api.log("hi");
  api.notify("yo");
  await api.storage.set("k", "v");
  assert.equal(await api.storage.get("k"), "v");
  await api.storage.remove("k");
  assert.deepEqual(calls.sort(), [
    "log:1",
    "notify:yo",
    "storage.get:k",
    "storage.remove:k",
    "storage.set:k=v",
  ]);
});

test("只声明一条权限, 只放行那一条 —— 不连坐", async () => {
  const { impl, calls } = makeSpyImpl();
  const api = buildGatedApi("p", resolvePermissions({ permissions: ["clipboard.read"] }), impl);

  const r = await api.readClipboard();
  assert.equal(r.ok, true, "声明了 clipboard.read 就该放行");
  assert.equal(r.text, "剪贴板内容");

  // 其余全部被拒
  assert.equal((await api.copyToClipboard("x")).ok, false);
  await assert.rejects(() => api.hideMainWindow(), /PermissionDenied/);
  await assert.rejects(() => api.invoke("http_request", {}), /PermissionDenied/);

  assert.deepEqual(calls, ["readClipboard"], "只有被放行的那一个碰到了实现: " + JSON.stringify(calls));
});

test("全开 ⇒ 全部放行(权限层不阻塞合法调用)", async () => {
  const { impl, calls } = makeSpyImpl();
  const api = buildGatedApi("p", allPermissions(), impl);
  assert.equal((await api.readClipboard()).ok, true);
  assert.equal((await api.copyToClipboard("x")).ok, true);
  await api.hideMainWindow();
  await api.showMainWindow();
  assert.equal(await api.invoke("http_request", {}), "ok");
  assert.equal(calls.length, 5, "五次调用都该真的发生: " + JSON.stringify(calls));
});

/* ------------------------------------------------------------------ *
 * 失败模式
 * ------------------------------------------------------------------ */

test("漏传权限集必须响亮地炸, 绝不能当成全放行", () => {
  const { impl } = makeSpyImpl();
  assert.throws(
    () => buildGatedApi("p", undefined as never, impl),
    /缺少权限集/,
    "漏传 perms 必须抛错, 不能静默变成全放行",
  );
  assert.throws(() => buildGatedApi("p", {} as never, impl), /缺少权限集/);
  // 门禁函数同样
  assert.throws(() => gateMethod(undefined as never, "readClipboard"), /缺少权限集/);
  assert.throws(() => gateInvoke(undefined as never, "http_request"), /缺少权限集/);
});

test("裁剪后的 API 是冻结的 —— 运行期换不掉实现", () => {
  const { impl } = makeSpyImpl();
  const api = buildGatedApi("p", allPermissions(), impl);
  assert.ok(Object.isFrozen(api));
  assert.ok(Object.isFrozen(api.storage));
  assert.throws(() => {
    (api as unknown as Record<string, unknown>).readClipboard = () => "hacked";
  }, TypeError);
});

test("pluginId 原样透传(插件要能自查自己是谁)", () => {
  const { impl } = makeSpyImpl();
  const api = buildGatedApi("com.example.demo", allPermissions(), impl);
  assert.equal(api.pluginId, "com.example.demo");
});

test("未知方法不由门禁裁决 —— 交协议白名单拒", () => {
  // 与 permissions.ts 的 isMethodPermitted 同一套分工:
  // 门禁管"授权", 白名单管"存在性"。门禁若对未知方法返回拒绝,
  // 错误原因会误导成"权限不足"。
  const d = gateMethod(noPermissions(), "readFile");
  assert.equal(d.allowed, true, "未知方法不由门禁拒");
});
