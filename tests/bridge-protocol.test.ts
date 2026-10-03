// 外部插件沙箱桥接协议的安全回归（无 React、无 DOM）。
// 跑法：node --experimental-strip-types --test tests/*.test.ts
//
// 这个文件测的是**安全边界**，写法与其它测试不同：主体是**攻击用例**。
// 插件 main.html 是不可信代码（iframe 沙箱、不透明源），它能主动往宿主发
// postMessage。parseRpc 是唯一入口 —— 这里放过去一个包，等于放过去一个能力。
// 所以断言的方向是「这些包必须被丢成 null」，而不是「这些包应该解析成功」。
//
// 每条用例都对应文件头信任模型里的一句承诺。改动这块时，这些用例就是那份承诺的回归。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_INVOKE_COMMANDS,
  ALLOWED_METHODS,
  HOST_REPLY_TARGET_ORIGIN,
  MAX_ARGS_BYTES,
  MAX_ARGS_COUNT,
  MAX_ARGS_DEPTH,
  PLUGIN_SANDBOX,
  createBudget,
  dispatchBridgeMethod,
  isAllowedMethod,
  parseHello,
  parseRpc,
  responseMessage,
} from "../src/plugins/external/bridge-protocol.ts";

const ok = (over: Partial<{ id: string; method: string; args: unknown[] }> = {}) => ({
  __zbiz: 1,
  id: "r1",
  method: "notify",
  args: ["hi"],
  ...over,
});

/* ------------------------------------------------------------------ *
 * 沙箱配置本身
 * ------------------------------------------------------------------ */

test("PLUGIN_SANDBOX 绝不能含 allow-same-origin（含了就等于给了同源）", () => {
  // 这是整个信任模型的根：给了 allow-same-origin，插件就能读到 asset:// 私有域
  // 和宿主 cookie，整条"不透明源"论证当场失效。
  assert.ok(
    !/(^|\s)allow-same-origin(\s|$)/.test(PLUGIN_SANDBOX),
    `沙箱里出现了 allow-same-origin: "${PLUGIN_SANDBOX}"`,
  );
  assert.ok(PLUGIN_SANDBOX.includes("allow-scripts"), "仍需保留 allow-scripts，插件才有 JS 运行时");
});

test("回复只能用 targetOrigin='*'（不透明源下具体 origin 会被浏览器丢弃）", () => {
  assert.equal(HOST_REPLY_TARGET_ORIGIN, "*");
});

test("白名单不含 fs / shell / 任意 invoke / 原型链相关方法", () => {
  for (const banned of ["readFile", "writeFile", "exec", "eval", "require"]) {
    assert.ok(
      !(ALLOWED_METHODS as readonly string[]).includes(banned),
      `白名单里出现了 ${banned}`,
    );
  }
  // 白名单里恰好一个 invoke，且它的目标命令另有单独名单
  const invokes = ALLOWED_METHODS.filter((m) => m === "invoke");
  assert.equal(invokes.length, 1);
  assert.deepEqual([...ALLOWED_INVOKE_COMMANDS], ["http_request"], "invoke 的命令白名单应只有 http_request");
});

/* ------------------------------------------------------------------ *
 * 握手
 * ------------------------------------------------------------------ */

test("parseHello 只认 {__zbiz_hello:1}，其余一律 false", () => {
  assert.equal(parseHello({ __zbiz_hello: 1 }), true);
  // 插件不可信 —— 这些"看起来像"的包都必须被拒
  assert.equal(parseHello({ __zbiz_hello: "1" }), false, "字符串 '1' 不等于数字 1");
  assert.equal(parseHello({ __zbiz_hello: 1, evil: 1 }), true, "多余字段不影响握手判定");
  assert.equal(parseHello({}), false);
  assert.equal(parseHello(null), false);
  assert.equal(parseHello(undefined), false);
  assert.equal(parseHello([{ __zbiz_hello: 1 }]), false, "数组不是握手包");
  assert.equal(parseHello("__zbiz_hello"), false);
  assert.equal(parseHello(1), false);
});

/* ------------------------------------------------------------------ *
 * RPC 解析：合法包
 * ------------------------------------------------------------------ */

test("parseRpc：结构合法的包能解析出来", () => {
  const r = parseRpc(ok());
  assert.ok(r, "合法包不该被丢");
  assert.equal(r.id, "r1");
  assert.equal(r.method, "notify");
});

test("parseRpc：id 允许字母数字下划线连字符，1~64 位", () => {
  assert.ok(parseRpc(ok({ id: "a" })), "1 位应允许");
  assert.ok(parseRpc(ok({ id: "A-b_9" })));
  assert.ok(parseRpc(ok({ id: "x".repeat(64) })), "64 位应允许");
  assert.equal(parseRpc(ok({ id: "x".repeat(65) })), null, "65 位超限");
  assert.equal(parseRpc(ok({ id: "" })), null);
  assert.equal(parseRpc(ok({ id: "有中文" })), null);
  assert.equal(parseRpc(ok({ id: "a b" })), null);
  assert.equal(parseRpc(ok({ id: 1 as unknown as string })), null, "非字符串 id");
  assert.equal(parseRpc(ok({ id: null as unknown as string })), null);
});

