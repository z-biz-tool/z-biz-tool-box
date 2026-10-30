/**
 * IPC 契约门（box 仓）：前后端命令 + 事件的对应关系。
 *
 * 跑法：node --experimental-strip-types --test tests/ipcContract.test.ts
 *
 * 2026-10-25 的起因（真 bug，不是假设）：
 *   Rust 侧 `register_tools` 的注释一直写着「前端 mount 时调用」，
 *   但前端**从来没调过** ⇒ tray 菜单里永远是 Rust 侧的占位组「加载中…」；
 *   而且 Rust 点菜单项会 `emit("select-tool", key)`，前端也**从没监听**
 *   ⇒ 就算菜单里有条目，点下去也不会切到对应工具。
 *   ⇒ **box 的菜单栏入口整条链是断的**，而两端都不报错。
 *
 * 这道门守四件事：
 * 1) 前端 invoke 的命令，后端必须真的注册了（点了必崩）；
 * 2) 插件桥层白名单里的命令，后端必须真的注册了
 *    （桥层是动态 invoke，命令名是变量 ⇒ 静态扫不到，只能按白名单核）；
 * 3) 后端注册的命令，**要么被前端调用，要么在「预留未接线」清单里写明理由**
 *    （不许有既没入口、也没登记的功能）；
 * 4) **Rust emit 的每个事件，前端必须 listen**
 *    —— 这一条才是抓住上面那个 P0 的门：Rust 发了 `select-tool`，
 *       前端没监听 ⇒ 事件发出去没人收 ⇒ 界面毫无反应。
 *
 * ⚠ 口径：只扫 `src/`（不含 tests/）与 `src-tauri/src/`。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  collectCmdConstants,
  collectSharedConsumedCommands,
} from "z-biz-tool-shared/testkit";
import { DEEPLINK_EVENT } from "z-biz-tool-shared/protocol";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(here, "..");

/* ────────────────────────── 后端 ────────────────────────── */

