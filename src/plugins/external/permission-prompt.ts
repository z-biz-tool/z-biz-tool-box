/**
 * 敏感 API 首次调用确认 — 状态机部分(纯逻辑)。
 *
 * ## 为什么需要
 *
 * 权限声明解决的是"插件**能不能**调", 解决不了"用户**是否知情**"。
 * 一个声明了 `clipboard.read` 的插件, 装上后可以无声无息地读走剪贴板里的
 * 验证码 —— 用户在市场列表上看到的只是一句描述。
 *
 * 台账 T2.6 要求: 敏感 API 首次调用时弹一次「允许 / 拒绝 / 始终允许」。
 *
 * ## 三个选项的差别
 *
 *  - 允许: 本次会话内放行, 之后再调用**不再问**
 *  - 拒绝: 本次会话内拒绝, 之后再调用**不再问**(插件作者会收到 PermissionDenied)
 *  - 始终允许: 放行, 且**跨会话**记住
 *
 * 「拒绝」也记住, 是为了让插件能拿到一个明确的失败而不是无限弹窗 ——
 * 无限弹窗既骚扰用户, 又给了插件一个反复试探的通道。
 *
 * ## 作用域: 按插件 + 方法
 *
 * 决定记在 `pluginId:method` 上, 绝不全局。
 * 否则 A 插件点的「始终允许」会顺带放行 B 插件 —— 那正是"权限按插件隔离"
 * 这条原则最容易被打破的地方。
 */

/** 用户可选的三种回答 */
export type PromptAnswer = "allow" | "deny" | "always";

/** 一次调用的判定结果 */
export type PromptOutcome = "allow" | "deny" | "ask";

/** 状态: 会话内的决定 + 跨会话的"始终允许" */
export interface PromptState {
  /** key → 决定(会话内有效) */
  readonly session: ReadonlyMap<string, PromptAnswer>;
  /** key 集合(跨会话有效, 对应"始终允许") */
  readonly always: ReadonlySet<string>;
}

/** 需要确认的桥接方法 */
export const SENSITIVE_METHODS: readonly string[] = ["readClipboard", "invoke"];

/** 需要确认的后端命令(invoke 之下) */
export const SENSITIVE_COMMANDS: readonly string[] = ["http_request"];

/** 敏感能力的人话说明, 给确认弹窗用 */
export const SENSITIVE_LABELS: Record<string, string> = {
  readClipboard: "读取你的系统剪贴板（可能包含验证码、密码、地址）",
  "invoke:http_request": "以你的名义发起网络请求（可访问内网服务）",
};

export function createPromptState(): PromptState {
  return { session: new Map(), always: new Set() };
}

/**
 * 确认项的键 —— 按插件 + 方法(命令) 隔离。
 *
 * 形状: `pluginId:method` 或 `pluginId:invoke:cmd`
 */
export function promptKey(pluginId: string, method: string, cmd?: string): string {
  return cmd ? `${pluginId}:${method}:${cmd}` : `${pluginId}:${method}`;
}

/** 该方法是否需要确认 */
export function isSensitiveMethod(method: string, cmd?: string): boolean {
  if (method === "readClipboard") return true;
  if (method === "invoke") return cmd ? SENSITIVE_COMMANDS.includes(cmd) : false;
  return false;
}

/** 确认弹窗要展示的风险说明 */
export function describePrompt(method: string, cmd?: string): string {
  const key = cmd ? `${method}:${cmd}` : method;
  return SENSITIVE_LABELS[key] ?? SENSITIVE_LABELS[method] ?? "该操作会使用敏感能力";
}

/**
 * 判定一次调用是否需要弹窗。
 *
 * 顺序不能换: 「始终允许」是跨会话的, 必须**先**于会话内决定被查 ——
 * 否则用户点过一次「始终允许」, 重启后又被当成"还没决定过"再问一遍。
 */
export function evaluatePrompt(state: PromptState, key: string): PromptOutcome {
  if (state.always.has(key)) return "allow";
  const decided = state.session.get(key);
  if (decided === "allow") return "allow";
  if (decided === "deny") return "deny";
  return "ask";
}

/**
 * 记下一次回答, 返回**新**状态(不改旧对象, 便于 React 里做不可变更新)。
 */
export function recordAnswer(
  state: PromptState,
  key: string,
  answer: PromptAnswer,
): PromptState {
  const session = new Map(state.session);
  const always = new Set(state.always);
  if (answer === "always") {
    always.add(key);
    // 记了"始终允许"就不要再留一条会话内的相反决定
    session.delete(key);
  } else {
    session.set(key, answer);
  }
  return { session, always };
}
