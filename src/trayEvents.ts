/**
 * 托盘（tray）事件的纯解析逻辑 —— 与 Tauri 解耦，便于单测。
 *
 * 背景（台账 T2.5）：Rust 点菜单项后 `app.emit("select-tool", key)`。
 * 前端若把 payload 直接塞给路由，会有两种"看起来能用、其实不对"的情况：
 *   - payload 是空串 / 非字符串（Rust 侧改字段或事件复用）⇒ 白屏级空视图；
 *   - payload 是已禁用或已被删掉的工具 key ⇒ 进到「工具未加载」空态，
 *     用户以为点了没反应，日志里也看不出是托盘传了个旧 key。
 * 所以这里统一校验：**只接受注册表里还存在、且非空**的 key，其余返回 null，
 * 由调用方记一条日志并保持当前视图不动。
 */

/** 托盘 payload 的长度上限：正常 key 都是几十字符，超长一律视为异常 */
const MAX_KEY_LEN = 200;

/**
 * @param payload Rust 事件载荷（unknown：不假设对端一定发字符串）
 * @param knownKeys 当前注册表里的工具 key
 * @returns 可路由的工具 key；不合法返回 null
 */
export function resolveTrayToolKey(
  payload: unknown,
  knownKeys: readonly string[]
): string | null {
  if (typeof payload !== "string") return null;
  const key = payload.trim();
  if (!key || key.length > MAX_KEY_LEN) return null;
  return knownKeys.includes(key) ? key : null;
}

/**
 * 托盘「未安装的兄弟应用」事件载荷：只需要非空字符串。
 * 与 select-tool 分开是因为兄弟 key 不在工具注册表里。
 */
export function resolveBrotherKey(payload: unknown): string | null {
  if (typeof payload !== "string") return null;
  const key = payload.trim();
  if (!key || key.length > MAX_KEY_LEN) return null;
  return key;
}
