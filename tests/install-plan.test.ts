// 安装前确认清单的行为测试（台账 T1.7）。
// 跑法：node --experimental-strip-types --test tests/*.test.ts
//
// ## 判据的方向
//
// 这份清单是**用户唯一一次**看清"这个插件要什么"的机会。所以断言不是
// "清单长什么样", 而是"**该出现的东西有没有漏掉**"。
// 漏掉一条权限, 用户点了确认, 装上的插件就多了一份他没看见的能力。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInstallPlan,
  describePermission,
} from "../src/plugins/external/install-plan.ts";
import type { MarketPluginEntry } from "../src/plugins/external/types.ts";

const entry = (over: Partial<MarketPluginEntry> = {}): MarketPluginEntry => ({
  id: "com.example.demo",
  name: "示例插件",
  description: "一个示例",
  version: "1.2.3",
  ...over,
});

const manifest = (over: Record<string, unknown> = {}) => ({
  id: "com.example.demo",
  name: "示例插件",
  description: "一个示例",
  version: "1.2.3",
  features: [{ code: "a", explain: "A" }],
  ...over,
});

/* ------------------------------------------------------------------ *
 * 必备信息一件都不能少
 * ------------------------------------------------------------------ */

test("清单必须含 台账要求的 5 项: 插件名/来源URL/版本/hash/权限", () => {
  const plan = buildInstallPlan({
    entry: entry(),
    manifest: manifest(),
    sourceUrl: "https://market.example.com/v1",
  });
  const labels = plan.lines.map((l) => l.label);
  assert.ok(labels.includes("插件名"), "缺插件名");
  assert.ok(labels.includes("来源 URL"), "缺来源 URL");
  assert.ok(labels.includes("版本"), "缺版本");
  assert.ok(labels.includes("完整性校验"), "缺 hash 情况");
  assert.ok(labels.includes("申请权限"), "缺权限清单");
});

test("来源 URL 原样出现在清单里(用户要能核对域名)", () => {
  const url = "https://market.example.com/v1";
  const plan = buildInstallPlan({ entry: entry(), manifest: manifest(), sourceUrl: url });
  const line = plan.lines.find((l) => l.label === "来源 URL");
  assert.ok(line);
  assert.equal(line.value, url);
});

/* ------------------------------------------------------------------ *
 * 权限清单
 * ------------------------------------------------------------------ */

test("权限清单来自 manifest, 且一条都不许漏", () => {
  const perms = ["clipboard.read", "http", "invoke", "storage", "log"];
  const plan = buildInstallPlan({
    entry: entry(),
    manifest: manifest({ permissions: perms }),
    sourceUrl: "https://m.example.com",
  });
  assert.deepEqual(plan.permissions, [...perms].sort(), "权限一条都不能少");
  // 每条权限都要有人话说明, 不能只给一个裸名字
  for (const p of perms) {
    const line = plan.lines.find((l) => l.label === "申请权限")!;
    assert.ok(line.value.includes(p), `权限 ${p} 没出现在清单里`);
  }
});

test("敏感权限要单独标出来(用户重点看这几条)", () => {
  const plan = buildInstallPlan({
    entry: entry(),
    manifest: manifest({ permissions: ["log", "clipboard.read", "http"] }),
    sourceUrl: "https://m.example.com",
  });
  assert.deepEqual(plan.sensitivePermissions, ["clipboard.read", "http"]);
  assert.ok(
    plan.warnings.some((w) => w.includes("clipboard.read")),
    "敏感权限必须在警告里点名: " + JSON.stringify(plan.warnings),
  );
});

test("manifest 没写 permissions ⇒ 空清单, 不是异常", () => {
  const plan = buildInstallPlan({
    entry: entry(),
    manifest: manifest(),
    sourceUrl: "https://m.example.com",
  });
  assert.deepEqual(plan.permissions, []);
  const line = plan.lines.find((l) => l.label === "申请权限")!;
  assert.ok(line.value.includes("（无）"), "空清单要明说: " + line.value);
});

test("permissions 写成非数组 ⇒ 当没声明(与 permissions.ts 的口径一致)", () => {
  for (const bad of ["http", 42, { http: true }]) {
    const plan = buildInstallPlan({
      entry: entry(),
      manifest: manifest({ permissions: bad }),
      sourceUrl: "https://m.example.com",
    });
    assert.deepEqual(plan.permissions, [], JSON.stringify(bad));
  }
});

