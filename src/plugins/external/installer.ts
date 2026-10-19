/**
 * 远程插件安装器 — 从市场源下载文件, 写入本地插件目录。
 *
 * 遵循 docs/market-spec.md v1.0:
 *   - {base}/plugins/{id}/plugin.json
 *   - {base}/plugins/{id}/main.html  (manifest.main 字段约定的文件名)
 *   - {base}/plugins/{id}/logo.png   (manifest.logo 字段约定的文件名, 可选)
 *
 * 流程:
 *   1. fetch({base}/plugins/{id}/plugin.json) → 解析成 ExternalPluginManifest
 *      校验: id 一致, name 相同, features 非空
 *   2. 写到 ~/.../plugins/{id}/plugin.json
 *   3. fetch({base}/plugins/{id}/{main})   → 写到 plugin.json 里 main 字段指向的文件
 *   4. fetch({base}/plugins/{id}/{logo})   [可选] → 写到 logo 字段指向的文件
 *   5. 触发 scanner.refresh() — 跟本地插件同等待遇
 *
 * 错误隔离: 任何步骤失败抛 Error,UI 展示。
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { mkdir, writeFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type {
  ExternalPluginManifest,
  MarketPluginEntry,
  MarketSource,
} from "./types";
import { mainHtmlUrl, pluginJsonUrl, logoUrl, validateMarketUrl } from "./market";
import { verifyPluginHash } from "./hash.ts";
import { getPluginsDir } from "./paths";

const FETCH_TIMEOUT_MS = 15_000;

async function downloadText(url: string): Promise<string> {
  const resp = await tauriFetch(url, {
    method: "GET",
    // @ts-ignore
    connectTimeout: FETCH_TIMEOUT_MS,
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${url}`);
  }
  return await resp.text();
}

async function downloadBinary(url: string): Promise<Uint8Array> {
  const resp = await tauriFetch(url, {
    method: "GET",
    // @ts-ignore
    connectTimeout: FETCH_TIMEOUT_MS,
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${url}`);
  }
  const arr = await resp.arrayBuffer();
  return new Uint8Array(arr);
}

function validateManifestAgainstEntry(
  m: Partial<ExternalPluginManifest>,
  entry: MarketPluginEntry
): asserts m is ExternalPluginManifest {
  if (!m.id) throw new Error("plugin.json 缺少 id");
  if (m.id !== entry.id) {
    throw new Error(`id 不一致: market=${entry.id} manifest=${m.id}`);
  }
  if (!m.name) throw new Error("plugin.json 缺少 name");
  if (!Array.isArray(m.features) || m.features.length === 0) {
    throw new Error("plugin.json 缺少 features(至少 1 个)");
  }
  for (const f of m.features) {
    if (!f.code || !f.explain) {
      throw new Error(`feature 缺少 code/explain: ${JSON.stringify(f)}`);
    }
  }
}

export interface InstallResult {
  pluginId: string;
  pluginDir: string;
  /**
   * 是否**真的做过**完整性校验。
   * false = 市场源没给 sha256，按台账降级条款放行（但界面必须如实显示「未校验」）。
   */
  hashVerified: boolean;
}

/** 安装相关的可选项 */
export interface InstallOptions {
  /**
   * 是否放行 http 明文市场源(来自用户的「允许不安全市场源」开关)。
   * 缺省 false ⇒ http 源直接被拒, 连 plugin.json 都不下载。
   */
  allowInsecure?: boolean;
}

/**
 * 只取插件的 manifest(plugin.json), 不下载主文件。
 *
 * 为什么单独拆出来: 台账 T1.7 要求「安装前弹窗展示 插件名/来源URL/版本/hash/
 * **权限清单**, 用户确认后才开始下载」。而权限清单只存在于 plugin.json 里 ——
 * 市场列表条目里没有权限字段。所以顺序必须是:
 *
 *   取 manifest → 算确认清单 → 用户确认 → 下载主文件 → 校验 → 落盘
 *
 * 如果先下载主文件再确认, 那"确认后才开始下载"就没意义了 ——
 * 包已经落到内存里了, 用户点了"拒绝"也拦不住什么。
 */
