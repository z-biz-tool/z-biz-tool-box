/**
 * 外部插件扫描器 — 启动时 + 用户手动刷新时调用。
 *
 * 扫描 ~/.z-biz-tools/plugins/, 每个子目录读 plugin.json,解析成 ExternalPlugin。
 * 异常隔离: 单个插件出错不影响其他插件加载。
 */
import { readDir, readTextFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ExternalPlugin, ExternalPluginManifest } from "./types";
import { getPluginsDir } from "./paths";

let cachedDir: string | null = null;
async function pluginsDir(): Promise<string> {
  if (cachedDir) return cachedDir;
  cachedDir = await getPluginsDir();
  return cachedDir;
}

/**
 * 扫描插件目录,返回所有合法外部插件。
 * 失败/不合法的会被记录到 error 字段,不抛异常。
 */
export async function scanExternalPlugins(): Promise<ExternalPlugin[]> {
  const dir = await pluginsDir();
  let entries: Awaited<ReturnType<typeof readDir>> = [];
  try {
    entries = await readDir(dir);
  } catch {
    // 目录不存在 → 空列表
    return [];
  }

  const results: ExternalPlugin[] = [];
  for (const entry of entries) {
    if (entry.name?.startsWith(".")) continue; // 跳过 .DS_Store 等
    const dirPath = await join(dir, entry.name ?? entry);
    const manifestPath = await join(dirPath, "plugin.json");
    const plugin = await loadOnePlugin(dirPath, manifestPath, entry.name ?? String(entry));
    if (plugin) results.push(plugin);
  }
  return results;
}

async function loadOnePlugin(
  dirPath: string,
  manifestPath: string,
  fallbackId: string
): Promise<ExternalPlugin | null> {
  try {
    if (!(await exists(manifestPath))) return null;
    const raw = await readTextFile(manifestPath);
    const m = JSON.parse(raw) as ExternalPluginManifest;

    // 基础校验
    if (!m.id || !m.name || !Array.isArray(m.features) || m.features.length === 0) {
      return { ...m, id: m.id || fallbackId, name: m.name || fallbackId, version: "", description: "", features: [], dirPath, mainUrl: "", error: "plugin.json 缺少 id/name/features" };
    }

    const mainFile = m.main ?? "main.html";
    const logoFile = m.logo ?? "logo.png";
    const mainPath = await join(dirPath, mainFile);
    const logoPath = await join(dirPath, logoFile);

    // convertFileSrc 把绝对路径 → asset://localhost/... URL(与宿主跨源,
    // 需 Cargo features 开 protocol-asset + tauri.conf.json 配 assetProtocol)
    const mainUrl = convertFileSrc(mainPath);
    let logoUrl: string | undefined;
    try {
      if (await exists(logoPath)) logoUrl = convertFileSrc(logoPath);
    } catch {
      // 图标可选,失败忽略
    }

    return { ...m, dirPath, mainUrl, logoUrl };
  } catch (e) {
    return {
      id: fallbackId,
      name: fallbackId,
      version: "",
      description: "",
      features: [],
      dirPath,
      mainUrl: "",
      error: String(e),
    };
  }
}

/** 暴露给 UI,用户在 QuickOpen 或 PluginMarket 里可一键打开插件目录 */
export async function openPluginsDir(): Promise<void> {
  const dir = await pluginsDir();
  const { open } = await import("@tauri-apps/plugin-shell");
  await open(dir);
}

/**
 * 卸载本地外部插件: 删 ~/.z-biz-tools/plugins/{id}/ 整个目录
 * 调 Rust command `uninstall_plugin` (用 std::fs::remove_dir_all 支持递归)
 * @throws 失败抛 Error(UI 弹 message)
 */
export async function uninstallLocalPlugin(pluginId: string): Promise<void> {
  if (!/^[a-zA-Z0-9._-]+$/.test(pluginId)) {
    throw new Error(`非法 plugin id: ${pluginId}`);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("uninstall_plugin", { id: pluginId });
  // 触发 scanner 重新加载
  await scanExternalPlugins();
}
