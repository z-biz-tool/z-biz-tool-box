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
