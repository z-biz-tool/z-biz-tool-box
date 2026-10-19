/**
 * zBiz API 版本协商 — 宿主与外部插件之间的协议版本契约。
 *
 * ## 为什么需要
 *
 * 宿主与外部插件是**分别发布**的: 宿主升级后可能新增能力、改变既有方法的
 * 语义; 插件也可能比宿主新(用户先装插件, 后升级宿主)。如果没有版本字段,
 * 唯一的兼容策略就是"祈祷" —— 插件在旧宿主上静默拿不到新能力, 或者在
 * 新宿主上按旧语义调用而**行为异常但没有任何报错**。
 *
 * 有了版本字段, 宿主可以在加载时就说清楚:
 *  - 插件要求的版本比宿主新 ⇒ 明确拒绝并给出原因(而不是运行到一半才炸)
 *  - 插件的版本比宿主老 ⇒ 走兼容档(缺省按 "1" 处理, 见 DEFAULT_PLUGIN_API)
 *
 * ## 版本号形态
 *
 * 刻意用**字符串**而不是 semver 对象:
 *  - 协议版本是"接口世代", 不是"发行版本" —— 宿主 1.0.0 与 1.9.9 说的是同一件事
 *  - 字符串可以直接出现在 plugin.json 里, 不需要额外解析规则
 *  - 比较只看**主版本号**(整数), 小版本差异视为同一代
 *
 * 判别式: 主版本号不同 ⇒ 不兼容; 主版本号相同 ⇒ 兼容。
 */

/** 宿主当前实现的 zBiz 协议版本 */
export const HOST_API_VERSION = "1";

/** 宿主还能兼容的最老插件协议版本(低于此值直接拒绝) */
export const MIN_SUPPORTED_PLUGIN_API = "1";

/**
 * 插件没写 `zbizApi` 时按哪个版本处理。
 *
 * 取 "1" 而不是"最新": 老插件就是按第 1 代协议写的, 按最新版解释它
 * 才是危险的猜测。台账 05 的兼容条款写的也是「旧插件无 zbizApi 字段时
 * 视为 "1"」。
 */
export const DEFAULT_PLUGIN_API = "1";

/** 从 manifest 里读出插件声明的协议版本; 没写 / 写坏 ⇒ DEFAULT_PLUGIN_API */
export function parsePluginApiVersion(manifest: unknown): string {
  const rec = asRecord(manifest);
  const raw = rec?.zbizApi;
  if (typeof raw !== "string") return DEFAULT_PLUGIN_API;
  const v = raw.trim();
  if (!v) return DEFAULT_PLUGIN_API;
  return v;
}

/**
 * 取版本的主版本号。
 *
 * 只认 "数字" 开头的那一段: "2" → 2, "2.1" → 2, "v2" → 2, "2-beta" → 2。
 * 解析不出数字 ⇒ null(调用方按"不认识"处理, 不得当成 0)。
 */
export function majorVersion(version: string): number | null {
  const m = /^v?(\d+)/.exec(version.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export interface ApiCompat {
  /** 是否可加载 */
  ok: boolean;
  /** 插件声明(或缺省)的版本 */
  pluginApi: string;
  /** 不兼容时的可执行原因 */
  reason?: string;
}

/**
 * 兼容检查: 插件的协议版本能不能被当前宿主加载。
 *
 * 判据是"主版本号":
 *  - 插件主版本 > 宿主主版本 ⇒ 拒绝(插件要的能力宿主没有)
 *  - 插件主版本 < 最低支持版本 ⇒ 拒绝(太老, 宿主不再解释那套语义)
 *  - 其余 ⇒ 放行
 *
 * 解析不出主版本号 ⇒ 拒绝, **不放行**。理由: 一个连版本号都写不对的
 * manifest, 不该被当作"老插件"优待 —— 放行等于让未知的协议形态进来。
 */
export function checkApiCompatibility(pluginApi: string): ApiCompat {
  const api = pluginApi.trim() || DEFAULT_PLUGIN_API;
  const pluginMajor = majorVersion(api);
  const hostMajor = majorVersion(HOST_API_VERSION);
  const minMajor = majorVersion(MIN_SUPPORTED_PLUGIN_API);

  if (pluginMajor === null) {
    return {
      ok: false,
      pluginApi: api,
      reason: `无法识别插件的 zBiz 协议版本 "${api}"(应为形如 "1" 的版本号)`,
    };
  }
  if (hostMajor === null) {
    // 宿主自己的版本写坏了 —— 这是开发期错误, 但同样必须拒绝而不是放行
    return {
      ok: false,
      pluginApi: api,
      reason: `宿主 zBiz 协议版本异常: "${HOST_API_VERSION}"`,
    };
  }
  if (pluginMajor > hostMajor) {
    return {
      ok: false,
      pluginApi: api,
      reason: `插件要求 zBiz API v${pluginMajor}, 当前宿主只支持到 v${hostMajor}。请升级宿主。`,
    };
  }
  if (minMajor !== null && pluginMajor < minMajor) {
    return {
      ok: false,
      pluginApi: api,
      reason: `插件的 zBiz API v${pluginMajor} 已低于宿主支持的最低版本 v${minMajor}。`,
    };
  }
  return { ok: true, pluginApi: api };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
