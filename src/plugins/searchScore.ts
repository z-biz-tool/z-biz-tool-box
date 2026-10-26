/**
 * 工具搜索的统一打分（台账 T3.5）。
 *
 * 为什么单独一个 .ts：Spotlight 是 .tsx，node --experimental-strip-types
 * 跑不了 .tsx；要断言"排序规则"就必须把判定逻辑放在纯模块里。
 *
 * 四档质量（高档恒定压过低档：档位乘 1000，任何加分都 < 1000）：
 *   4 精确 = 与 label / 某个 cmd / key 完全相等（cmd 是 utools 式的触发词）
 *   3 前缀 = label / cmd / key 以查询词开头
 *   2 首字母 = label 的首字母缩写以查询词开头（如 "JSON Formatter" → "jf"）
 *   1 子串 = label / keywords / description / 分组 / key / cmd 包含查询词
 *   0 不命中 = 不出现在结果里
 *
 * 频率（最近使用 / 收藏）**只在同档内做排序**，不参与跨档比较 ——
 * 否则一个"常用但只是碰巧包含查询词"的工具会压过精确匹配。
 * 无查询时保持调用方给的顺序（浏览态不按历史重排）。
 *
 * 多词查询按 AND 处理：每个词都要命中，整体档位取最低的那一档。
 */

/** 档位常量，导出给测试与 UI 提示用 */
export const SCORE_EXACT = 4;
export const SCORE_PREFIX = 3;
export const SCORE_INITIALS = 2;
export const SCORE_SUBSTRING = 1;
export const SCORE_NONE = 0;

/** 参与打分的字段（结构类型，避免把 React 依赖带进纯模块） */
export interface SearchDoc {
  key: string;
  label: string;
  description?: string;
  keywords?: string;
  cmds?: readonly string[];
  groupLabel?: string;
}

/** 统一大小写 / 全角半角 / 首尾空白。NFKC 让"Ｂ６４"也能命中 "b64"。 */
export function normalizeText(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** 按空格与常见分隔符切词（label 里的 "Base64 编解码" / "URL-编码" 都算多段） */
export function segments(s: string): string[] {
  return normalizeText(s)
    .split(/[\s/\\\-_.·,，、()（）[\]【】|]+/)
    .filter(Boolean);
}

/** 首字母缩写：每段取第一个字符（"JSON Formatter" → "jf"） */
export function initialsOf(s: string): string {
  return segments(s)
    .map((seg) => seg[0] ?? "")
    .join("");
}

/** 单个查询词对单个文档的最佳档位 */
export function scoreWord(word: string, doc: SearchDoc): number {
  const w = normalizeText(word);
  if (!w) return SCORE_EXACT;
  const label = normalizeText(doc.label);
  const key = normalizeText(doc.key);
  const cmds = (doc.cmds ?? []).map(normalizeText);
  const keywords = normalizeText(doc.keywords ?? "");
  const description = normalizeText(doc.description ?? "");
  const group = normalizeText(doc.groupLabel ?? "");

  if (label === w || key === w || cmds.includes(w)) return SCORE_EXACT;
  if (label.startsWith(w) || key.startsWith(w) || cmds.some((c) => c.startsWith(w))) {
    return SCORE_PREFIX;
  }
  // 单字符查询不走进首字母档：那种情况前缀/子串已经能表达，避免噪声
  if (w.length >= 2 && initialsOf(doc.label).startsWith(w)) return SCORE_INITIALS;
  if (
    [label, key, keywords, description, group, ...cmds].some((field) => field.includes(w))
  ) {
    return SCORE_SUBSTRING;
  }
  return SCORE_NONE;
}

export interface ScoreOptions {
  /** 最近使用，最新在前 */
  recent?: readonly string[];
  /** 收藏 */
  starred?: readonly string[];
}

/**
 * 文档得分：0 表示不命中。
 * = 最低档 × 1000 + 同档加分（精确加成 / 命中位置 / 频率），加分上限 999。
 */
export function scoreDoc(
  query: string,
  doc: SearchDoc,
  options: ScoreOptions = {}
): number {
  const q = normalizeText(query);
  if (!q) return 1; // 空查询：全部保留，由调用方维持原顺序

  const words = q.split(" ").filter(Boolean);
  let tier = SCORE_EXACT;
  for (const w of words) {
    const t = scoreWord(w, doc);
    if (t === SCORE_NONE) return SCORE_NONE;
    tier = Math.min(tier, t);
  }

  let bonus = 0;
  const label = normalizeText(doc.label);
  if (label === q) bonus += 200;
  else if ((doc.cmds ?? []).some((c) => normalizeText(c) === q)) bonus += 150;

  // 命中位置越靠前越好（只在前 4 段内加分，避免长描述主导排序）
  const segs = segments(doc.label);
  const hitSeg = segs.findIndex((seg) => seg.startsWith(words[0]));
  if (hitSeg === 0) bonus += 30;
  else if (hitSeg > 0 && hitSeg < 4) bonus += 10;

  // 频率：只在同档内起作用（< 1000）
  const recentIdx = options.recent?.indexOf(doc.key) ?? -1;
  if (recentIdx >= 0) bonus += Math.max(0, 40 - recentIdx * 5);
  if (options.starred?.includes(doc.key)) bonus += 10;

  return tier * 1000 + Math.min(bonus, 999);
}

/**
 * 过滤 + 排序。稳定排序：同分保持调用方顺序。
 * 空查询原样返回（不按历史重排浏览列表）。
 */
export function rankDocs<T extends SearchDoc>(
  query: string,
  docs: readonly T[],
  options: ScoreOptions = {}
): T[] {
  const q = normalizeText(query);
  if (!q) return [...docs];
  const scored = docs
    .map((doc, index) => ({ doc, index, score: scoreDoc(q, doc, options) }))
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((x) => x.doc);
}
