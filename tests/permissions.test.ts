// 插件权限模型的行为测试（无 React、无 DOM、Tauri）。
// 跑法：node --experimental-strip-types --test tests/*.test.ts
//
// 这个文件测的是**授权**而不是协议结构：协议白名单回答"哪些方法存在"
//（见 bridge-protocol.test.ts），这里回答"哪个插件能用哪些"。
//
// 断言方向与协议测试相反：这里大量断言**必须被拒**。
// 因为本层的设计是默认拒绝 —— 一条"漏拦"就是一条能读剪贴板或发网络请求的通路。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPLICIT_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_SET,
  allPermissions,
  denialReason,
  describeUnknown,
  isInvokePermitted,
  isMethodPermitted,
  noPermissions,
  permissionFor,
  permissionForCommand,
  resolvePermissions,
} from "../src/plugins/external/permissions.ts";
import {
  MAX_ARGS_BYTES,
  MAX_ARGS_COUNT,
  parseRpc,
  permissionDenial,
} from "../src/plugins/external/bridge-protocol.ts";

const rpc = (over: Partial<{ id: string; method: string; args: unknown[] }> = {}) => ({
  __zbiz: 1,
  id: "r1",
  method: "notify",
  args: ["hi"],
  ...over,
});

/* ------------------------------------------------------------------ *
 * 解析：默认拒绝
 * ------------------------------------------------------------------ */

test("manifest 什么都不写 ⇒ 只拿到隐式档", () => {
  for (const manifest of [undefined, null, {}, { permissions: undefined }]) {
    const p = resolvePermissions(manifest);
    assert.deepEqual([...p.granted].sort(), [...IMPLICIT_PERMISSIONS].sort());
  }
});

test("隐式档只含 log/notify/storage —— 不得含任何越界能力", () => {
  // 这三条的共性：只影响插件自身，或用户一眼能看见。
  // 任何"能读用户数据 / 能发网络请求 / 能动窗口"的东西都不该在这里。
  assert.deepEqual([...IMPLICIT_PERMISSIONS].sort(), ["log", "notify", "storage"]);
  for (const forbidden of ["clipboard.read", "clipboard.write", "window.control", "http", "invoke"]) {
    assert.ok(
      !IMPLICIT_PERMISSIONS.includes(forbidden as never),
      `${forbidden} 不该是隐式权限`,
    );
  }
});

test("声明了就拿到, 且不会污染 unknownDeclared", () => {
  const p = resolvePermissions({ permissions: ["http", "clipboard.read"] });
  assert.ok(p.granted.has("http"));
  assert.ok(p.granted.has("clipboard.read"));
  assert.ok(!p.granted.has("invoke"), "没声明的不能顺带拿到");
  assert.deepEqual(p.unknownDeclared, []);
});

test("声明了宿主不认识的权限 ⇒ 不生效但要被报出来（拼写错误的唯一出口）", () => {
  const p = resolvePermissions({ permissions: ["htt", "clipboard.reads"] });
  assert.equal(p.granted.has("htt" as never), false, "未知权限绝不能被当成有效权限");
  assert.equal(p.granted.has("clipboard.reads" as never), false);
  assert.ok(!p.granted.has("clipboard.read"), "拼错的不能命中真权限");
  assert.deepEqual(p.unknownDeclared, ["htt", "clipboard.reads"]);
  assert.ok(describeUnknown(p)?.includes("htt"));
});

test("permissions 写成非数组/非字符串时按没声明处理, 且不抛错", () => {
  // 插件打不开比少几个能力更糟: 多写个逗号不该让整个插件失效。
  for (const bad of ["http", 42, { http: true }, [null, 1, {}], [""], ["  "]]) {
    const p = resolvePermissions({ permissions: bad });
    assert.ok(!p.granted.has("http"), `非法的 permissions 不该放行 http: ${JSON.stringify(bad)}`);
    assert.deepEqual(p.unknownDeclared, [], "非字符串项不算 unknown, 免得刷屏");
  }
});

test("权限名两侧空白被裁掉（作者写 ' http ' 不该失效）", () => {
  const p = resolvePermissions({ permissions: ["  http  "] });
  assert.ok(p.granted.has("http"));
});