/** invoke_handler![] 里注册的命令名（去掉 `module::` 前缀） */
function registeredCommands(): Set<string> {
  const lib = readFileSync(path.join(repoRoot, "src-tauri/src/lib.rs"), "utf8");
  const m = /generate_handler!\s*\[/.exec(lib);
  assert.ok(m, "没找到 generate_handler![] ⇒ 解析器可能坏了");
  let i = m.index + m[0].length - 1;
  let depth = 0;
  for (; i < lib.length; i++) {
    if (lib[i] === "[") depth++;
    else if (lib[i] === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = lib.slice(m.index + m[0].length, i);
  const out = new Set<string>();
  for (const cm of body.matchAll(
    /([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:::|,|$)/gm
  )) {
    out.add(cm[1].split("::").pop()!);
  }
  return out;
}

/** Rust 侧 emit 的事件名（`app.emit("xxx", ...)`） */
function rustEmittedEvents(): Set<string> {
  const out = new Set<string>();
  for (const f of walk(path.join(repoRoot, "src-tauri/src"), [".rs"])) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\.emit\(\s*"([a-z][a-z0-9_-]*)"/g)) {
      out.add(m[1]);
    }
  }
  return out;
}

/* ────────────────────────── 前端 ────────────────────────── */

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (e === "node_modules" || e === "dist" || e === "tests") continue;
      out.push(...walk(p, exts));
    } else if (exts.some((x) => e.endsWith(x))) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 直接 invoke 后端命令的调用点：`invoke("x")` / `invoke<T>("x")` */
const DIRECT_INVOKE = /\binvoke(?:<[^>]*>)?\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g;
/**
 * 命令名是**常量**的调用点：`invoke(X)` / `invoke<T>(X)`。
 *
 * 前端把命令名提成常量（`ZBIZ_TAKE_PENDING`）是为了拼错能在编译期报错。
 * 只认字面量的扫描器会漏掉它 ⇒ 门禁把「已接线」误判成「没接线」。
 */
const DIRECT_INVOKE_CONST = /\binvoke(?:<[^>]*>)?\s*\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g;
/** 前端 listen 的事件名 */
const LISTEN_CALL = /\blisten(?:<[^>]*>)?\s*\(\s*["']([a-z][a-z0-9_-]*)["']/g;

const frontendFiles = walk(path.join(repoRoot, "src"), [".ts", ".tsx"]);

/** 命令名常量表（扫描器在共享层 testkit 里，各仓共用一份） */
const cmdConstants = collectCmdConstants(frontendFiles);

const directInvokes = new Set<string>();
const listenedEvents = new Set<string>();
for (const f of frontendFiles) {
  const src = stripComments(readFileSync(f, "utf8"));
  for (const m of src.matchAll(DIRECT_INVOKE)) directInvokes.add(m[1]);
  for (const m of src.matchAll(DIRECT_INVOKE_CONST)) {
    const resolved = cmdConstants.get(m[1]);
    if (resolved) directInvokes.add(resolved);
  }
  for (const m of src.matchAll(LISTEN_CALL)) listenedEvents.add(m[1]);
}

/**
 * 经由**共享层**消费的 Rust 命令。
 *
 * 深链接收侧改用共享层后，取队列的 invoke 发生在共享层内部，
 * 本仓源码扫不到那个调用点 ⇒ 门禁会误判「实现了却没人用」。
 * **门禁失灵比测试挂掉更严重**：误报久了大家就会把命令塞进预留清单。
 *
 * 判据与清单都在共享层 testkit 里 —— 不在本仓写私有副本（那份会漂移）。
 */
const sharedConsumed = collectSharedConsumedCommands(frontendFiles);

/** 插件桥层允许动态 invoke 的命令（命令名是变量 ⇒ 静态扫不到，只能读白名单） */
function bridgeAllowlist(): string[] {
  const p = path.join(repoRoot, "src/plugins/external/bridge-protocol.ts");
  const src = readFileSync(p, "utf8");
  const m = /ALLOWED_INVOKE_COMMANDS[^=]*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, "没找到 ALLOWED_INVOKE_COMMANDS ⇒ 桥层白名单可能改名了");
  return [...m[1].matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']/g)].map((x) => x[1]);
}

/* ────────────────────────── 预留未接线清单 ────────────────────────── */

/**
 * 刻意不做界面入口的命令，每条都要写明理由。
 * 清单不是豁免名单 —— 门禁会反过来检查它：接了就必须删掉。
 */
const RESERVED_NOT_WIRED = new Map<string, string>([
  [
    "get_state",
    "调试用的只读命令：返回主窗口的 visible/focused/minimized 状态字符串。" +
      "**刻意不接界面**：它返回的是一段拼接好的字符串，接到界面上只会变成" +
      "一个没人看的状态栏；真要排障，开发者用 DevTools 或直接看窗口更直接。" +
      "它是纯只读、零副作用 ⇒ 留着不构成风险（与 greet 那种脚手架示例不同，那个已删）。",
  ],
]);

/* ────────────────────────── 门禁 ────────────────────────── */

const registered = registeredCommands();
const allowlist = bridgeAllowlist();
const emitted = rustEmittedEvents();

test("量具本身有效（不是空跑）", () => {
  assert.ok(registered.size >= 8, `后端命令太少，解析器可能坏了: ${registered.size}`);
  assert.ok(directInvokes.size >= 5, `前端调用点太少，扫描范围可能不对: ${directInvokes.size}`);
  assert.ok(emitted.size >= 2, `Rust 事件太少，扫描范围可能不对: ${emitted.size}`);
  assert.ok(allowlist.length >= 1, `桥层白名单空了，解析器可能坏了`);
});

test("前端 invoke 的命令，后端必须真的注册了（点了必崩）", () => {
  const bad = [...directInvokes].filter((c) => !registered.has(c));
  assert.deepEqual(bad, [], `前端调了后端没注册的命令: ${bad.join(", ")}`);
});

test("插件桥层白名单里的命令，后端必须真的注册了", () => {
  const bad = allowlist.filter((c) => !registered.has(c));
  assert.deepEqual(bad, [], `桥层允许转发但后端没注册的命令: ${bad.join(", ")}`);
});

test("后端注册的命令，要么被前端调用，要么在「预留未接线」清单里写明理由", () => {
  // 共享层消费的也算「前端调用了」—— 见 sharedConsumed 的说明。
  const called = new Set<string>([...directInvokes, ...allowlist, ...sharedConsumed]);
  const unaccounted = [...registered].filter(
    (c) => !called.has(c) && !RESERVED_NOT_WIRED.has(c)
  );
  assert.deepEqual(
    unaccounted,
    [],
    `这些命令实现了、注册了，却既没有界面入口、也没登记为预留: ${unaccounted.join(", ")}`
  );
});

test("「预留未接线」清单：命令必须真的存在，且真的没被前端调用", () => {
  for (const [cmd, why] of RESERVED_NOT_WIRED) {
    assert.ok(why.length > 20, `${cmd} 的预留理由太短，等于没写`);
    assert.ok(registered.has(cmd), `${cmd} 后端已不存在 ⇒ 预留清单该删了`);
    assert.ok(!directInvokes.has(cmd), `${cmd} 已经被前端调用了 ⇒ 应从预留清单移除`);
    assert.ok(!sharedConsumed.has(cmd), `${cmd} 已经通过共享层被消费了 ⇒ 应从预留清单移除`);
  }
});

test("共享层消费的每个命令都必须真实存在于后端（共享层登记写错 ⇒ 运行时才炸）", () => {
  const bad = [...sharedConsumed].filter((c) => !registered.has(c));
  assert.deepEqual(bad, [], `共享层消费了后端不存在的命令: ${bad.join(", ")}`);
});

test("Rust emit 的每个事件，前端必须 listen（发了没人收 ⇒ 界面毫无反应）", () => {
  const bad = [...emitted].filter((e) => !listenedEvents.has(e));
  assert.deepEqual(
    bad,
    [],
    `Rust 发的事件前端没监听 ⇒ 事件发出去没有任何效果: ${bad.join(", ")}`
  );
});

test("共享层监听的事件名必须与 Rust 侧一致（cap-hub 改了事件名 ⇒ 静默失联）", () => {
  // `zbiz-open` 是 cap-hub 发的（不在本仓 Rust 源码里）⇒ 上面那道门扫不到它。
  // 这条把那类「事件由共享层/Rust 依赖仓发出」的情况显式钉住：
  // 事件名对不上时，box 就再也收不到深链信号，而且**没有任何报错**。
  assert.equal(DEEPLINK_EVENT, "zbiz-open", "共享层的事件名变了 ⇒ 需同步核对 cap-hub");
});

test("tray 工具链路是通的（这是本轮修的那个 P0，专门钉住）", () => {
  // Rust 侧：点菜单项 → emit("select-tool")
  assert.ok(emitted.has("select-tool"), "Rust 不再发 select-tool ⇒ 前端监听没意义");
  // 前端：监听它 + 真的把分组推给 Rust
  assert.ok(listenedEvents.has("select-tool"), "前端不再监听 select-tool ⇒ 点菜单项没反应");
  assert.ok(
    directInvokes.has("register_tools"),
    "前端不再调 register_tools ⇒ tray 菜单永远是占位组「加载中…」"
  );
});
