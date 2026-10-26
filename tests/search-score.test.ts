import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialsOf,
  normalizeText,
  rankDocs,
  scoreDoc,
  SCORE_EXACT,
  SCORE_INITIALS,
  SCORE_NONE,
  SCORE_PREFIX,
  SCORE_SUBSTRING,
  type SearchDoc,
} from "../src/plugins/searchScore.ts";

const doc = (over: Partial<SearchDoc> & { key: string; label: string }): SearchDoc => ({
  description: "",
  keywords: "",
  cmds: [],
  groupLabel: "编码",
  ...over,
});

test("归一化：大小写、全角、首尾/连续空白", () => {
  assert.equal(normalizeText("  Ｂ６４   Tool "), "b64 tool");
  assert.equal(initialsOf("JSON Formatter"), "jf");
  assert.equal(initialsOf("Base64 编解码"), "b编");
});

test("四档：精确 > 前缀 > 首字母 > 子串", () => {
  const exact = doc({ key: "b64", label: "b64" });
  const prefix = doc({ key: "base64-tool", label: "Base64 编解码" });
  const initials = doc({ key: "json-formatter", label: "JSON Formatter" });
  const substring = doc({ key: "j1", label: "格式化", description: "把 json 变漂亮" });

  assert.equal(scoreDoc("b64", exact) / 1000 | 0, SCORE_EXACT);
  assert.equal(scoreDoc("b64", prefix), 0, "Base64 不包含 b64 子串，也不该被前缀命中");
  assert.equal(scoreDoc("base64", prefix) / 1000 | 0, SCORE_PREFIX);
  assert.equal(scoreDoc("jf", initials) / 1000 | 0, SCORE_INITIALS);
  assert.equal(scoreDoc("json", substring) / 1000 | 0, SCORE_SUBSTRING);
  assert.equal(scoreDoc("zzz", substring), SCORE_NONE);
});

test("cmd 触发词参与精确/前缀匹配（utools 式触发）", () => {
  const d = doc({ key: "base64", label: "Base64 编解码", cmds: ["b64", "Base64 编解码"] });
  assert.equal(scoreDoc("b64", d) / 1000 | 0, SCORE_EXACT);
  assert.equal(scoreDoc("b6", d) / 1000 | 0, SCORE_PREFIX);
});

test("排序：档位压过频率（常用但只是子串命中排不到前缀前面）", () => {
  const frequentSubstring = doc({ key: "hot", label: "文本", description: "包含 uuid 的说明" });
  const prefix = doc({ key: "uuid", label: "UUID 生成" });
  const out = rankDocs("uuid", [frequentSubstring, prefix], { recent: ["hot"], starred: ["hot"] });
  assert.deepEqual(out.map((x) => x.key), ["uuid", "hot"]);
});

test("排序：同档内最近使用优先，其次收藏", () => {
  const a = doc({ key: "a", label: "Hash A" });
  const b = doc({ key: "b", label: "Hash B" });
  const c = doc({ key: "c", label: "Hash C" });
  const out = rankDocs("hash", [a, b, c], { recent: ["c"], starred: ["b"] });
  assert.deepEqual(out.map((x) => x.key), ["c", "b", "a"]);
});

test("多词查询按 AND：每个词都要命中，取最低档", () => {
  const d = doc({ key: "json", label: "JSON 格式化", description: "美化/压缩" });
  assert.ok(scoreDoc("json 格式化", d) > 0);
  assert.equal(scoreDoc("json 不存在", d), SCORE_NONE);
  // "json" 前缀档，"压缩" 子串档 ⇒ 整体按子串档
  assert.equal(scoreDoc("json 压缩", d) / 1000 | 0, SCORE_SUBSTRING);
});

test("空查询原样返回，不按历史重排", () => {
  const a = doc({ key: "a", label: "A" });
  const b = doc({ key: "b", label: "B" });
  assert.deepEqual(rankDocs("   ", [a, b], { recent: ["b"] }).map((x) => x.key), ["a", "b"]);
});

test("key / 分组名 / keywords 都能命中", () => {
  const d = doc({ key: "url", label: "URL 编解码", keywords: "链接 编码", groupLabel: "网络工具" });
  assert.ok(scoreDoc("url", d) > 0);
  assert.ok(scoreDoc("链接", d) > 0);
  assert.ok(scoreDoc("网络", d) > 0);
});

test("同分保持调用方顺序（稳定排序）", () => {
  const a = doc({ key: "a", label: "Text A" });
  const b = doc({ key: "b", label: "Text B" });
  assert.deepEqual(rankDocs("text", [b, a]).map((x) => x.key), ["b", "a"]);
});

test("首字母档要求 >= 2 个字符（单字符不制造噪声）", () => {
  const d = doc({ key: "jf", label: "JSON Formatter" });
  assert.notEqual(scoreDoc("j", d) / 1000 | 0, SCORE_INITIALS);
});
