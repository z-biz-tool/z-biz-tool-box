// uiStore 持久化迁移的行为测试（台账 T4.9）。
// 跑法：node --experimental-strip-types --test tests/*.test.ts
//
// ## 为什么迁移要被直接断言
//
// zustand 的 persist 默认是"存了什么读回什么"。新增字段在老用户身上是
// undefined 而不是默认值, 改语义的老数据又会被原样读回 ——
// 两种都不报错, 只是一直不对。迁移写错了, 症状是"某个用户那边一直是坏的",
// 而这种问题往往要等到有人投诉才发现。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  migrateUiState,
  UI_STORE_VERSION,
  UI_STORE_VERSION_V0,
} from "../src/stores/persistMigrate.ts";

/* ------------------------------------------------------------------ *
 * 基本行为
 * ------------------------------------------------------------------ */

test("v0(无 version 字段的老数据)⇒ 补齐新字段, 缺省一律 false", () => {
  const { state, version } = migrateUiState(
    { theme: "dark", starred: ["a"], inputs: { k: "v" } },
    UI_STORE_VERSION_V0,
  );
  assert.equal(version, UI_STORE_VERSION);
  assert.equal(state.theme, "dark", "老数据必须原样保留");
  assert.deepEqual(state.starred, ["a"]);
  assert.deepEqual(state.inputs, { k: "v" });
  assert.equal(state.allowInsecureCerts, false, "缺省必须是安全的一侧");
  assert.equal(state.allowInsecureSources, false);
});

test("缺省 false 是硬要求: 不能因为老用户没表态就替他同意", () => {
  // 反向断言: 如果实现写成 `rec.allowInsecureCerts ?? true`,
  // 这条会红。老用户没做过选择 ≠ 同意了不安全。
  const { state } = migrateUiState({}, UI_STORE_VERSION_V0);
  assert.equal(state.allowInsecureCerts, false);
  assert.equal(state.allowInsecureSources, false);
});

test("已经是当前版本 ⇒ 原样带回, 不改写", () => {
  const input = { theme: "light", allowInsecureCerts: true, allowInsecureSources: true };
  const { state, version } = migrateUiState(input, UI_STORE_VERSION);
  assert.equal(version, UI_STORE_VERSION);
  assert.equal(state.theme, "light");
  assert.equal(state.allowInsecureCerts, true, "用户开过的开关不能被迁移关掉");
  assert.equal(state.allowInsecureSources, true);
});

test("当前版本 + 脏值 ⇒ 也原样保留(不趁机改写)", () => {
  // 补这条是因为变异验证时发现: 判据只测了"当前版本 + 干净值",
  // 于是"把版本门槛去掉、让当前版本的数据也走迁移分支"这个变异**咬不住** ——
  // 干净值经迁移分支之后长得一样(布尔值仍是同一个布尔值)。
  // 真正分得开的是脏值: 迁移分支会把 `"yes"` 改写成 false, 而原样保留不会。
  const { state } = migrateUiState(
    { allowInsecureCerts: "yes", allowInsecureSources: 1 },
    UI_STORE_VERSION,
  );
  assert.equal(state.allowInsecureCerts, "yes", "当前版本的数据不该被迁移分支改写");
  assert.equal(state.allowInsecureSources, 1);
});

test("来自未来版本 ⇒ 原样保留, 不擅自改坏", () => {
  const { state, version } = migrateUiState({ theme: "dark", futureField: 1 }, 99);
  assert.equal(version, UI_STORE_VERSION);
  assert.equal(state.theme, "dark");
  assert.equal(state.futureField, 1, "不认识的字段不该被删");
});

test("老数据里已经写了开关 ⇒ 尊重它", () => {
  const { state } = migrateUiState(
    { allowInsecureCerts: true, allowInsecureSources: false },
    UI_STORE_VERSION_V0,
  );
  assert.equal(state.allowInsecureCerts, true);
  assert.equal(state.allowInsecureSources, false);
});

/* ------------------------------------------------------------------ *
 * 脏数据
 * ------------------------------------------------------------------ */

test("读回来的不是对象 ⇒ 不炸, 返回空 state", () => {
  for (const bad of [null, undefined, 42, "str", [1, 2]]) {
    const { state, version } = migrateUiState(bad, UI_STORE_VERSION_V0);
    assert.equal(version, UI_STORE_VERSION);
    assert.equal(typeof state, "object");
    assert.equal(state.allowInsecureCerts, false);
  }
});

test("开关字段是脏值(字符串/数字)⇒ 当成 false, 不当成真", () => {
  const { state } = migrateUiState(
    { allowInsecureCerts: "true", allowInsecureSources: 1 },
    UI_STORE_VERSION_V0,
  );
  assert.equal(state.allowInsecureCerts, false, "脏值不得被当成真");
  assert.equal(state.allowInsecureSources, false);
});

/* ------------------------------------------------------------------ *
 * 纯度
 * ------------------------------------------------------------------ */

test("迁移是纯函数: 同样的输入给同样的输出, 且不改原对象", () => {
  const input = { theme: "dark", starred: ["x"] };
  const a = migrateUiState(input, UI_STORE_VERSION_V0);
  const b = migrateUiState(input, UI_STORE_VERSION_V0);
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(input, { theme: "dark", starred: ["x"] }, "原对象不能被改");
});
