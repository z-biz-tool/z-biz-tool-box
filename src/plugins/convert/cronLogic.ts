/**
 * Cron 表达式的纯逻辑：字段解析、中文描述、下次运行时间。
 *
 * 抽出来的理由（与同族 worker 仓同款做法）：
 *   这些是**纯计算**，但原先全部埋在 `CronParser.tsx` 的组件里 ⇒
 *   `node --experimental-strip-types` 无法 import `.tsx`，一条测试都写不了。
 *   组件只负责渲染，计算全在这里；**渲染行为不变**。
 *
 * 两个被修掉的真缺陷（原先都在组件里）：
 *
 * 1. **字段范围从不校验**：`parseField(value, min, max, name)` 收了 min/max 却没用，
 *    于是 `0 99 * * *` 被描述成「第99分钟」—— 非法值被当作合法值展示。
 *    现在越界一律判为无效。
 *
 * 2. **「下次运行时间」是假的**：原实现是 `now + (i+1) 分钟`，
 *    与 cron 语义毫无关系（输入「每天 3 点」也返回现在+1分钟）。
 *    现在是真正的 cron 匹配。
 *    ⚠️ 界面**并没有展示**这个结果（原实现算完就没人用），
 *    所以这次修正**不改变任何用户可见行为**；要把它显示出来属产品决定。
 *
 * 3. 顺带补上原实现**不支持**的写法：`a-b/n`（范围带步长，如 `1-5/2`）
 *    与 `a/n`（从 a 起每 n）。原实现先命中 `-` 分支，把 `1-5/2` 的步长静默吞掉。
 *
 * cron 语义里两个容易搞错的点，这里明确写死：
 *   · **日与周是「或」不是「与」**：当「日」和「周」都被限定时，
 *     命中任意一个即触发（POSIX 标准；Quartz 等实现亦然）。
 *   · 字段是 `*` 时视为**不限**；一旦写成别的（包括 `*` 后跟 `/1`）即视为**限定**。
 */

/** 一个字段的解析结果：描述 + 允许值集合 */
export interface CronFieldValue {
  /** 中文描述片段 */
  desc: string;
  /** 该字段允许的取值集合 */
  values: Set<number>;
  /** 原始文本（判断「是否被限定」用） */
  raw: string;
}

export interface CronExpression {
  /** 秒字段（6 字段写法才有） */
  second: CronFieldValue | null;
  minute: CronFieldValue;
  hour: CronFieldValue;
  dayOfMonth: CronFieldValue;
  month: CronFieldValue;
  dayOfWeek: CronFieldValue;
  /** 字段数（5 或 6） */
  fieldCount: number;
}

export interface CronDescriptionResult {
  description: string;
  nextRuns: Date[];
  error?: string;
}

/** 各字段的取值范围（周字段 0 与 7 都是周日） */
const RANGES = {
  second: [0, 59] as const,
  minute: [0, 59] as const,
  hour: [0, 23] as const,
  dayOfMonth: [1, 31] as const,
  month: [1, 12] as const,
  dayOfWeek: [0, 7] as const,
};

/**
 * 展开一个字段的允许值集合。
 * 支持：`*` / `*\/n` / `a` / `a\/n` / `a-b` / `a-b\/n` / 逗号列表（各项可组合）。
 * 任何一项非法 ⇒ 整个字段非法（返回 null）。
 */
export function expandCronField(
  value: string,
  min: number,
  max: number,
): Set<number> | null {
  const out = new Set<number>();
  const raw = value.trim();
  if (!raw) return null;
  for (const part of raw.split(",")) {
    const seg = part.trim();
    if (!seg) return null;

    if (seg === "*") {
      for (let i = min; i <= max; i++) out.add(i);
      continue;
    }

    let m = /^\*\/(\d+)$/.exec(seg);
    if (m) {
      const step = Number(m[1]);
      if (step < 1) return null;
      for (let i = min; i <= max; i += step) out.add(i);
      continue;
    }

    m = /^(\d+)\/(\d+)$/.exec(seg);
    if (m) {
      const start = Number(m[1]);
      const step = Number(m[2]);
      if (step < 1 || start < min || start > max) return null;
      for (let i = start; i <= max; i += step) out.add(i);
      continue;
    }

    m = /^(\d+)-(\d+)(?:\/(\d+))?$/.exec(seg);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const step = m[3] === undefined ? 1 : Number(m[3]);
      if (step < 1 || a < min || b > max || a > b) return null;
      for (let i = a; i <= b; i += step) out.add(i);
      continue;
    }

    m = /^(\d+)$/.exec(seg);
    if (m) {
      const n = Number(m[1]);
      if (n < min || n > max) return null;
      out.add(n);
      continue;
    }

    return null;
  }
  return out.size > 0 ? out : null;
}

