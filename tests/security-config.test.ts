// 安全配置的静态契约测试（台账 T1.3 / T2.7）。
// 跑法：node --experimental-strip-types --test tests/*.test.ts
//
// ## 为什么配置文件要测
//
// CSP 与 capability 是**声明式**的: 它们不写代码, 但决定了代码能做什么。
// 于是"改坏了"不会有编译错误、不会有测试失败, 只会在运行时表现成
// "某个功能莫名其妙不工作"或者"某个防护莫名其妙没了"。
//
// 静态契约测试把这两份文件钉住: 关键指令必须存在, 且关键项不能被放宽。
// 它替代不了实机验证(见 08 实施记录里的"未实测项"), 但能挡住
// "有人顺手把 csp 改回 null"这种回退 —— 那是本仓历史上真实发生过的形态。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

const tauriConf = JSON.parse(
  readFileSync(join(repo, "src-tauri/tauri.conf.json"), "utf-8"),
) as {
  app: {
    security: {
      csp: string | null;
      devCsp?: string | null;
      assetProtocol?: { enable: boolean; scope: string[] };
    };
  };
};

const capabilities = JSON.parse(
  readFileSync(join(repo, "src-tauri/capabilities/default.json"), "utf-8"),
) as { permissions: unknown[] };

/** 把 CSP 串拆成 "指令 → 源列表" */
function parseCsp(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [directive, ...sources] = part.split(/\s+/);
    map.set(directive, sources);
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * CSP 存在且不是空
 * ------------------------------------------------------------------ */

test("tauri.conf.json 里 CSP 不为 null(曾经就是 null —— 那是没落地)", () => {
  assert.ok(tauriConf.app.security.csp, "csp 不得为 null/空");
  assert.equal(typeof tauriConf.app.security.csp, "string");
});

test("CSP 至少有 default-src, 且不是 * 通配", () => {
  const csp = tauriConf.app.security.csp!;
  const d = parseCsp(csp);
  assert.ok(d.has("default-src"), "缺 default-src: " + csp);
  const def = d.get("default-src")!;
  assert.ok(!def.includes("*"), "default-src 不得是 *: " + def);
  assert.ok(def.includes("'self'"), "default-src 应收紧到 'self': " + def);
});

test("object-src 必须是 'none'(不许加载插件/flash 类对象)", () => {
  const d = parseCsp(tauriConf.app.security.csp!);
  assert.deepEqual(d.get("object-src"), ["'none'"], "object-src 必须是 'none'");
});

test("base-uri 与 form-action 收紧(防注入/钓鱼)", () => {
  const d = parseCsp(tauriConf.app.security.csp!);
  assert.deepEqual(d.get("base-uri"), ["'self'"]);
  assert.deepEqual(d.get("form-action"), ["'none'"]);
});

/* ------------------------------------------------------------------ *
 * script-src: 生产不许有 unsafe-*
 * ------------------------------------------------------------------ */

test("生产 CSP 的 script-src 不许放宽(不得含 unsafe-inline/unsafe-eval)", () => {
  const d = parseCsp(tauriConf.app.security.csp!);
  const s = d.get("script-src");
  assert.ok(s, "缺 script-src");
  assert.ok(!s.includes("'unsafe-inline'"), "生产 CSP 不得允许 inline script: " + s);
  assert.ok(!s.includes("'unsafe-eval'"), "生产 CSP 不得允许 eval: " + s);
  assert.ok(!s.includes("*"), "script-src 不得是 *: " + s);
});

test("开发 CSP 可以放宽(antd 注入 style / vite HMR 需要), 但必须存在", () => {
  // devCsp 存在本身就是价值: 之前只有一条 csp, 加了就会把开发环境搞挂。
  const dev = tauriConf.app.security.devCsp;
  assert.ok(dev, "必须有 devCsp, 否则生产 CSP 会把 vite dev 弄坏");
  const d = parseCsp(dev!);
  const s = d.get("script-src") ?? [];
  assert.ok(s.includes("'unsafe-inline'"), "devCsp 需允许 inline script(vite react-refresh 注入)");
  assert.ok(
    (d.get("connect-src") ?? []).some((x) => x.includes("localhost:5173")),
    "devCsp 需放行 vite dev server 与 HMR websocket",
  );
});

/* ------------------------------------------------------------------ *
 * connect-src: T2.7 —— 收敛到已知域名
 * ------------------------------------------------------------------ */

test("connect-src 不得是宽泛通配(不得含 https: 或 *)", () => {
  const d = parseCsp(tauriConf.app.security.csp!);
  const c = d.get("connect-src");
  assert.ok(c, "缺 connect-src");
  assert.ok(!c.includes("*"), "connect-src 不得是 *: " + c);
  assert.ok(!c.includes("https:"), "connect-src 不得放行任意 https: " + c);
});

test("connect-src 包含应用自身与 IPC", () => {
  const d = parseCsp(tauriConf.app.security.csp!);
  const c = d.get("connect-src")!;
  assert.ok(c.includes("'self'"), "要能连自己: " + c);
  assert.ok(
    c.includes("ipc:") || c.includes("http://ipc.localhost"),
    "要能走 Tauri IPC: " + c,
  );
});

test("connect-src 里出现的远端域名是有限且已知的(只允许汇率 API)", () => {
  const d = parseCsp(tauriConf.app.security.csp!);
  const c = d.get("connect-src")!;
  const remote = c.filter((x) => x.includes("://") && !x.includes("ipc.localhost"));
  // 逐个列出: 新增远端域名时这条会提醒你更新断言(而不是悄悄放行)
  assert.deepEqual(remote, ["https://open.er-api.com"], "远端域名清单变了, 请确认是有意的");
});

/* ------------------------------------------------------------------ *
 * frame-src / img-src: 插件 iframe 与市场图标
 * ------------------------------------------------------------------ */

test("frame-src 放行 asset 协议(外部插件 iframe 靠它加载)", () => {
  const d = parseCsp(tauriConf.app.security.csp!);
  const f = d.get("frame-src") ?? [];
  assert.ok(
    f.some((x) => x === "asset:" || x.includes("asset.localhost")),
    "frame-src 要放行 asset 协议: " + f,
  );
});

test("img-src 放行 data:/blob:/asset(内联图、截图、插件图标)", () => {
  const d = parseCsp(tauriConf.app.security.csp!);
  const i = d.get("img-src") ?? [];
  for (const need of ["data:", "blob:"]) {
    assert.ok(i.includes(need), `img-src 缺 ${need}: ` + i);
  }
  assert.ok(
    i.some((x) => x === "asset:" || x.includes("asset.localhost")),
    "img-src 要放行 asset 协议(插件 logo): " + i,
  );
});

/* ------------------------------------------------------------------ *
 * assetProtocol scope
 * ------------------------------------------------------------------ */

test("asset 协议只开在 ~/.z-biz-tools 下", () => {
  const ap = tauriConf.app.security.assetProtocol;
  assert.ok(ap?.enable, "asset 协议应当开启(插件 main.html 靠它加载)");
  assert.deepEqual(ap!.scope, ["$HOME/.z-biz-tools/**"]);
});

/* ------------------------------------------------------------------ *
 * Tauri http capability
 * ------------------------------------------------------------------ */

test("http capability 放行了 http 与 https(Rust 侧走 http 插件, 不受 CSP 约束)", () => {
  const http = capabilities.permissions.find(
    (p) => typeof p === "object" && p !== null && (p as { identifier?: string }).identifier === "http:default",
  ) as { allow?: Array<{ url: string }> } | undefined;
  assert.ok(http, "capabilities 里应有 http:default");
  const urls = http!.allow!.map((a) => a.url);
  assert.ok(urls.some((u) => u.startsWith("https://")), "要放行 https 市场源: " + urls);
  assert.ok(urls.some((u) => u.startsWith("http://")), "要放行 http 市场源(T1.6 的显式开关才有意义): " + urls);
});
