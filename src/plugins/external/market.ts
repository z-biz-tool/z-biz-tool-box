/**
 * 远程市场源 — fetch + schema 校验。
 *
 * 流程:
 *   1. UI 调 addMarketSource(url) → 写入 zustand
 *   2. UI 调 fetchMarketSource(source) → 这里实现
 *      - 校验 url 协议(只接受 https / 本地 http)
 *      - 用 @tauri-apps/plugin-http 的 fetch(走 Rust, 绕开 CORS)
 *      - 解析 JSON + validateIndex 校验
 *      - 成功 → 写回 cachedIndex + 清空 lastError
 *      - 失败 → 写回 lastError, 保留旧 cachedIndex
 *   3. UI 展示 cachedIndex.plugins
 *   4. 用户点安装 → installer.installRemotePlugin(entry)
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { MarketIndex, MarketPluginEntry, MarketSource } from "./types";

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
 * 校验市场源 URL 是否可接受。
 * - 必须 https://
 * - 例外: http://localhost / http://127.0.0.1 / http://[::1] (本地开发)
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
  if (parsed.protocol === "https:") return parsed.toString();
  if (parsed.protocol === "http:") {
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      return parsed.toString();
    }
    throw new MarketUrlError("只接受 https:// 协议(本地 localhost 例外)");
  }
  throw new MarketUrlError(`不支持的协议: ${parsed.protocol}`);
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

function isHttpsUrl(v: unknown): v is string {
  if (typeof v !== "string" || !v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
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
  const pluginJson = raw.pluginJson;
  if (!isHttpsUrl(pluginJson)) {
    throw new SchemaError(
      `plugins[${idx}].pluginJson 缺失或不是合法 http(s) URL`
    );
  }
  const mainHtml = raw.mainHtml;
  if (!isHttpsUrl(mainHtml)) {
    throw new SchemaError(
      `plugins[${idx}].mainHtml 缺失或不是合法 http(s) URL`
    );
  }
  const description = isString(raw.description) ? raw.description : "";
  const author = isString(raw.author) ? raw.author : undefined;
  const homepage = isHttpsUrl(raw.homepage) ? raw.homepage : undefined;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter(isString)
    : undefined;
  const logo = isHttpsUrl(raw.logo) ? raw.logo : undefined;

  return {
    id,
    name,
    version,
    description,
    pluginJson,
    mainHtml,
    author,
    homepage,
    tags,
    logo,
  };
}

export function validateIndex(raw: unknown): MarketIndex {
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
    homepage: isHttpsUrl(raw.homepage) ? raw.homepage : undefined,
    updatedAt: isString(raw.updatedAt) ? raw.updatedAt : undefined,
    plugins,
  };
}

// =====================================================================
// Fetch 实现
// =====================================================================

export interface FetchOk {
  ok: true;
  index: MarketIndex;
}
export interface FetchErr {
  ok: false;
  error: string;
}
export type FetchResult = FetchOk | FetchErr;

/**
 * 拉取并校验单个市场源。
 * 永远不抛异常 — 返回 { ok, index | error } 便于 UI 直接展示。
 */
export async function fetchMarketSource(source: MarketSource): Promise<FetchResult> {
  try {
    const safeUrl = validateMarketUrl(source.url);
    const resp = await tauriFetch(safeUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      // @ts-ignore — connectTimeout 是 tauri-plugin-http 的扩展字段
      connectTimeout: FETCH_TIMEOUT_MS,
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status} ${resp.statusText}` };
    }
    const text = await resp.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: `JSON 解析失败: ${String(e)}` };
    }
    const index = validateIndex(raw);
    return { ok: true, index };
  } catch (e) {
    if (e instanceof MarketUrlError || e instanceof SchemaError) {
      return { ok: false, error: e.message };
    }
    return { ok: false, error: `网络错误: ${String(e)}` };
  }
}