/** 解析单个字段：得到允许值 + 中文描述；非法时 desc 为「无效的…」 */
export function parseCronField(
  value: string,
  min: number,
  max: number,
  fieldName: string,
): CronFieldValue {
  const raw = value.trim();
  const invalid = (): CronFieldValue => ({
    desc: `无效的${fieldName}`,
    values: new Set<number>(),
    raw,
  });

  if (raw === "*") {
    return { desc: `每${fieldName}`, values: expandCronField("*", min, max)!, raw };
  }

  if (raw.startsWith("*/")) {
    const step = Number(raw.slice(2));
    if (!Number.isInteger(step) || step < 1) return invalid();
    const values = expandCronField(raw, min, max);
    if (!values) return invalid();
    return { desc: `每隔${step}${fieldName}`, values, raw };
  }

  if (raw.includes(",")) {
    const values = expandCronField(raw, min, max);
    if (!values) return invalid();
    const parts = raw.split(",").map((v) => v.trim());
    return { desc: `指定的${fieldName}: ${parts.join("、")}`, values, raw };
  }

  if (raw.includes("-")) {
    const values = expandCronField(raw, min, max);
    if (!values) return invalid();
    const m = /^(\d+)-(\d+)/.exec(raw);
    if (!m) return invalid();
    const step = /\/\d+/.test(raw) ? `（步长 ${raw.split("/")[1]}）` : "";
    return { desc: `${fieldName}从${m[1]}到${m[2]}${step}`, values, raw };
  }

  const n = Number(raw);
  if (!Number.isInteger(n)) return invalid();
  const values = expandCronField(raw, min, max);
  if (!values) return invalid();
  return { desc: `第${n}${fieldName}`, values, raw };
}

/** 解析整条表达式；字段数不对或任一字段非法时返回 null */
export function parseCronExpression(expr: string): CronExpression | null {
  const parts = expr.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 5 || parts.length > 6) return null;

  const hasSeconds = parts.length === 6;
  const offset = hasSeconds ? 1 : 0;
  const second = hasSeconds
    ? parseCronField(parts[0], RANGES.second[0], RANGES.second[1], "秒")
    : null;
  const minute = parseCronField(parts[offset], RANGES.minute[0], RANGES.minute[1], "分钟");
  const hour = parseCronField(parts[offset + 1], RANGES.hour[0], RANGES.hour[1], "小时");
  const dayOfMonth = parseCronField(
    parts[offset + 2],
    RANGES.dayOfMonth[0],
    RANGES.dayOfMonth[1],
    "日",
  );
  const month = parseCronField(parts[offset + 3], RANGES.month[0], RANGES.month[1], "月");
  const dayOfWeek = parseCronField(
    parts[offset + 4],
    RANGES.dayOfWeek[0],
    RANGES.dayOfWeek[1],
    "周",
  );

  const all = [second, minute, hour, dayOfMonth, month, dayOfWeek].filter(
    (f): f is CronFieldValue => f !== null,
  );
  if (all.some((f) => f.values.size === 0)) return null;

  return { second, minute, hour, dayOfMonth, month, dayOfWeek, fieldCount: parts.length };
}

const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_CN = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];

