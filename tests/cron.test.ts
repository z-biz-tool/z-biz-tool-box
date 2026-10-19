// plugins/convert/cronLogic.ts（cron 解析 / 中文描述 / 下次运行时间）的纯逻辑回归。
// 跑法：node --experimental-strip-types --test tests/cron.test.ts
//
// 为什么测它：
//   `CronParser.tsx` 此前把全部计算埋在组件里（`node --experimental-strip-types` 无法
//   import `.tsx`）⇒ **零测试**。而它的失败形态是静默的：
//   · 「下次运行时间」原本是 `now + N 分钟`，与 cron 语义毫无关系
//     （输入「每天 3 点」也返回现在+1分钟）—— 界面上**并没有展示**这个结果，
//     所以用户没被骗，但它是**一个随时会被接上的假实现**；
//   · 字段范围从不校验 ⇒ `0 99 * * *` 被描述成「第99分钟」，非法值当合法值展示。
//
// 判据用**可解析的性质**：nextRuns 里每一个时间都必须满足 cron 语义
// （小时/分钟/秒/日/周/月的字段匹配），且严格递增、严格晚于起点。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cronMatches,
  describeCron,
  expandCronField,
  getCronDescription,
  nextCronRuns,
  parseCronExpression,
  parseCronField,
} from "../src/plugins/convert/cronLogic.ts";

/** 固定起点（本地时间）：2026-01-15 10:30:00，周四 */
const FROM = new Date(2026, 0, 15, 10, 30, 0);

const same = (a: Date, y: number, mo: number, d: number, h: number, mi: number, s = 0) => {
  assert.equal(
    a.getFullYear(),
    y,
    `年份：期望 ${y}，实得 ${a.getFullYear()}`,
  );
  assert.equal(a.getMonth() + 1, mo, `月份：期望 ${mo}，实得 ${a.getMonth() + 1}`);
  assert.equal(a.getDate(), d, `日：期望 ${d}，实得 ${a.getDate()}`);
  assert.equal(a.getHours(), h, `时：期望 ${h}，实得 ${a.getHours()}`);
  assert.equal(a.getMinutes(), mi, `分：期望 ${mi}，实得 ${a.getMinutes()}`);
  assert.equal(a.getSeconds(), s, `秒：期望 ${s}，实得 ${a.getSeconds()}`);
};

// ── 字段展开 ────────────────────────────────────────────────────────

test("expandCronField：* 展开为整个范围", () => {
  const v = expandCronField("*", 0, 59)!;
  assert.equal(v.size, 60);
  assert.ok(v.has(0) && v.has(59));
});

test("expandCronField：*/n 从最小值起每 n 一个", () => {
  const v = expandCronField("*/15", 0, 59)!;
  assert.deepEqual([...v].sort((a, b) => a - b), [0, 15, 30, 45]);
});

