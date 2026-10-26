/**
 * 前端运行期错误 → 落盘日志(台账 T4.6)。
 *
 * ## 为什么要有
 *
 * 这是一个菜单栏常驻的应用: 用户遇到"点不动了"的时候, 窗口可能早就关了,
 * 控制台早就滚走了。**没有日志就只能靠猜**。
 *
 * ## 落盘路径
 *
 * `~/.z-biz-tools/logs/z-biz-YYYY-MM-DD.log` —— 经 Rust 的 `write_log` command
 * 写入(见 src-tauri/src/logging.rs)。刻意走 command 而不是前端直接写文件:
 * capability 里没有给前端任意写文件的权限, 硬塞一个只会扩大攻击面。
 *
 * ## 为什么要"上报失败也不能抛"
 *
 * 错误处理本身出错, 是最讽刺的一种故障。所以这里的每一步都吞掉异常:
 * 日志写不进去, 顶多是少一条记录; 但如果这里抛出去, 会把原始错误盖掉,
 * 让排查变得**更难**而不是更容易。
 */
import { invoke } from "@tauri-apps/api/core";

/** 单条日志的最大长度(防某个错误对象序列化出几 MB) */
const MAX_MESSAGE_LEN = 4000;

/** 把任意异常对象转成一行可读的文本 */
export function formatError(value: unknown): string {
  let text: string;
  if (value instanceof Error) {
    text = `${value.name}: ${value.message}`;
    if (value.stack) text += `\n${value.stack}`;
  } else if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      // 循环引用 / BigInt 等无法 JSON 化的值
      text = String(value);
    }
  }
  if (text.length > MAX_MESSAGE_LEN) {
    text = `${text.slice(0, MAX_MESSAGE_LEN)}…(已截断)`;
  }
  return text;
}

/**
 * 写一条日志。失败**不抛**。
 */
export function writeFrontendLog(level: string, message: string): void {
  try {
    // 不 await: 错误处理路径不该 await 任何可能失败的东西。
    // 落盘失败只能退回控制台 —— 再走一遍桥会递归。
    void invoke("write_log", { level, message }).catch((e) => {
      console.warn("[box] 前端日志落盘失败（best-effort，仅控制台可见）", e);
    });
  } catch (e) {
    console.warn("[box] 前端日志落盘失败（best-effort，仅控制台可见）", e);
  }
}

/**
 * 装上前端错误监听。返回一个卸载函数(便于测试时摘掉)。
 */
export function installFrontendErrorLogging(): () => void {
  const onError = (ev: ErrorEvent) => {
    writeFrontendLog(
      "error",
      `window.onerror: ${ev.message} @ ${ev.filename}:${ev.lineno}:${ev.colno}\n${formatError(ev.error)}`,
    );
  };
  const onRejection = (ev: PromiseRejectionEvent) => {
    writeFrontendLog("error", `unhandledrejection: ${formatError(ev.reason)}`);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
