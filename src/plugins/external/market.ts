/**
 * 远程市场源 — fetch + schema 校验。
 *
 * 遵循 docs/market-spec.md v1.0:
 *   客户端拿 base URL (B), GET {B}/list → MarketList
 *
 * 流程:
 *   1. UI 调 addMarketSource(url) → 写入 zustand
 *   2. UI 调 fetchMarketSource(source) → 这里实现
 *      - 校验 base url 协议(http / https 均可, 内网联调友好)
 *      - 拼接 {B}/list, 用 @tauri-apps/plugin-http 的 fetch(走 Rust, 绕开 CORS)
 *      - 解析 JSON + validateList 校验
 *      - 成功 → 写回 cachedList + 清空 lastError
 *      - 失败 → 写回 lastError, 保留旧 cachedList
 *   3. UI 展示 cachedList.plugins
 *   4. 用户点安装 → installer.installRemotePlugin(source, entry)
 *      (installer 自己从 source.url + entry.id 拼下载 URL)
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { MarketList, MarketPluginEntry, MarketSource } from "./types";

/** 拉取超时(ms) */
const FETCH_TIMEOUT_MS = 10_000;

// =====================================================================
// URL 校验
// =====================================================================

export class MarketUrlError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "MarketUrlError";
  }
}

/**
 * 校验 base URL 是否可接受,并去掉末尾的 "/" 便于拼接。
 * - http:// 和 https:// 均可 (内网/本地联调友好)
 * - 不能是 file:// / data: / blob: 等
 */
export function validateMarketUrl(url: string): string {
  const v = url.trim();
  if (!v) throw new MarketUrlError("URL 不能为空");
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new MarketUrlError("不是合法的 URL");
  }
  if (parsed.protocol === "https:" || parsed.protocol === "http:") {
    return parsed.toString().replace(/\/+$/, "");
  }
  throw new MarketUrlError(`不支持的协议: ${parsed.protocol}`);
}

// =====================================================================
// URL 拼接工具
// =====================================================================

/**
 * 把 base URL 和 path 拼成完整 URL。
 *  - 绝对 path (以 / 开头): 保留 base 的路径前缀再拼接
 *    (base 可带 /kapi/... 等前缀, 之前直接丢弃导致 404)
 *  - 相对 path: 拼到 base 后面
 */
export function joinUrl(base: string, path: string): string {
  if (path.startsWith("/")) {
    const b = new URL(base);
    const dir = b.pathname.replace(/\/+$/, "");
    return `${b.protocol}//${b.host}${dir}${path}`;
  }
  return `${base.replace(/\/+$/, "")}/${path}`;
}

/** 标准端点: GET {base}/list */
export function listUrl(base: string): string {
  return joinUrl(base, "/list");
}

/** 标准端点: GET {base}/plugins/{id}/plugin.json */
export function pluginJsonUrl(base: string, id: string): string {
  return joinUrl(base, `/plugins/${encodeURIComponent(id)}/plugin.json`);
}

/** 标准端点: GET {base}/plugins/{id}/main.html */
export function mainHtmlUrl(base: string, id: string): string {
  return joinUrl(base, `/plugins/${encodeURIComponent(id)}/main.html`);
}

/** 标准端点: GET {base}/plugins/{id}/logo.png */
export function logoUrl(base: string, id: string): string {
  return joinUrl(base, `/plugins/${encodeURIComponent(id)}/logo.png`);
}

// =====================================================================
// 版本比较
// =====================================================================

/**
 * 比较两个版本字符串。
 *  - 优先按 semver 数值:  "1.2.3" vs "1.2.10" → 后者大
 *  - 非数字段回退到字符串比较: "20240101" vs "20231231" → 后者大 (按字典序, 也符合日期格式)
 *  - 段数不等: 缺的视为 0 ("1.0" == "1.0.0")
 *
 * 返回: > 0 表示 a 新, < 0 表示 b 新, 0 相等
 *
 * 注意: 不处理 pre-release / build metadata (如 "1.0.0-rc.1"), 这种按字符串兜底
 */
export function compareVersions(a: string, b: string): number {
  if (a === b) return 0;
  const sa = a.split(/[.+-]/); // 拆分, 顺便也切 pre-release 段
  const sb = b.split(/[.+-]/);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const xa = sa[i] ?? "0";
    const xb = sb[i] ?? "0";
    const na = Number(xa);
    const nb = Number(xb);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else {
      // 非数字段: 字典序
      if (xa !== xb) return xa < xb ? -1 : 1;
    }
  }
  return 0;
}