test("expandCronField：a-b 是闭区间", () => {
  const v = expandCronField("1-5", 0, 7)!;
  assert.deepEqual([...v].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test("expandCronField：a-b/n 范围带步长（cron 常用写法）", () => {
  const v = expandCronField("0-30/10", 0, 59)!;
  assert.deepEqual([...v].sort((a, b) => a - b), [0, 10, 20, 30]);
});

test("expandCronField：a/n 从 a 起每 n 一个", () => {
  const v = expandCronField("5/20", 0, 59)!;
  assert.deepEqual([...v].sort((a, b) => a - b), [5, 25, 45]);
});

test("expandCronField：逗号列表可混合多种写法", () => {
  const v = expandCronField("0,30-32,*/15", 0, 59)!;
  assert.deepEqual([...v].sort((a, b) => a - b), [0, 15, 30, 31, 32, 45]);
});

test("expandCronField：越界与非法写法一律判非法", () => {
  assert.equal(expandCronField("60", 0, 59), null, "超出上界");
  assert.equal(expandCronField("-1", 0, 59), null, "负数");
  assert.equal(expandCronField("5-70", 0, 59), null, "范围越界");
  assert.equal(expandCronField("5-1", 0, 59), null, "起点大于终点");
  assert.equal(expandCronField("*/0", 0, 59), null, "步长为 0");
  assert.equal(expandCronField("abc", 0, 59), null, "非数字");
  assert.equal(expandCronField("1,,2", 0, 59), null, "空列表项");
});

// ── 字段范围校验（修掉的缺陷一）────────────────────────────────────────

test("parseCronField：越界的取值判为无效，不再当合法值展示", () => {
  const bad = parseCronField("99", 0, 59, "分钟");
  assert.equal(bad.desc, "无效的分钟");
  assert.equal(bad.values.size, 0);
});

test("parseCronField：正常取值的描述与允许值", () => {
  const f = parseCronField("30", 0, 59, "分钟");
  assert.equal(f.desc, "第30分钟");
  assert.ok(f.values.has(30));
  assert.equal(f.values.size, 1);
});

test("parseCronField：步长为 0 才是非法；步长大于范围按 cron 标准只命中起始值", () => {
  // ⚠️ 这条曾经写错过：以为「*/70」在 0-59 的分钟字段里该判非法。
  // 实测 cron 标准下它是合法的 —— 展开后只命中起始值 0。
  const big = parseCronField("*/70", 0, 59, "分钟");
  assert.equal(big.desc, "每隔70分钟");
  assert.deepEqual([...big.values], [0]);

  const zero = parseCronField("*/0", 0, 59, "分钟");
  assert.equal(zero.desc, "无效的分钟");
  assert.equal(zero.values.size, 0);
});

// ── 表达式解析 ──────────────────────────────────────────────────────

test("parseCronExpression：字段数不是 5 或 6 时返回 null", () => {
  assert.equal(parseCronExpression("* * * *"), null);
  assert.equal(parseCronExpression("* * * * * * *"), null);
  assert.ok(parseCronExpression("0 9 * * 1-5"));
  assert.ok(parseCronExpression("30 0 9 * * 1-5"));
});

test("parseCronExpression：任一字段非法 ⇒ 整个表达式非法", () => {
  assert.equal(parseCronExpression("0 99 * * *"), null, "小时越界");
  assert.equal(parseCronExpression("0 9 32 * *"), null, "日越界");
  assert.equal(parseCronExpression("0 9 * 13 *"), null, "月越界");
  assert.equal(parseCronExpression("0 9 * * 8"), null, "周越界");
});

test("getCronDescription：字段数不对给出明确错误", () => {
  const r = getCronDescription("* * * *");
  assert.match(r.error ?? "", /5 或 6 个字段/);
  assert.equal(r.description, "");
});

// ── 中文描述 ────────────────────────────────────────────────────────

test("describeCron：沿用既有的中文措辞", () => {
  const p = parseCronExpression("0 9 * * 1-5")!;
  const d = describeCron(p);
  assert.match(d, /每月/);
  assert.match(d, /周从1到5/, "范围写法沿用原措辞「周从1到5」");
  assert.match(d, /第9小时/);
  assert.match(d, /第0分钟/);
});

test("describeCron：周字段 0 与 7 都是周日", () => {
  assert.match(describeCron(parseCronExpression("0 0 * * 0")!), /每周日/);
  assert.match(describeCron(parseCronExpression("0 0 * * 7")!), /每周日/);
});

test("describeCron：月字段映射成中文月份", () => {
  assert.match(describeCron(parseCronExpression("0 0 1 3 *")!), /三月/);
});

// ── 下次运行时间（修掉的缺陷二）────────────────────────────────────────

test("nextCronRuns：每天 3:00 的下次运行确实是凌晨 3 点（不是「现在 + 1 分钟」）", () => {
  const p = parseCronExpression("0 3 * * *")!;
  const runs = nextCronRuns(p, FROM, 3);
  assert.equal(runs.length, 3);
  for (const r of runs) {
    assert.equal(r.getHours(), 3, "小时必须是 3");
    assert.equal(r.getMinutes(), 0, "分钟必须是 0");
    assert.equal(r.getSeconds(), 0, "秒必须是 0");
  }
  same(runs[0], 2026, 1, 16, 3, 0);
  same(runs[1], 2026, 1, 17, 3, 0);
  same(runs[2], 2026, 1, 18, 3, 0);
});

test("nextCronRuns：每 5 分钟的下次运行落在 5 的倍数上", () => {
  const p = parseCronExpression("*/5 * * * *")!;
  const runs = nextCronRuns(p, FROM, 3);
  assert.equal(runs.length, 3);
  for (const r of runs) assert.equal(r.getMinutes() % 5, 0);
  same(runs[0], 2026, 1, 15, 10, 35);
  same(runs[1], 2026, 1, 15, 10, 40);
});

test("nextCronRuns：起点当刻不算（必须严格晚于 from）", () => {
  const p = parseCronExpression("0 * * * *")!;
  const at = new Date(2026, 0, 15, 10, 0, 0);
  const runs = nextCronRuns(p, at, 1);
  same(runs[0], 2026, 1, 15, 11, 0);
});

test("nextCronRuns：结果严格递增，且每个都满足 cron 语义", () => {
  const p = parseCronExpression("*/7 3-5 * * 1,3")!;
  const runs = nextCronRuns(p, FROM, 5);
  assert.ok(runs.length >= 3);
  for (let i = 1; i < runs.length; i++) {
    assert.ok(runs[i].getTime() > runs[i - 1].getTime(), "必须严格递增");
  }
  for (const r of runs) {
    assert.ok(cronMatches(p, r), `${r.toString()} 必须满足表达式`);
    assert.ok(r.getTime() > FROM.getTime());
  }
});

test("nextCronRuns：日与周都被限定时是「或」（POSIX 语义）", () => {
  // 每月 13 号 **或** 每个周五
  const p = parseCronExpression("0 0 13 * 5")!;
  const runs = nextCronRuns(p, FROM, 5);
  assert.equal(runs.length, 5);
  // 前四次都应是周五（1/16、1/23、1/30、2/6），第五次才落到 2 月 13 号
  // （2/13 恰好也是周五，所以它同时满足两个条件）
  assert.equal(runs[0].getDay(), 5, "1/16 是周五");
  assert.equal(runs[1].getDay(), 5, "1/23 是周五");
  assert.equal(runs[2].getDay(), 5, "1/30 是周五");
  assert.equal(runs[3].getDay(), 5, "2/6 是周五");
  same(runs[4], 2026, 2, 13, 0, 0);
});

test("nextCronRuns：日与周只限定其一时是「与」", () => {
  // 只限定「周」为周一 ⇒ 必须是周一
  const p = parseCronExpression("0 0 * * 1")!;
  const runs = nextCronRuns(p, FROM, 3);
  for (const r of runs) assert.equal(r.getDay(), 1, "必须是周一");
});

test("nextCronRuns：6 字段写法的秒参与匹配", () => {
  const p = parseCronExpression("45 0 9 * * *")!;
  const runs = nextCronRuns(p, FROM, 2);
  for (const r of runs) {
    assert.equal(r.getSeconds(), 45);
    assert.equal(r.getHours(), 9);
    assert.equal(r.getMinutes(), 0);
  }
});

test("nextCronRuns：永不可达的表达式返回空数组（不无限搜索）", () => {
  // 2 月 30 日不存在
  const p = parseCronExpression("0 0 30 2 *")!;
  const runs = nextCronRuns(p, FROM, 3);
  assert.deepEqual(runs, []);
});

test("nextCronRuns：闰年的 2 月 29 日能命中", () => {
  const p = parseCronExpression("0 0 29 2 *")!;
  const runs = nextCronRuns(p, new Date(2026, 0, 1, 0, 0, 0), 2);
  // 搜索上限是 4 年（2026-01-01 起算）⇒ 窗口内只有 2028 这一个闰日，
  // 下一个闰日 2032-02-29 落在窗口外，故只返回 1 个（**不是漏算**）。
  assert.equal(runs.length, 1);
  same(runs[0], 2028, 2, 29, 0, 0);
});

test("nextCronRuns：每月 1 号跨月正确", () => {
  const p = parseCronExpression("0 0 1 * *")!;
  const runs = nextCronRuns(p, new Date(2026, 0, 15, 12, 0, 0), 2);
  same(runs[0], 2026, 2, 1, 0, 0);
  same(runs[1], 2026, 3, 1, 0, 0);
});

test("getCronDescription：nextRuns 与描述同源（改注入的 from 就能改结果）", () => {
  const a = getCronDescription("0 3 * * *", FROM);
  const b = getCronDescription("0 3 * * *", new Date(2026, 0, 15, 2, 0, 0));
  assert.equal(a.description, b.description, "描述与 from 无关");
  same(a.nextRuns[0], 2026, 1, 16, 3, 0); // from 是 10:30 ⇒ 今天 3 点已过
  same(b.nextRuns[0], 2026, 1, 15, 3, 0); // from 是 02:00 ⇒ 今天 3 点还没到
});