test("parseRpc：invoke 的合法命令放行", () => {
  assert.ok(parseRpc(ok({ method: "invoke", args: ["http_request", {}] })));
});

/* ------------------------------------------------------------------ *
 * RPC 解析：攻击用例 —— 这些必须被丢成 null
 * ------------------------------------------------------------------ */

test("攻击：取道宿主 global 的原型链路径必须被丢", () => {
  // 文件头承诺："不做属性遍历，constructor.constructor 之类被彻底堵死"。
  assert.equal(parseRpc(ok({ method: "constructor" as string })), null);
  assert.equal(parseRpc(ok({ method: "__proto__" as string })), null);
  assert.equal(parseRpc(ok({ method: "constructor.constructor" as string })), null);
  assert.equal(parseRpc(ok({ method: "toString" as string })), null);
  assert.equal(parseRpc(ok({ method: "valueOf" as string })), null);
});

test("攻击：白名单外的任何方法必须被丢", () => {
  for (const m of ["readFile", "exec", "eval", "storage.list", "Notify", "notify ", "notify\n"]) {
    assert.equal(parseRpc(ok({ method: m })), null, `${m} 不该被放行`);
  }
});

test("攻击：invoke 传白名单外的 Tauri 命令必须被丢", () => {
  // 这是最危险的一条：invoke 能直通 Tauri 命令，名单外就等于给了后端全权。
  for (const cmd of ["read_file", "fs_read", "plugin:shell|exec", "__proto__", ""]) {
    assert.equal(
      parseRpc(ok({ method: "invoke", args: [cmd] })),
      null,
      `invoke ${JSON.stringify(cmd)} 不该被放行`,
    );
  }
});

test("攻击：协议标记不是 1 的包必须被丢", () => {
  assert.equal(parseRpc({ ...ok(), __zbiz: "1" }), null);
  assert.equal(parseRpc({ ...ok(), __zbiz: 2 }), null);
  const noMark = ok() as Record<string, unknown>;
  delete noMark.__zbiz;
  assert.equal(parseRpc(noMark), null);
});

test("攻击：非对象 / 数组 / 原始值必须被丢", () => {
  for (const v of [null, undefined, 1, "notify", true, [], [{ __zbiz: 1 }]]) {
    assert.equal(parseRpc(v), null, `${JSON.stringify(v) ?? String(v)} 不该被放行`);
  }
});

test("攻击：args 超过数量上限必须被丢", () => {
  assert.ok(parseRpc(ok({ args: new Array(MAX_ARGS_COUNT).fill("x") })), "正好等于上限应放行");
  assert.equal(
    parseRpc(ok({ args: new Array(MAX_ARGS_COUNT + 1).fill("x") })),
    null,
    "超出一条就该丢",
  );
  assert.equal(parseRpc(ok({ args: "notarray" as unknown as unknown[] })), null);
  assert.equal(parseRpc(ok({ args: {} as unknown as unknown[] })), null);
});

test("攻击：超深嵌套必须被丢（防插件用嵌套 payload 拖垮宿主）", () => {
  const deep = (n: number): unknown => {
    let v: unknown = "leaf";
    for (let i = 0; i < n; i++) v = { a: v };
    return v;
  };
  assert.ok(parseRpc(ok({ args: [deep(MAX_ARGS_DEPTH)] })), "深度等于上限应放行");
  assert.equal(parseRpc(ok({ args: [deep(MAX_ARGS_DEPTH + 5)] })), null, "超深必须丢");
});

test("攻击：超大字符串必须被丢（注意两种上限量的不是同一个东西）", () => {
  // 这里有个容易踩的细节：MAX_ARGS_BYTES 同时被两处使用，但量的维度不同 ——
  //   fitsLimits        量**原始字符串**长度
  //   withinByteBudget  量 **JSON.stringify(args)** 的长度（含引号/逗号/方括号）
  // 所以 args=["x"*N] 的实际上限是 N + 4 <= MAX_ARGS_BYTES，不是 N <= MAX_ARGS_BYTES。
  // 实测二分出来的真实边界是 MAX_ARGS_BYTES - 4。这条用例把边界两侧都钉住，
  // 免得哪天有人"简化"掉其中一个检查，放进来一个巨型 payload。
  const cap = MAX_ARGS_BYTES;
  assert.ok(cap > 4);
  assert.ok(
    parseRpc(ok({ args: ["x".repeat(cap - 4)] })),
    "cap-4 个 x 时 JSON.stringify 恰好等于预算上限，应放行",
  );
  assert.equal(
    parseRpc(ok({ args: ["x".repeat(cap - 3)] })),
    null,
    "再多一个字符就超预算，必须丢",
  );
  assert.equal(parseRpc(ok({ args: ["x".repeat(cap + 1)] })), null);
});

