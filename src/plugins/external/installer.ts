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
import { appDataDir, join } from "@tauri-apps/api/path";
import type {
  ExternalPluginManifest,
  MarketPluginEntry,
  MarketSource,
} from "./types";
import { mainHtmlUrl, pluginJsonUrl, logoUrl, validateMarketUrl } from "./market";

const PLUGIN_DIR_NAME = "plugins";
const FETCH_TIMEOUT_MS = 15_000;

async function getPluginsDir(): Promise<string> {
  const base = await appDataDir();
  return await join(base, PLUGIN_DIR_NAME);
}

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
}

/**
 * 从市场源安装一个插件。
 * - source: 用户配置的市场源(提供 base URL)
 * - entry: MarketList 里的条目(提供 id)
 */
export async function installRemotePlugin(
  source: MarketSource,
  entry: MarketPluginEntry
): Promise<InstallResult> {
  // 1) 解析 base
  const base = validateMarketUrl(source.url);

  // 2) 拉并解析 manifest
  const manifestUrl = pluginJsonUrl(base, entry.id);
  const manifestRaw = await downloadText(manifestUrl);
  let manifest: Partial<ExternalPluginManifest>;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (e) {
    throw new Error(`plugin.json 解析失败: ${String(e)}`);
  }
  validateManifestAgainstEntry(manifest, entry);

  // 3) 准备目录
  const pluginsDir = await getPluginsDir();
  const pluginDir = await join(pluginsDir, entry.id);
  if (!(await exists(pluginDir))) {
    await mkdir(pluginDir, { recursive: true });
  }

  // 4) 写 plugin.json(main/logo 用 manifest 里的字段名, 默认 main.html / logo.png)
  const mainFile = manifest.main ?? "main.html";
  const logoFile = manifest.logo ?? "logo.png";
  const finalManifest: ExternalPluginManifest = {
    ...manifest,
    main: mainFile,
    logo: logoFile,
  };
  await writeTextFile(
    await join(pluginDir, "plugin.json"),
    JSON.stringify(finalManifest, null, 2)
  );

  // 5) 下载 main.html — 用 manifest 里的 main 字段
  const mainUrl = mainHtmlUrl(base, entry.id);
  const html = await downloadText(mainUrl);
  await writeTextFile(await join(pluginDir, mainFile), html);

  // 6) 可选 logo — 失败不致命
  try {
    const lgUrl = logoUrl(base, entry.id);
    const buf = await downloadBinary(lgUrl);
    await writeFile(await join(pluginDir, logoFile), buf);
  } catch {
    // logo 缺失 / 404 — 静默忽略, 用占位
  }

  return { pluginId: entry.id, pluginDir };
}
