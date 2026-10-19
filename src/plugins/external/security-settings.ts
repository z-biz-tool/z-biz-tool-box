/**
 * 安全开关的读取入口 — 非 React 代码(安装器等)从这里拿用户的选择。
 *
 * 为什么不在各处直接 `useUiStore.getState()`:
 * 那样"用户到底允不允许不安全源"这件事会散落在十几个调用点上,
 * 将来改语义(比如把开关改成"仅本次会话")就会漏改某几处。
 * 这里收成一个口子, 语义只有这一份。
 */
import { useUiStore } from "../../stores/uiStore";

/** 用户是否允许关闭 TLS 证书校验(台账 T1.1) */
export function allowInsecureCerts(): boolean {
  return useUiStore.getState().allowInsecureCerts === true;
}

/** 用户是否允许明文 http 市场源(台账 T1.6) */
export function allowInsecureSources(): boolean {
  return useUiStore.getState().allowInsecureSources === true;
}
