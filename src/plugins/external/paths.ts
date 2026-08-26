/**
 * 外部插件目录路径 — 集中管理,避免 scanner / installer / UI 漂移。
 *
 * 选择 ~/.z-biz-tools/plugins/ 而不是 ~/Library/Application Support/<bundle>/plugins/ 的原因:
 *   - dot-folder 风格,跟 .cargo / .npm / .nvm 等工具一致,直观
 *   - 跨 bundle id 稳定 — 改 bundle 不会丢已装插件
 *   - 用户可以手动 cp/rsync 同步插件,不被 sandbox 隔离
 *   - 不在 macOS sandbox 默认允许的目录里,所以需要 explicit fs scope
 *     (见 src-tauri/capabilities/default.json)
 */

import { homeDir, join } from "@tauri-apps/api/path";

/** 顶级目录名(放在用户主目录下) */
export const ZBIZ_HOME_DIR = ".z-biz-tools";
/** 插件子目录 */
export const PLUGINS_DIR_NAME = "plugins";

/**
 * 解析外部插件目录绝对路径: /Users/<user>/.z-biz-tools/plugins/
 * 跨进程稳定(scanner + installer 共享同一函数)。
 */
export async function getPluginsDir(): Promise<string> {
  const home = await homeDir();
  return await join(home, ZBIZ_HOME_DIR, PLUGINS_DIR_NAME);
}

/** 解析顶级 ~/.z-biz-tools/ 路径(用于'打开插件目录'按钮) */
export async function getZbizHomeDir(): Promise<string> {
  const home = await homeDir();
  return await join(home, ZBIZ_HOME_DIR);
}
