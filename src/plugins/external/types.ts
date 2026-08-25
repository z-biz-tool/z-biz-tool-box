/// <reference types="vite/client" />

/**
 * 外部插件目录结构:
 *   ~/Library/Application Support/com.zifang.z-biz-tool-box/plugins/
 *     └── {plugin-id}/
 *         ├── plugin.json     # 必需,描述插件
 *         ├── main.html       # 必需,入口 HTML
 *         ├── logo.png        # 可选,图标
 *         └── preload.js      # 可选,沙箱加载前执行的脚本
 *
 * 一个 plugin.json 对应一个可被搜索/唤起的"feature"集合。
 * 一个插件可注册多个 features(类似 utools)。
 *
 * main.html 在 iframe 中加载,主应用通过 `window.zBiz` 暴露受限 API。
 * 通过 `convertFileSrc` 把本地路径映射成 tauri:// 协议,实现同源 iframe。
 */

export interface ExternalPluginFeature {
  /** feature 唯一 code,主搜索框输入此 code 直接触发 */
  code: string;
  /** 一句话说明,显示在搜索列表 */
  explain: string;
  /** 触发关键字数组(空格分隔的词),任一命中都触发 */
  cmds?: string[];
  /** feature 内部 icon URL(可选,缺省用 plugin.logo) */
  icon?: string;
}

export interface ExternalPluginManifest {
  /** 唯一 id,反向域名风格,如 "com.zifang.hello-utools" */
  id: string;
  /** 插件中文名 */
  name: string;
  /** 描述 */
  description: string;
  /** 版本,自由格式 */
  version: string;
  /** 作者 */
  author?: string;
  /** 入口文件名(相对插件目录),默认 main.html */
  main?: string;
  /** 图标文件名,默认 logo.png */
  logo?: string;
  /** features 数组,每个 feature 是一个可独立触发的入口 */
  features: ExternalPluginFeature[];
}

/**
 * 已加载的外部插件 + 解析后的运行时数据。
 * 由 scanner 解析 plugin.json 后产生,被 UI 层消费。
 */
export interface ExternalPlugin extends ExternalPluginManifest {
  /** 插件目录绝对路径 */
  dirPath: string;
  /** main 文件的 tauri:// URL(同源) */
  mainUrl: string;
  /** logo 的 tauri:// URL(可选) */
  logoUrl?: string;
  /** 加载时错误,如果有 */
  error?: string;
}

// =====================================================================
// 远程市场源 (Market Source) — 用户可配置的插件仓库 URL
// =====================================================================

/**
 * 市场源 URL 必须返回符合 MarketIndex 的 JSON。
 * 当前 schemaVersion = 1。
 *
 * 校验规则(被 market.ts validateIndex 实现):
 *   - top-level: { schemaVersion: 1, name: string, plugins: [...] }
 *   - 每个 plugin: { id, name, version, pluginJson, mainHtml }
 *     pluginJson: 远程 plugin.json 的 URL
 *     mainHtml:   远程 main.html 的 URL(会被下载到本地)
 *     logo:       远程 logo.png 的 URL(可选)
 *
 * 安装流程:
 *   1. fetch(downloadUrl) → downloadUrl 是 index.json 的 URL,返回 MarketIndex
 *   2. 用户点安装 → installer.fetchPluginFiles(plugin)
 *      - 下载 pluginJson URL → 写到本地 plugins/{id}/plugin.json
 *      - 下载 mainHtml URL  → 写到本地 plugins/{id}/main.html
 *      - 下载 logo URL     → 写到本地 plugins/{id}/logo.png
 *   3. 触发 scanner.refresh() → 跟本地插件同等待遇
 */
export interface MarketPluginEntry {
  /** 插件 id,反向域名风格 */
  id: string;
  /** 显示名 */
  name: string;
  /** 描述 */
  description: string;
  /** 版本字符串,如 "1.0.0" */
  version: string;
  /** 作者 */
  author?: string;
  /** 主页 */
  homepage?: string;
  /** 标签 */
  tags?: string[];
  /** 远程 plugin.json 的 URL */
  pluginJson: string;
  /** 远程 main.html 的 URL */
  mainHtml: string;
  /** 远程 logo.png 的 URL(可选) */
  logo?: string;
}

export interface MarketIndex {
  schemaVersion: 1;
  /** 市场显示名 */
  name: string;
  /** 市场描述 */
  description?: string;
  /** 市场主页 */
  homepage?: string;
  /** 最后更新时间 ISO 8601 */
  updatedAt?: string;
  /** 插件列表 */
  plugins: MarketPluginEntry[];
}

/**
 * 用户配置的市场源 — 持久化在 zustand store。
 *
 * url 必须 https:// 开头(本地开发可放宽到 http://localhost / 127.0.0.1)。
 * cachedIndex 缓存最近一次成功拉取的索引,失败时不覆盖。
 */
export interface MarketSource {
  /** 内部 id(uuid v4 短串) */
  id: string;
  /** 市场源 URL — GET 这个 URL 应返回 MarketIndex JSON */
  url: string;
  /** 用户给这个源起的别名(可空,默认显示 URL host) */
  label?: string;
  /** 是否启用 — 禁用时不参与 fetch 和显示 */
  enabled: boolean;
  /** 上次成功拉取时间(unix ms) */
  lastFetchAt?: number;
  /** 上次拉取错误信息(成功时清空) */
  lastError?: string;
  /** 上次成功拉取缓存的 index,失败时保留 */
  cachedIndex?: MarketIndex;
}