test("重复权限去重, 且顺序稳定(便于用户两次对比)", () => {
  const plan = buildInstallPlan({
    entry: entry(),
    manifest: manifest({ permissions: ["http", "log", "http", " log "] }),
    sourceUrl: "https://m.example.com",
  });
  assert.deepEqual(plan.permissions, ["http", "log"]);
});

test("权限说明覆盖全部已知权限名", () => {
  for (const p of ["log", "notify", "storage", "clipboard.write", "clipboard.read", "window.control", "http", "invoke"]) {
    const d = describePermission(p);
    assert.ok(d.includes(p), `说明里要有权限名: ${d}`);
    assert.ok(d.length > p.length, `说明不能只是权限名: ${d}`);
  }
});

/* ------------------------------------------------------------------ *
 * 完整性校验的如实呈现
 * ------------------------------------------------------------------ */

test("市场源给了 sha256 ⇒ 清单要显示哈希(短形式)并标明是否已校验", () => {
  const sha = "a".repeat(64);
  const plan = buildInstallPlan({
    entry: entry({ sha256: sha }),
    manifest: manifest(),
    sourceUrl: "https://m.example.com",
    hashVerified: true,
  });
  const line = plan.lines.find((l) => l.label === "完整性校验")!;
  assert.ok(line.value.includes("已比对通过"), line.value);
  assert.ok(line.value.includes(sha.slice(0, 8)), "要能对上哈希: " + line.value);
  assert.equal(plan.hashVerified, true);
});

test("市场源没给 sha256 ⇒ 必须如实说「未校验」, 且给出警告(但不阻断)", () => {
  const plan = buildInstallPlan({
    entry: entry(),
    manifest: manifest(),
    sourceUrl: "https://m.example.com",
  });
  const line = plan.lines.find((l) => l.label === "完整性校验")!;
  assert.ok(line.value.includes("未提供"), line.value);
  assert.ok(line.value.includes("不做完整性校验"), line.value);
  assert.equal(plan.hashVerified, false);
  assert.ok(plan.warnings.some((w) => w.includes("SHA-256")), JSON.stringify(plan.warnings));
  assert.deepEqual(plan.blocking, [], "没有哈希是灰度降级条款, 不阻断");
});

/* ------------------------------------------------------------------ *
 * 风险提示
 * ------------------------------------------------------------------ */

test("http 明文源 ⇒ 红色警告", () => {
  const plan = buildInstallPlan({
    entry: entry(),
    manifest: manifest(),
    sourceUrl: "http://m.example.com",
    insecureSource: true,
  });
  assert.ok(
    plan.warnings.some((w) => w.includes("http") && w.includes("中间人")),
    JSON.stringify(plan.warnings),
  );
});

test("https 源 ⇒ 不产生明文警告", () => {
  const plan = buildInstallPlan({
    entry: entry(),
    manifest: manifest(),
    sourceUrl: "https://m.example.com",
  });
  assert.ok(!plan.warnings.some((w) => w.includes("明文")), JSON.stringify(plan.warnings));
});

/* ------------------------------------------------------------------ *
 * 缺字段时的兜底
 * ------------------------------------------------------------------ */

test("manifest 拿不到(还没下载) ⇒ 退回用市场条目的信息, 不炸", () => {
  const plan = buildInstallPlan({
    entry: entry(),
    manifest: null,
    sourceUrl: "https://m.example.com",
  });
  assert.equal(plan.name, "示例插件");
  assert.equal(plan.version, "1.2.3");
  assert.deepEqual(plan.permissions, []);
});

test("manifest 与市场条目对不上时, 清单用 manifest 的名字与版本(那才是真要装的东西)", () => {
  const plan = buildInstallPlan({
    entry: entry({ name: "市场里的旧名字", version: "1.0.0" }),
    manifest: manifest({ name: "真正的名字", version: "2.0.0" }),
    sourceUrl: "https://m.example.com",
  });
  assert.equal(plan.name, "真正的名字");
  assert.equal(plan.version, "2.0.0");
  assert.equal(plan.pluginId, "com.example.demo");
});
