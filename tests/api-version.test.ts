// zBiz API 版本协商的行为测试（台账 T2.1 / T2.2）。
// 跑法：node --experimental-strip-types --test tests/*.test.ts
//
// ## 为什么版本协商要能被直接断言
//
// 宿主与外部插件是分别发布的。没有版本字段时, 唯一的兼容策略是"祈祷" ——
// 插件在旧宿主上静默拿不到新能力, 或者在新宿主上按旧语义调用而行为异常。
// 版本判据一旦写错(比如把"版本更大"写成"版本更小"), 后果是**所有插件被拒**
// 或**所有不兼容插件被放行**, 两种都很严重。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkApiCompatibility,
  DEFAULT_PLUGIN_API,
  HOST_API_VERSION,
  majorVersion,
  parsePluginApiVersion,
} from "../src/plugins/external/api-version.ts";
import {
  helloApiVersion,
  helloMessage,
  parseHello,
  readyMessage,
} from "../src/plugins/external/bridge-protocol.ts";

/* ------------------------------------------------------------------ *
 * 读版本
 * ------------------------------------------------------------------ */

test("manifest 没写 zbizApi ⇒ 按 1 处理(向后兼容)", () => {
  // 台账兼容条款: 「旧插件无 zbizApi 字段时视为 "1"」
  for (const m of [undefined, null, {}, { zbizApi: undefined }, { zbizApi: 123 }, { zbizApi: null }]) {
    assert.equal(parsePluginApiVersion(m), DEFAULT_PLUGIN_API, JSON.stringify(m));
  }
  assert.equal(DEFAULT_PLUGIN_API, "1");
});

test("manifest 写了 zbizApi ⇒ 原样取(去空白)", () => {
  assert.equal(parsePluginApiVersion({ zbizApi: "2" }), "2");
  assert.equal(parsePluginApiVersion({ zbizApi: " 2 " }), "2");
  assert.equal(parsePluginApiVersion({ zbizApi: "1.3" }), "1.3");
  // 写坏的值(非字符串)退回缺省, 而不是抛错 —— 一个插件因为版本号写错就打不开,
  // 比让它按旧协议跑更糟。
  assert.equal(parsePluginApiVersion({ zbizApi: {} }), DEFAULT_PLUGIN_API);
  assert.equal(parsePluginApiVersion({ zbizApi: true }), DEFAULT_PLUGIN_API);
});

test("主版本号解析: 只认开头的数字", () => {
  assert.equal(majorVersion("1"), 1);
  assert.equal(majorVersion("2"), 2);
  assert.equal(majorVersion("1.9"), 1);
  assert.equal(majorVersion("v3"), 3);
  assert.equal(majorVersion("2-beta"), 2);
  assert.equal(majorVersion("abc"), null);
  assert.equal(majorVersion(""), null);
  assert.equal(majorVersion("-1"), null);
});

/* ------------------------------------------------------------------ *
 * 兼容裁决
 * ------------------------------------------------------------------ */

test("同代 ⇒ 放行", () => {
  const r = checkApiCompatibility(HOST_API_VERSION);
  assert.equal(r.ok, true, r.reason);
});

test("插件要求的主版本比宿主新 ⇒ 拒绝, 并说清该升级宿主", () => {
  const r = checkApiCompatibility("99");
  assert.equal(r.ok, false);
  assert.ok(r.reason!.includes("99"), "理由里要有版本号: " + r.reason);
  assert.ok(r.reason!.includes("升级"), "理由要可执行: " + r.reason);
});

test("同代的小版本差异 ⇒ 放行(协议版本是世代, 不是发行版本)", () => {
  assert.equal(checkApiCompatibility("1").ok, true);
  assert.equal(checkApiCompatibility("1.0").ok, true);
  assert.equal(checkApiCompatibility("1.99").ok, true);
});

test("解析不出主版本号 ⇒ 拒绝, 不放行", () => {
  // 关键: 放行等于让未知的协议形态进来。宁可拒绝。
  const r = checkApiCompatibility("banana");
  assert.equal(r.ok, false);
  assert.ok(r.reason!.includes("banana"));
});

test("裁决结果总是带 pluginApi, 便于排查时对照", () => {
  assert.equal(checkApiCompatibility("1").pluginApi, "1");
  assert.equal(checkApiCompatibility("  7 ").pluginApi, "7");
  assert.equal(checkApiCompatibility("").pluginApi, DEFAULT_PLUGIN_API);
});

/* ------------------------------------------------------------------ *
 * 握手包
 * ------------------------------------------------------------------ */

test("hello 带 apiVersion; 老插件不带也认(缺省 1)", () => {
  const h = helloMessage("2");
  assert.equal(h.__zbiz_hello, 1);
  assert.equal(h.apiVersion, "2");
  assert.equal(helloMessage().apiVersion, DEFAULT_PLUGIN_API);
});

test("parseHello 仍然只认 {__zbiz_hello:1}(不因多了字段而放松)", () => {
  assert.equal(parseHello({ __zbiz_hello: 1 }), true);
  assert.equal(parseHello({ __zbiz_hello: 1, apiVersion: "2" }), true);
  assert.equal(parseHello({ __zbiz_hello: "1" }), false);
  assert.equal(parseHello(null), false);
  assert.equal(parseHello([]), false);
});

test("从握手包里读插件版本; 读不到返回 null(不是抛错)", () => {
  assert.equal(helloApiVersion({ __zbiz_hello: 1, apiVersion: "2" }), "2");
  assert.equal(helloApiVersion({ __zbiz_hello: 1, apiVersion: " 3 " }), "3");
  assert.equal(helloApiVersion({ __zbiz_hello: 1 }), null, "老插件不带版本");
  assert.equal(helloApiVersion({ __zbiz_hello: 1, apiVersion: 5 }), null);
  assert.equal(helloApiVersion({ __zbiz_hello: 1, apiVersion: "" }), null);
  assert.equal(helloApiVersion(null), null);
  assert.equal(helloApiVersion({ __zbiz_hello: 2, apiVersion: "2" }), null, "不是握手包就不读");
});

test("ready 回带 hostApiVersion 与 granted(插件能自查拿到了什么)", () => {
  const r = readyMessage("com.x.y", "1", ["log", "storage", "http"]);
  assert.equal(r.__zbiz_ready, 1);
  assert.equal(r.pluginId, "com.x.y");
  assert.equal(r.hostApiVersion, HOST_API_VERSION);
  assert.deepEqual(r.granted, ["log", "storage", "http"]);
});

test("ready 的默认参数不破坏既有调用(旧代码只传 pluginId 也要能用)", () => {
  const r = readyMessage("a.b");
  assert.equal(r.pluginId, "a.b");
  assert.equal(r.hostApiVersion, HOST_API_VERSION);
  assert.deepEqual(r.granted, []);
});
