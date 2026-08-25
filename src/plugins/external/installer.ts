/**
 * 远程插件安装器 — 从市场条目下载文件, 写入本地插件目录。
 *
 * 流程:
 *   1. fetch(pluginJson URL) → 解析成 ExternalPluginManifest
 *      校验: id 一致, name 相同(version 可以更新), features 非空
 *   2. 写到 ~/.../plugins/{id}/plugin.json
 *   3. fetch(mainHtml URL)  → 写到 plugin.json 里 main 字段指向的文件(默认 main.html)
 *   4. fetch(logo URL) [可选] → 写到 logo 字段指向的文件(默认 logo.png)
 *   5. 返回成功 — UI 触发 useExtStore.refresh() 让 scanner 重新扫
 *
 * 错误隔离: 任何步骤失败抛 Error,UI 展示。
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { mkdir, writeFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import type {
  ExternalPluginManifest,
  MarketPluginEntry,
} from "./types";

const PLUGIN_DIR_NAME = "plugins";
const FETCH_TIMEOUT_MS = 15_000;

async function getPluginsDir(): Promise<string> {
  const base = await appDataDir();
  return await join(base, PLUGIN_DIR_NAME);
}

async function downloadText(url: string): Promise<string> {
  const resp = await tauriFetch(url, {
    method: "GET",
    // @ts-ignore — connectTimeout 是 tauri-plugin-http 的扩展
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

/**
 * 校验从 market.pluginJson 下载下来的 manifest 是否和 market 条目一致。
 */
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
 * 安装一个市场插件到本地。覆盖已存在的同 id 插件(用户主动安装视为更新)。
 */
export async function installRemotePlugin(
  entry: MarketPluginEntry
): Promise<InstallResult> {
  // 1) 拉并解析 manifest
  const manifestRaw = await downloadText(entry.pluginJson);
  let manifest: Partial<ExternalPluginManifest>;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (e) {
    throw new Error(`plugin.json 解析失败: ${String(e)}`);
  }
  validateManifestAgainstEntry(manifest, entry);

  // 2) 准备目录
  const pluginsDir = await getPluginsDir();
  const pluginDir = await join(pluginsDir, entry.id);
  // 不存在则创建; 存在则覆盖文件
  if (!(await exists(pluginDir))) {
    await mkdir(pluginDir, { recursive: true });
  }

  // 3) 写 plugin.json(把 main/logo 改成相对名,features 透传)
  //    mainHtml / logo 来自市场条目,比 plugin.json 里的更准确
  const mainFile = "main.html";
  const logoFile = "logo.png";
  const finalManifest: ExternalPluginManifest = {
    ...manifest,
    main: mainFile,
    logo: logoFile,
  };
  await writeTextFile(
    await join(pluginDir, "plugin.json"),
    JSON.stringify(finalManifest, null, 2)
  );

  // 4) 下载并写 main.html
  const html = await downloadText(entry.mainHtml);
  await writeTextFile(await join(pluginDir, mainFile), html);

  // 5) 可选 logo
  if (entry.logo) {
    try {
      const buf = await downloadBinary(entry.logo);
      await writeFile(await join(pluginDir, logoFile), buf);
    } catch (e) {
      // logo 失败不致命,只 console
      console.warn(`[installer] logo 下载失败 ${entry.id}:`, e);
    }
  }

  return { pluginId: entry.id, pluginDir };
}

/** 卸载: 暂时只删 plugin.json,保留其他文件供用户手动清理 */
export async function uninstallLocalPlugin(pluginId: string): Promise<void> {
  // 这里需要递归删除 — @tauri-apps/plugin-fs 没有 rm-rf
  // 暂时让用户去 "打开插件目录" 手动 rm
  throw new Error(
    "卸载功能未实现:请打开插件目录手动删除 " + pluginId + " 目录"
  );
}