/** a 是否比 b 新 */
export function isNewer(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

// =====================================================================
// Schema 校验
// =====================================================================

export class SchemaError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SchemaError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isStringOrEmpty(v: unknown): v is string {
  return typeof v === "string";
}

function validatePluginEntry(raw: unknown, idx: number): MarketPluginEntry {
  if (!isObject(raw)) {
    throw new SchemaError(`plugins[${idx}] 必须是对象`);
  }
  const id = raw.id;
  if (!isString(id)) {
    throw new SchemaError(`plugins[${idx}].id 缺失或非字符串`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new SchemaError(
      `plugins[${idx}].id "${id}" 含非法字符(只允许字母数字 . _ -)`
    );
  }
  const name = raw.name;
  if (!isString(name)) {
    throw new SchemaError(`plugins[${idx}].name 缺失或非字符串`);
  }
  const version = raw.version;
  if (!isString(version)) {
    throw new SchemaError(`plugins[${idx}].version 缺失或非字符串`);
  }
  const description = isStringOrEmpty(raw.description) ? raw.description : "";
  const author = isString(raw.author) ? raw.author : undefined;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter(isString)
    : undefined;
  const size = typeof raw.size === "number" ? raw.size : undefined;
  const updatedAt = isString(raw.updatedAt) ? raw.updatedAt : undefined;
  const homepage =
    typeof raw.homepage === "string" && raw.homepage
      ? raw.homepage
      : undefined;

  return {
    id,
    name,
    version,
    description,
    author,
    homepage,
    tags,
    size,
    updatedAt,
  };
}

export function validateList(raw: unknown): MarketList {
  if (!isObject(raw)) {
    throw new SchemaError("响应不是 JSON 对象");
  }
  const schemaVersion = raw.schemaVersion;
  if (schemaVersion !== 1) {
    throw new SchemaError(
      `schemaVersion 必须是 1(收到: ${JSON.stringify(schemaVersion)})`
    );
  }
  const name = raw.name;
  if (!isString(name)) {
    throw new SchemaError("顶层 name 缺失或非字符串");
  }
  const pluginsRaw = raw.plugins;
  if (!Array.isArray(pluginsRaw)) {
    throw new SchemaError("顶层 plugins 必须是数组");
  }
  // 校验每个 + 检测 id 重复
  const seen = new Set<string>();
  const plugins: MarketPluginEntry[] = [];
  pluginsRaw.forEach((p, i) => {
    const entry = validatePluginEntry(p, i);
    if (seen.has(entry.id)) {
      throw new SchemaError(`plugins[${i}].id "${entry.id}" 与之前的插件重复`);
    }
    seen.add(entry.id);
    plugins.push(entry);
  });

  return {
    schemaVersion: 1,
    name,
    description: isString(raw.description) ? raw.description : undefined,
    homepage: isString(raw.homepage) ? raw.homepage : undefined,
    updatedAt: isString(raw.updatedAt) ? raw.updatedAt : undefined,
    plugins,
  };
}

// =====================================================================
// Fetch 实现
// =====================================================================

export interface FetchOk {
  ok: true;
  list: MarketList;
}
export interface FetchErr {
  ok: false;
  error: string;
}
export type FetchResult = FetchOk | FetchErr;

/**
 * 拉取并校验单个市场源。
 * 永远不抛异常 — 返回 { ok, list | error } 便于 UI 直接展示。
 */
export async function fetchMarketSource(source: MarketSource): Promise<FetchResult> {
  try {
    const base = validateMarketUrl(source.url);
    const url = listUrl(base);
    const resp = await tauriFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      // @ts-ignore — connectTimeout 是 tauri-plugin-http 的扩展字段
      connectTimeout: FETCH_TIMEOUT_MS,
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status} ${resp.statusText} @ ${url}` };
    }
    const text = await resp.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: `JSON 解析失败: ${String(e)}` };
    }
    const list = validateList(raw);
    return { ok: true, list };
  } catch (e) {
    if (e instanceof MarketUrlError || e instanceof SchemaError) {
      return { ok: false, error: e.message };
    }
    return { ok: false, error: `网络错误: ${String(e)}` };
  }
}