/** 中文描述（沿用原组件里的措辞与拼接顺序） */
export function describeCron(p: CronExpression): string {
  let descWeek = p.dayOfWeek.desc;
  if (/^[0-7]$/.test(p.dayOfWeek.raw)) {
    const n = Number(p.dayOfWeek.raw);
    descWeek = `每周${WEEK_CN[n === 7 ? 0 : n]}`;
  } else if (p.dayOfWeek.raw === "*") {
    descWeek = "每天";
  } else if (p.dayOfWeek.raw.startsWith("*/")) {
    descWeek = `每${p.dayOfWeek.raw.slice(2)}周`;
  }

  let descMonth = p.month.desc;
  if (/^[1-9]$|^1[0-2]$/.test(p.month.raw)) {
    descMonth = MONTH_CN[Number(p.month.raw) - 1];
  }

  let description = `${descMonth} ${
    p.dayOfMonth.desc === "每日" ? "" : p.dayOfMonth.desc
  } ${descWeek === "每天" ? "" : descWeek} ${p.hour.desc} ${p.minute.desc}`;
  if (p.second) description += `，${p.second.desc}`;
  return description;
}

/** 某天是否满足「月 + 日/周」部分（与时分秒无关） */
export function cronDateMatches(p: CronExpression, d: Date): boolean {
  if (!p.month.values.has(d.getMonth() + 1)) return false;

  const dow = d.getDay();
  const dowHit = p.dayOfWeek.values.has(dow) || (dow === 0 && p.dayOfWeek.values.has(7));
  const domHit = p.dayOfMonth.values.has(d.getDate());

  // 「日」与「周」都被限定时是「或」；否则各自都要满足
  const domRestricted = p.dayOfMonth.raw !== "*";
  const dowRestricted = p.dayOfWeek.raw !== "*";
  if (domRestricted && dowRestricted) return domHit || dowHit;
  return domHit && dowHit;
}

/** 某时刻是否命中这条表达式（按 POSIX 的「日与周或」语义） */
export function cronMatches(p: CronExpression, d: Date): boolean {
  if (p.second && !p.second.values.has(d.getSeconds())) return false;
  if (!p.minute.values.has(d.getMinutes())) return false;
  if (!p.hour.values.has(d.getHours())) return false;
  return cronDateMatches(p, d);
}

/** 搜索上限：4 年。用来兜住「2 月 30 日」这类永不触发的表达式。 */
const SEARCH_LIMIT_DAYS = 366 * 4 + 1;

/**
 * 从 `from` 之后找 count 次触发时间。
 * 5 字段写法的秒固定为 0，6 字段写法的秒是普通字段。
 *
 * 实现按**天**推进、命中后再在该天里找时刻 ——
 * 逐分钟推进的话，「2 月 30 日」这种永不触发的表达式要空跑 210 万次。
 */
export function nextCronRuns(p: CronExpression, from: Date, count = 3): Date[] {
  const out: Date[] = [];
  const secondList = p.second ? [...p.second.values].sort((a, b) => a - b) : [0];

  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let day = 0; day < SEARCH_LIMIT_DAYS && out.length < count; day++) {
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day);
    if (!cronDateMatches(p, cur)) continue;
    for (const h of [...p.hour.values].sort((a, b) => a - b)) {
      for (const mi of [...p.minute.values].sort((a, b) => a - b)) {
        for (const s of secondList) {
          const t = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), h, mi, s);
          if (t.getTime() > from.getTime()) {
            out.push(t);
            if (out.length >= count) return out;
          }
        }
      }
    }
  }
  return out;
}

/**
 * 完整入口：解析 + 中文描述 + 下次运行时间。
 * `from` 可注入，便于测试固定时间。
 */
export function getCronDescription(expr: string, from: Date = new Date()): CronDescriptionResult {
  const parts = expr.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 5 || parts.length > 6) {
    return {
      description: "",
      nextRuns: [],
      error: "Cron 表达式必须有 5 或 6 个字段（分 时 日 月 周 [秒]）",
    };
  }
  const p = parseCronExpression(expr);
  if (!p) {
    return {
      description: "",
      nextRuns: [],
      error: "Cron 表达式含有非法字段（取值超出范围或格式无法识别）",
    };
  }
  return {
    description: describeCron(p),
    nextRuns: nextCronRuns(p, from, 3),
  };
}