test("攻击：循环引用必须被丢而不是抛异常", () => {
  // withinByteBudget 里 JSON.stringify 循环引用会抛，实现用 catch 兜成 false。
  // 这里验证"兜住了"而不是"炸了宿主"。
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(parseRpc(ok({ args: [cyclic] })), null);
});

test("攻击：函数 / symbol 这类不可序列化值必须被丢", () => {
  assert.equal(parseRpc(ok({ args: [() => 1] })), null, "函数不该被放行");
  assert.equal(parseRpc(ok({ args: [Symbol("s")] })), null, "symbol 不该被放行");
});

/* ------------------------------------------------------------------ *
 * 配额（令牌桶）
 * ------------------------------------------------------------------ */

test("createBudget：突发额度用完后必须拒绝", () => {
  const take = createBudget(3, 1);
  assert.equal(take(), true);
  assert.equal(take(), true);
  assert.equal(take(), true);
  assert.equal(take(), false, "第 4 次应被拒");
});

test("createBudget：令牌不会超过 burst 上限（高频调用也不该溢出）", () => {
  // 第一版这里用 refill=1000 然后 while(take()) 循环数次数，结果不稳定 ——
  // 回填率 1000/s 意味着每毫秒就补一个令牌，紧循环能连着成功很多次，
  // 断言 "成功次数 <= 2" 本身就是错的。
  // 换成 refill=0 的确定性场景：要测的是"桶不会超过 burst"这个不变量。
  const burst = 5;
  const take = createBudget(burst, 0);
  let granted = 0;
  for (let i = 0; i < 100; i++) if (take()) granted++;
  assert.equal(granted, burst, `refill=0 时应恰好只放行 burst=${burst} 次，实际 ${granted}`);
});

test("createBudget：高回填率下突发额度照样按 burst 计，不多给", () => {
  // 这条只断言**不依赖时钟**的部分：burst=3 就只放行 3 次。
  // 时钟相关的"多久回填一个令牌"刻意不在这里断言 —— 回填依赖真实耗时，
  // 写成断言必然是条时好时坏的用例。
  const burst = 3;
  const take = createBudget(burst, 1000);
  let granted = 0;
  for (let i = 0; i < burst; i++) if (take()) granted++;
  assert.equal(granted, burst, "突发额度应恰好放行 burst 次");
});

test("createBudget：默认参数可用（不是必须显式传参）", () => {
  const take = createBudget();
  assert.equal(take(), true);
});

/* ------------------------------------------------------------------ *
 * 分发层：参数在此收敛，插件传什么都拿不到额外能力
 * ------------------------------------------------------------------ */

test("dispatchBridgeMethod：参数被显式收敛，插件传对象也只当字符串", () => {
  const calls: unknown[][] = [];
  const api = new Proxy(
    {},
    {
      get: (_t, prop) => (...args: unknown[]) => {
        calls.push([prop, ...args]);
        return `${String(prop)}-result`;
      },
    },
  ) as never;

  // 插件想传对象骗宿主当结构用 —— 实现里 str() 会把它变成字符串
  dispatchBridgeMethod(api, "notify", [{ toString: () => "spoofed" }]);
  assert.equal(calls[0][0], "notify");
  assert.equal(typeof calls[0][1], "string", "msg 应被 str() 收敛成字符串");
});

test("dispatchBridgeMethod：storage 三件套分别打到对应 API", () => {
  const seen: string[] = [];
  // 注意这里必须是**两层**代理：api.storage.get 是两跳。
  // 第一版用单层 Proxy，api.storage 拿到的是一个函数，再取 .get 就是 undefined ——
  // 代理形状没搭对，测的不是被测代码。
  const storage = new Proxy(
    {},
    {
      get: (_t, prop) => (...args: unknown[]) => {
        seen.push(`storage.${String(prop)}(${args.length})`);
        return null;
      },
    },
  );
  const api = new Proxy(
    { storage },
    {
      get: (t, prop) => {
        if (prop in t) return (t as Record<string, unknown>)[prop as string];
        return (...args: unknown[]) => {
          seen.push(`${String(prop)}(${args.length})`);
          return null;
        };
      },
    },
  ) as never;

  dispatchBridgeMethod(api, "storage.get", ["k"]);
  dispatchBridgeMethod(api, "storage.set", ["k", "v"]);
  dispatchBridgeMethod(api, "storage.remove", ["k"]);
  assert.deepEqual(seen, ["storage.get(1)", "storage.set(2)", "storage.remove(1)"]);
});

test("responseMessage：有 error 时不带 result，反之亦然", () => {
  const okR = responseMessage("r1", { a: 1 });
  assert.equal(okR.id, "r1");
  assert.ok("result" in okR);
  assert.ok(!("error" in okR));

  const errR = responseMessage("r1", undefined, "boom");
  assert.ok("error" in errR);
  assert.ok(!("result" in errR), "出错时不该同时带 result，避免宿主误取");
});

test("isAllowedMethod：类型守卫行为正确", () => {
  assert.equal(isAllowedMethod("notify"), true);
  assert.equal(isAllowedMethod("readFile"), false);
  assert.equal(isAllowedMethod(""), false);
});
