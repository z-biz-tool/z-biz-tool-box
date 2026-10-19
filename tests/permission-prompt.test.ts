// 敏感能力确认状态机的行为测试（台账 T2.6）。
// 跑法：node --experimental-strip-types --test tests/*.test.ts
//
// ## 判据的方向
//
// 这层最危险的失效有两种:
//  1. 该问的时候不问(静默放行敏感操作)
//  2. 问的范围太大(问一次就永久放行, 或者一个插件的授权顺带放行另一个)
// 所以断言集中在这两件事上。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPromptState,
  describePrompt,
  evaluatePrompt,
  isSensitiveMethod,
  promptKey,
  recordAnswer,
} from "../src/plugins/external/permission-prompt.ts";

/* ------------------------------------------------------------------ *
 * 哪些操作需要确认
 * ------------------------------------------------------------------ */

test("敏感方法只有两个: 读剪贴板 / invoke", () => {
  assert.equal(isSensitiveMethod("readClipboard"), true);
  assert.equal(isSensitiveMethod("invoke", "http_request"), true);
  assert.equal(isSensitiveMethod("invoke", "read_file"), false, "名单外的命令不走这条确认");
  assert.equal(isSensitiveMethod("invoke"), false, "invoke 本身不是敏感操作, 敏感的是它带的命令");
});

test("非敏感方法一律不问", () => {
  for (const m of ["log", "notify", "storage.get", "copyToClipboard", "hideMainWindow"]) {
    assert.equal(isSensitiveMethod(m), false, m);
  }
});

test("确认文案要说清风险, 不能是空话", () => {
  const d = describePrompt("readClipboard");
  assert.ok(d.includes("剪贴板"), d);
  const h = describePrompt("invoke", "http_request");
  assert.ok(h.includes("网络请求") || h.includes("内网"), h);
});

/* ------------------------------------------------------------------ *
 * 询问时机
 * ------------------------------------------------------------------ */

test("第一次调用 ⇒ 问", () => {
  const s = createPromptState();
  assert.equal(evaluatePrompt(s, "p1:readClipboard"), "ask");
});

test("允许 ⇒ 本次会话内不再问", () => {
  let s = createPromptState();
  const key = promptKey("p1", "readClipboard");
  s = recordAnswer(s, key, "allow");
  assert.equal(evaluatePrompt(s, key), "allow");
});

test("拒绝 ⇒ 本次会话内不再问, 且判为拒绝(插件拿到的是明确失败而不是无限弹窗)", () => {
  let s = createPromptState();
  const key = promptKey("p1", "readClipboard");
  s = recordAnswer(s, key, "deny");
  assert.equal(evaluatePrompt(s, key), "deny");
});

test("始终允许 ⇒ 跨会话放行(记进 always 集合)", () => {
  let s = createPromptState();
  const key = promptKey("p1", "readClipboard");
  s = recordAnswer(s, key, "always");
  assert.equal(evaluatePrompt(s, key), "allow");
  // 模拟"重启": 只保留 always 集合, 会话内的决定清空
  const afterRestart = { session: new Map(), always: s.always };
  assert.equal(evaluatePrompt(afterRestart, key), "allow", "始终允许必须跨会话有效");
});

test("普通「允许」不跨会话 —— 重启后要重新问", () => {
  let s = createPromptState();
  const key = promptKey("p1", "readClipboard");
  s = recordAnswer(s, key, "allow");
  const afterRestart = { session: new Map(), always: s.always };
  assert.equal(evaluatePrompt(afterRestart, key), "ask", "会话内的允许不该被当成永久授权");
});

test("始终允许 优先于 会话内的拒绝(先查 always, 顺序不能反)", () => {
  let s = createPromptState();
  const key = promptKey("p1", "readClipboard");
  s = recordAnswer(s, key, "always");
  s = recordAnswer(s, key, "deny");
  assert.equal(evaluatePrompt(s, key), "allow", "always 集合要先被查到");
});

/* ------------------------------------------------------------------ *
 * 作用域
 * ------------------------------------------------------------------ */

test("决定按插件隔离 —— A 插件的授权不放行 B 插件", () => {
  let s = createPromptState();
  const keyA = promptKey("pluginA", "readClipboard");
  const keyB = promptKey("pluginB", "readClipboard");
  s = recordAnswer(s, keyA, "always");
  assert.equal(evaluatePrompt(s, keyA), "allow");
  assert.equal(evaluatePrompt(s, keyB), "ask", "另一个插件必须重新问");
});

test("invoke 的确认按命令区分", () => {
  let s = createPromptState();
  const k1 = promptKey("p1", "invoke", "http_request");
  const k2 = promptKey("p1", "invoke", "other_cmd");
  s = recordAnswer(s, k1, "always");
  assert.equal(evaluatePrompt(s, k1), "allow");
  assert.equal(evaluatePrompt(s, k2), "ask");
});

test("key 的形状稳定, 不同方法不会撞车", () => {
  assert.equal(promptKey("p", "readClipboard"), "p:readClipboard");
  assert.equal(promptKey("p", "invoke", "http_request"), "p:invoke:http_request");
  assert.notEqual(promptKey("p", "readClipboard"), promptKey("p2", "readClipboard"));
});

/* ------------------------------------------------------------------ *
 * 不可变性
 * ------------------------------------------------------------------ */

test("recordAnswer 返回新状态, 不改旧对象", () => {
  const s0 = createPromptState();
  const s1 = recordAnswer(s0, "k", "allow");
  assert.equal(evaluatePrompt(s0, "k"), "ask", "旧状态不能被就地改掉");
  assert.equal(evaluatePrompt(s1, "k"), "allow");
});

test("记了始终允许之后, 会话内不留相反的决定", () => {
  let s = createPromptState();
  const key = "p:readClipboard";
  s = recordAnswer(s, key, "deny");
  s = recordAnswer(s, key, "always");
  assert.equal(s.session.has(key), false, "会话内那条 deny 应当被清掉");
  assert.equal(s.always.has(key), true);
});
