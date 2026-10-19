/**
 * 市场源 URL 安全判定 — 纯逻辑, 不依赖 Tauri。
 *
 * ## 为什么要单独一个模块
 *
 * `market.ts` 顶部就 import 了 `@tauri-apps/plugin-http`, 那个包在 node 里
 * 跑不起来 ⇒ 直接 import market.ts 就没法在 node --test 里断言。
 * 而"这个市场源是不是明文 http"恰恰是最该被断言的一条。
 * 所以把判定拆到这里, market.ts 再从这儿取。
 *
 * ## 规则
 *
 * 台账 T1.6: 市场源默认仅允许 HTTPS; HTTP 需显式"允许不安全源"开关 + UI 红色警告。
 *
 * 关键点: **默认就是拒绝 http**, 不是"默认允许 http 但打个警告"。
 * 一个需要用户主动去 Preferences 里打开的开关, 才是"显式"。
 * 同理, `http://localhost` 也不豁免 —— 内网联调确实要用 http, 但那正是
 * 用户自己清楚在干什么的场景, 让他点一次开关成本很低。
 */

/** 市场源 URL 非法 */
export class MarketUrlError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "MarketUrlError";
  }
}

export interface MarketUrlOptions {
  /**
   * 是否允许明文 http 源。
   * 缺省 false —— **默认拒绝 http**, 放宽必须是显式的。
   */
  allowInsecure?: boolean;
}

/**
 * 判断一个 URL 是不是**不安全**的市场源。
 *
 * 语义是"不是 https 就算不安全", 而不是"是 http 就算不安全":
 *  - https ⇒ 安全
 *  - http ⇒ 不安全(明文传输)
 *  - 其它协议 / 解析不出来 ⇒ **也**算不安全
 *
 * 为什么不精确判 http: 这是一个**安全谓词**, 判不准的时候必须往严里判。
 * 早期版本写成 `protocol === "http:"`, 结果 `file:///x` 这类非 http 的
 * 非法源被判成"安全" —— 而它恰恰是最不该被放行的那种。
 */
export function isInsecureMarketUrl(url: string): boolean {
  try {
    return new URL(url.trim()).protocol !== "https:";
  } catch {
    return true;
  }
}

/**
 * 校验市场源 base URL, 并去掉末尾的 "/" 便于拼接。
 *
 * @throws MarketUrlError 协议不受支持 / URL 非法 / http 源但未显式放行
 */
export function validateMarketUrl(url: string, opts: MarketUrlOptions = {}): string {
  const allowInsecure = opts.allowInsecure === true;
  const v = url.trim();
  if (!v) throw new MarketUrlError("URL 不能为空");
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new MarketUrlError("不是合法的 URL");
  }
  if (parsed.protocol === "https:") {
    return parsed.toString().replace(/\/+$/, "");
  }
  if (parsed.protocol === "http:") {
    if (!allowInsecure) {
      throw new MarketUrlError(
        "市场源默认只允许 HTTPS。如确实需要 http 明文源, 请先在「设置」里打开「允许不安全市场源」。",
      );
    }
    return parsed.toString().replace(/\/+$/, "");
  }
  throw new MarketUrlError(`不支持的协议: ${parsed.protocol}`);
}