export async function fetchRemoteManifest(
  source: MarketSource,
  entry: MarketPluginEntry,
  opts: InstallOptions = {}
): Promise<ExternalPluginManifest> {
  const base = validateMarketUrl(source.url, { allowInsecure: opts.allowInsecure === true });
  const manifestUrl = pluginJsonUrl(base, entry.id);
  const manifestRaw = await downloadText(manifestUrl);
  let manifest: Partial<ExternalPluginManifest>;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (e) {
    throw new Error(`plugin.json 解析失败: ${String(e)}`);
  }
  validateManifestAgainstEntry(manifest, entry);
  return manifest as ExternalPluginManifest;
}

/**
 * 从市场源安装一个插件。
 * - source: 用户配置的市场源(提供 base URL)
 * - entry: MarketList 里的条目(提供 id 与可选的 sha256)
 * - manifest: 已经取过的 plugin.json(可省, 省了会自己取一次)
 *
 * 流程（**先下载 + 校验，再落盘**）：
 *   1. fetch plugin.json → 解析并校验 id / name / features
 *   2. fetch main.html 的**字节** → 计算 SHA-256 与 entry.sha256 比对
 *      · 不一致 ⇒ 抛错，**一个字节都不落盘**
 *      · 源没给 sha256 ⇒ 按台账降级条款放行，但结果标记 hashVerified=false
 *   3. fetch logo 的字节（可选，失败不致命）
 *   4. 全部就绪后再 mkdir + 写 plugin.json / main / logo
 *   5. 触发 scanner.refresh()
 *
 * ⚠️ 顺序是有意的：原先是「先写 plugin.json，再下载 main.html」，
 *    于是下载失败会留下**半安装状态**（目录里有 plugin.json 却没有主文件），
 *    扫描器会把它当成一个坏插件。用户看到的是「装了但用不了」，而不是干净的失败。
 *
 * ⚠️ 哈希必须算在**原始字节**上：先 text() 再重新编码，字节可能已变（编码嗅探/BOM）。
 */
export async function installRemotePlugin(
  source: MarketSource,
  entry: MarketPluginEntry,
  manifest?: ExternalPluginManifest,
  opts: InstallOptions = {}
): Promise<InstallResult> {
  // 1) 解析 base + 取 manifest(没给就自己取)
  const base = validateMarketUrl(source.url, { allowInsecure: opts.allowInsecure === true });
  const m = manifest ?? (await fetchRemoteManifest(source, entry, opts));

  // 2) 下载 main.html 的字节并做完整性校验（此时还没落盘任何东西）
  const mainUrl = mainHtmlUrl(base, entry.id);
  const htmlBytes = await downloadBinary(mainUrl);
  const check = await verifyPluginHash(htmlBytes, entry.sha256);
  if (check.blocking) {
    throw new Error(`插件包完整性校验失败，已拒绝安装：${check.reason}`);
  }

  // 3) 可选 logo — 失败不致命
  let logoBytes: Uint8Array | null = null;
  try {
    logoBytes = await downloadBinary(logoUrl(base, entry.id));
  } catch {
    // logo 缺失 / 404 — 静默忽略, 用占位
  }

  // 4) 全部就绪 → 落盘
  const pluginsDir = await getPluginsDir();
  const pluginDir = await join(pluginsDir, entry.id);
  if (!(await exists(pluginDir))) {
    await mkdir(pluginDir, { recursive: true });
  }

  // 写 plugin.json(main/logo 用 manifest 里的字段名, 默认 main.html / logo.png)
  const mainFile = m.main ?? "main.html";
  const logoFile = m.logo ?? "logo.png";
  const finalManifest: ExternalPluginManifest = {
    ...m,
    main: mainFile,
    logo: logoFile,
  };
  await writeTextFile(
    await join(pluginDir, "plugin.json"),
    JSON.stringify(finalManifest, null, 2)
  );
  await writeFile(await join(pluginDir, mainFile), htmlBytes);
  if (logoBytes) {
    await writeFile(await join(pluginDir, logoFile), logoBytes);
  }

  return { pluginId: entry.id, pluginDir, hashVerified: check.verified };
}
