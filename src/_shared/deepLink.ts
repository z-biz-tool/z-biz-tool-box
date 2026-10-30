/**
 * zbiz:// 深链接的**box 语义层**。
 *
 * ## 分工
 *
 * | 层 | 在哪 | 管什么 |
 * |----|----|--------|
 * | 协议 | `z-biz-tool-shared/src/protocol/deeplink.ts` | 字节级编解码（金标 = Rust `cap-hub`） |
 * | 机制 | `z-biz-tool-shared/src/protocol/deeplinkReceiver.ts` | 冷启动补取、事件监听、不静默吞掉 |
 * | **语义** | **本文件** | **收到深链后 box 该做什么** |
 *
 * ## box 支持的动作
 *
 * | action | 含义 |
 * |--------|------|
 * | `tool` | 打开某个工具（带 `key` 参数，如 `key=db`） |
 * | `open` | 只说要 box（不带 key）⇒ 回首页（spotlight） |
 *
 * ## 支持的参数
 *
 * | 参数 | 作用 |
 * |------|------|
 * | `key` | 要打开的工具 key，必须在 `TOOL_KEYS` 里 |
 * | `from` | 发送方，仅用于日志与回执 |
 */

import type { Handoff } from "z-biz-tool-shared/protocol";

/**
 * Rust 侧 `cap_hub::Handoff` 的镜像。
 *
 * 名字叫 `HandoffItem` 是为了在本仓内部读起来更顺（本仓此前一直用这个名字），
 * 实质就是共享层的 `Handoff`。
 */
export type { Handoff as HandoffItem } from "z-biz-tool-shared/protocol";

/**
 * box 的深链结果。
 *
 * `toolKey` 非 null 表示要切到某个工具页；
 * `problem` 非 null 表示接不住 —— 前端必须给可见提示（不静默吞掉）。
 */
export interface BoxDeepLinkOutcome {
  /** 要打开的工具 key；null 表示不带工具意图 */
  toolKey: string | null;
  /** 发送方（from），仅用于提示与日志 */
  from: string | null;
  /** 无法适配时的原因 */
  problem: string | null;
}

/**
 * 把一条深链翻译成 box 内的动作。
 *
 * 纯函数 —— 不碰 store、不碰 Tauri，所以可以直接单测。
 *
 * @param item     深链
 * @param toolKeys 本仓可路由的工具 key 集合（由调用方传入，避免本模块依赖 tools.ts）
 */
export function resolveBoxDeepLink(
  item: Handoff,
  toolKeys: readonly string[],
): BoxDeepLinkOutcome {
  const outcome: BoxDeepLinkOutcome = {
    toolKey: null,
    from: item.params.from ?? null,
    problem: null,
  };

  const key = item.params.key?.trim() ?? "";
  const action = item.action.trim() || "open";

  if (key) {
    if (toolKeys.includes(key)) {
      outcome.toolKey = key;
    } else {
      // 不认识的工具名要说清楚是哪个 —— 用户拼错了得让他知道拼错在哪
      outcome.problem = `box 里没有这个工具：${key}`;
    }
    return outcome;
  }

  // 只说要 box 但没点名工具的，回首页
  if (action === "open") {
    outcome.toolKey = "spotlight";
    return outcome;
  }

  outcome.problem = `不认识的动作 ${action}`;
  return outcome;
}
