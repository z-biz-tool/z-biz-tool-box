import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBrotherKey, resolveTrayToolKey } from "../src/trayEvents.ts";

const KEYS = ["base64", "uuid", "json"];

test("合法 key 原样返回", () => {
  assert.equal(resolveTrayToolKey("base64", KEYS), "base64");
});

test("首尾空白被裁掉（Rust 侧拼字符串时常见）", () => {
  assert.equal(resolveTrayToolKey("  uuid  ", KEYS), "uuid");
});

test("空串 / 纯空白 ⇒ null（不路由到空视图）", () => {
  assert.equal(resolveTrayToolKey("", KEYS), null);
  assert.equal(resolveTrayToolKey("   ", KEYS), null);
});

test("非字符串载荷 ⇒ null（不抛、不猜）", () => {
  assert.equal(resolveTrayToolKey(undefined, KEYS), null);
  assert.equal(resolveTrayToolKey(null, KEYS), null);
  assert.equal(resolveTrayToolKey(42, KEYS), null);
  assert.equal(resolveTrayToolKey({ key: "base64" }, KEYS), null);
  assert.equal(resolveTrayToolKey(["base64"], KEYS), null);
});

test("注册表里不存在的 key ⇒ null（工具被删/被改名后托盘还留着旧菜单）", () => {
  assert.equal(resolveTrayToolKey("removed-tool", KEYS), null);
});

test("超长载荷 ⇒ null（异常来源，不做截断后路由）", () => {
  assert.equal(resolveTrayToolKey("x".repeat(201), ["x".repeat(201)]), null);
});

test("兄弟应用 key：只校验非空字符串（不在工具注册表里）", () => {
  assert.equal(resolveBrotherKey("math"), "math");
  assert.equal(resolveBrotherKey("  "), null);
  assert.equal(resolveBrotherKey(0), null);
  assert.equal(resolveBrotherKey("k".repeat(201)), null);
});