/* ------------------------------------------------------------------ *
 * 方法 → 权限 的映射完整性
 * ------------------------------------------------------------------ */

test("每个白名单方法都必须映射到一条权限, 不得有漏网", () => {
  // 新增白名单方法却忘了在 permissionFor 里登记, 就会变成"无权限要求" ——
  // 那是本层最危险的漏法: 它不是拒绝, 是静默放行。
  const methods = [
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
  for (const m of methods) {
    const need = permissionFor(m);
    assert.ok(need !== null, `${m} 没有映射到任何权限`);
    assert.ok(PERMISSION_SET.has(need), `${m} 映射到了不存在的权限 ${need}`);
  }
});

test("不存在的权限名不得出现在映射里", () => {
  for (const p of PERMISSIONS) assert.ok(PERMISSION_SET.has(p));
  assert.equal(PERMISSION_SET.size, PERMISSIONS.length, "PERMISSIONS 里有重复项");
});

/* ------------------------------------------------------------------ *
 * 默认拒绝：核心断言
 * ------------------------------------------------------------------ */

test("默认档下, 读剪贴板/发请求/动窗口/调后端 全部被拒", () => {
  const p = noPermissions();
  for (const method of ["readClipboard", "copyToClipboard", "hideMainWindow", "showMainWindow", "invoke"]) {
    assert.equal(isMethodPermitted(p, method), false, `${method} 默认不该可用`);
  }
  // 隐式档放行
  for (const method of ["log", "notify", "storage.get", "storage.set", "storage.remove"]) {
    assert.equal(isMethodPermitted(p, method), true, `${method} 属隐式档, 应放行`);
  }
});

test("声明单条权限只放行单条, 不连坐", () => {
  // 只声明 http: 能发网络请求, 但动不了窗口、读不了剪贴板、调不了后端命令。
  const p = resolvePermissions({ permissions: ["http"] });
  assert.equal(permissionFor("invoke") && p.granted.has("invoke"), false, "invoke 不该被连坐放行");
  assert.equal(isMethodPermitted(p, "readClipboard"), false);
  assert.equal(isMethodPermitted(p, "hideMainWindow"), false);
  assert.equal(isMethodPermitted(p, "copyToClipboard"), false);
  // 而 invoke 本身要显式声明才有
  assert.equal(isMethodPermitted(p, "invoke"), false, "invoke 必须显式声明");
});

test("invoke 权限与 http 权限是叠加关系 —— 拿到 invoke 不代表能发网络请求", () => {
  const onlyInvoke = resolvePermissions({ permissions: ["invoke"] });
  assert.equal(isMethodPermitted(onlyInvoke, "invoke"), true, "invoke 本身已声明");
  assert.equal(
    isInvokePermitted(onlyInvoke, "http_request"),
    false,
    "唯一的白名单命令就是 http_request, 拿不到 http 就等于什么命令都调不了",
  );

  const onlyHttp = resolvePermissions({ permissions: ["http"] });
  assert.equal(
    isInvokePermitted(onlyHttp, "http_request"),
    false,
    "有 http 权限但没 invoke 权限, 依然调不了后端",
  );

  const both = resolvePermissions({ permissions: ["invoke", "http"] });
  assert.equal(isInvokePermitted(both, "http_request"), true);
});

test("未知方法不由权限层裁决（交白名单拒）", () => {
  // 分工: 白名单管"存在性", 权限管"授权"。
  // 权限层若对未知方法返回 false, 错误原因会误导成"权限不足"。
  assert.equal(isMethodPermitted(noPermissions(), "readFile"), true);
  assert.equal(permissionFor("readFile"), null);
});

/* ------------------------------------------------------------------ *
 * 与协议层串起来：权限判据必须在 parseRpc 里落地
 * ------------------------------------------------------------------ */

test("parseRpc：没声明权限的插件调 readClipboard, 包被丢", () => {
  const p = noPermissions();
  assert.equal(parseRpc(rpc({ method: "readClipboard" }), p), null);
  assert.equal(parseRpc(rpc({ method: "hideMainWindow" }), p), null);
  assert.equal(parseRpc(rpc({ method: "invoke", args: ["http_request", {}] }), p), null);
});

test("parseRpc：声明了权限才放行", () => {
  const p = resolvePermissions({ permissions: ["clipboard.read", "invoke", "http"] });
  assert.ok(parseRpc(rpc({ method: "readClipboard" }), p));
  assert.ok(parseRpc(rpc({ method: "invoke", args: ["http_request", {}] }), p));
});

test("parseRpc：权限层不能放宽白名单 —— 全开也不放行名单外方法", () => {
  const p = allPermissions();
  for (const m of ["readFile", "exec", "constructor.constructor"]) {
    assert.equal(parseRpc(rpc({ method: m }), p), null, `${m} 即便全开也不该放行`);
  }
});

test("parseRpc：漏传权限集必须响亮地炸, 绝不能当成全放行", () => {
  // 本仓 tsconfig 的 include 只有 src, 测试与脚本不受类型检查保护,
  // 所以这条"必填参数"的保护在运行期必须有对应守卫。
  assert.throws(
    () => parseRpc(rpc(), undefined as never),
    /缺少权限集/,
    "漏传 perms 必须抛错, 不能静默变成全放行",
  );
  assert.throws(() => parseRpc(rpc(), {} as never), /缺少权限集/);
});

/* ------------------------------------------------------------------ *
 * 拒绝要给出可执行的原因
 * ------------------------------------------------------------------ */

test("权限不足时报错要指明该补哪一条权限", () => {
  const p = noPermissions();
  const r = denialReason(p, "readClipboard");
  assert.ok(r.includes("clipboard.read"), "应点名要声明的权限: " + r);
  assert.ok(r.includes("plugin.json"), "应指明改哪个文件: " + r);

  assert.ok(denialReason(p, "invoke", "http_request").includes("invoke"));
});

test("对被权限拦下的包, permissionDenial 给出原因", () => {
  const p = noPermissions();
  const packet = rpc({ method: "readClipboard" });
  assert.equal(parseRpc(packet, p), null);
  assert.ok(permissionDenial(packet, p)?.includes("clipboard.read"));
});

test("对伪造/越权包, permissionDenial 返回 null —— 不给攻击者反馈", () => {
  // 这些包对攻击者同样是信号, 回话等于帮忙探测。
  const p = noPermissions();
  for (const bad of [
    { __zbiz: 2, id: "r1", method: "readClipboard", args: [] },
    { __zbiz: 1, id: "有中文", method: "readClipboard", args: [] },
    { __zbiz: 1, id: "r1", method: "readFile", args: [] },
    { __zbiz: 1, id: "r1", method: "constructor.constructor", args: [] },
    { __zbiz: 1, id: "r1", method: "invoke", args: ["read_file"] },
    null,
    "not-an-object",
  ]) {
    assert.equal(permissionDenial(bad, p), null, JSON.stringify(bad));
  }
});

test("超限包也必须静默 —— 回话既是信号, 也是资源放大", () => {
  // 方法本身确实没权限, 但这个包**结构上就是坏的**(超大 payload)。
  // 判据是"结构坏 ⇒ 静默", 不是"方法没权限 ⇒ 回话":
  // 否则攻击者可以用一个 256KB 的包换回一条确认消息, 顺便逼宿主做序列化。
  const p = noPermissions();
  const huge = {
    __zbiz: 1,
    id: "r1",
    method: "readClipboard",
    args: ["x".repeat(MAX_ARGS_BYTES + 1)],
  };
  assert.equal(permissionDenial(huge, p), null, "超限包必须静默丢弃");

  // 参数个数超限同理
  const tooMany = {
    __zbiz: 1,
    id: "r1",
    method: "readClipboard",
    args: new Array(MAX_ARGS_COUNT + 1).fill("x"),
  };
  assert.equal(permissionDenial(tooMany, p), null, "参数个数超限必须静默丢弃");
});

test("隐式档下调用隐式方法不会产生任何拒绝", () => {
  const p = noPermissions();
  for (const method of ["log", "notify", "storage.get", "storage.set", "storage.remove"]) {
    assert.equal(permissionDenial(rpc({ method, args: ["k"] }), p), null, `${method} 不该被拒`);
  }
});
