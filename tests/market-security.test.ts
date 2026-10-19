// 市场源 URL 安全策略的行为测试（台账 T1.6）。
// 跑法：node --experimental-strip-types --test tests/*.test.ts
//
// ## 判据的方向
//
// 核心是一条: **默认必须拒绝 http**。
// "默认允许但打个警告" 与 "默认拒绝、显式放行" 是两种完全不同的东西 ——
// 前者意味着每个用户都在明文源上, 只是被告知了一下。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInsecureMarketUrl,
  MarketUrlError,
  validateMarketUrl,
} from "../src/plugins/external/market-security.ts";

/* ------------------------------------------------------------------ *
 * 默认拒绝 http
 * ------------------------------------------------------------------ */

test("默认: http 源被拒, 且错误信息告诉用户去哪儿开开关", () => {
  assert.throws(
    () => validateMarketUrl("http://market.example.com/v1"),
    (e: unknown) => {
      assert.ok(e instanceof MarketUrlError, "必须是 MarketUrlError");
      assert.ok(e.message.includes("HTTPS"), e.message);
      assert.ok(e.message.includes("允许不安全市场源"), "要指明开关叫什么: " + e.message);
      return true;
    },
  );
});

test("默认: https 源通过, 且去掉末尾的斜杠", () => {
  assert.equal(validateMarketUrl("https://market.example.com/v1"), "https://market.example.com/v1");
  assert.equal(validateMarketUrl("https://market.example.com/v1/"), "https://market.example.com/v1");
  assert.equal(validateMarketUrl("  https://market.example.com/v1  "), "https://market.example.com/v1");
});

test("显式放行后: http 源才通过", () => {
  const url = validateMarketUrl("http://market.example.com/v1", { allowInsecure: true });
  assert.equal(url, "http://market.example.com/v1");
});

test("allowInsecure 必须显式为 true —— 传个 truthy 的假值也不行", () => {
  // 这条容易写错: `if (opts.allowInsecure)` 会让 undefined 之外的任何真值放行。
  // 这里要求**严格等于 true**, 免得"以后有人传了个字符串"就悄悄放开了。
  assert.throws(() => validateMarketUrl("http://x.example.com", { allowInsecure: undefined }));
  assert.throws(() => validateMarketUrl("http://x.example.com", {}));
});

test("allowInsecure 传 truthy 的非布尔值也必须被拒(严格真值检查)", () => {
  // 补这条是因为变异验证时发现: 判据只覆盖了 undefined/{} 这两种 falsy,
  // 于是"把 === true 改成 Boolean(...)"这个变异**咬不住** ——
  // 两者在 falsy 上表现一样, 只有 truthy 非 true 的输入才分得开。
  for (const v of [1, "yes", "true", {}, []]) {
    assert.throws(
      () => validateMarketUrl("http://x.example.com", { allowInsecure: v as never }),
      MarketUrlError,
      `allowInsecure=${JSON.stringify(v)} 必须被拒`,
    );
  }
  // 而真正的 true 仍然放行
  assert.equal(
    validateMarketUrl("http://x.example.com", { allowInsecure: true }),
    "http://x.example.com",
  );
});

test("非 http(s) 协议一律拒绝(放行 http 也不放行 file://)", () => {
  for (const bad of ["file:///etc/passwd", "data:text/html,<script>", "blob:https://x/y", "ftp://x/y", "javascript:alert(1)"]) {
    assert.throws(
      () => validateMarketUrl(bad, { allowInsecure: true }),
      MarketUrlError,
      bad,
    );
  }
});

test("空 URL / 非法 URL 抛的是 MarketUrlError, 不是别的异常", () => {
  assert.throws(() => validateMarketUrl(""), MarketUrlError);
  assert.throws(() => validateMarketUrl("   "), MarketUrlError);
  assert.throws(() => validateMarketUrl("not a url"), MarketUrlError);
});

/* ------------------------------------------------------------------ *
 * 不安全判定
 * ------------------------------------------------------------------ */

test("isInsecureMarketUrl: http 为真, https 为假", () => {
  assert.equal(isInsecureMarketUrl("http://x.example.com"), true);
  assert.equal(isInsecureMarketUrl("https://x.example.com"), false);
  assert.equal(isInsecureMarketUrl("  http://x.example.com  "), true);
});

test("isInsecureMarketUrl: 解析不出来时按不安全算(判不准就往严里判)", () => {
  assert.equal(isInsecureMarketUrl(""), true);
  assert.equal(isInsecureMarketUrl("garbage"), true);
  assert.equal(isInsecureMarketUrl("file:///x"), true);
});

test("localhost 的 http 也算不安全(不豁免)", () => {
  // 豁免 localhost 会让规则出现一个"看情况"的口子, 而豁免带来的便利
  // 与它引入的例外成本不成比例 —— 用户开一次开关就行。
  assert.equal(isInsecureMarketUrl("http://localhost:8080/market"), true);
  assert.equal(isInsecureMarketUrl("http://127.0.0.1:8080/market"), true);
});

/* ------------------------------------------------------------------ *
 * 错误类型的一致性
 * ------------------------------------------------------------------ */

test("MarketUrlError 的 name 字段正确(便于上层按类型判断)", () => {
  try {
    validateMarketUrl("http://x.example.com");
    assert.fail("应当抛错");
  } catch (e) {
    assert.ok(e instanceof Error);
    assert.equal((e as Error).name, "MarketUrlError");
  }
});
