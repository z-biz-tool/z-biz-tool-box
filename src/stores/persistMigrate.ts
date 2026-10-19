/**
 * uiStore 持久化数据的版本与迁移 — 纯逻辑。
 *
 * ## 为什么需要版本号
 *
 * zustand 的 persist 默认是"整个 state 覆盖式恢复": 存了什么就读回什么。
 * 于是**新增字段**在老用户身上是 undefined(不是默认值), **改语义**的老数据
 * 又会被原样读回 —— 两种情况都不会报错, 只是一直不对。
 *
 * 显式版本号 + 迁移函数把这件事变成可见的: 每次改持久化结构, 就把版本
 * 加一, 写一条从旧版到新版的迁移。
 *
 * ## 迁移原则
 *
 * 1. **只做加法, 不做删改**。用户已有的输入、收藏、市场源一律保留 ——
 *    丢数据换"结构干净"是最差的交易。
 * 2. **缺字段用默认值补齐**, 而不是删掉整个 state。
 * 3. **不认识的老字段原样留着**: 多余的键不会有害(zustand 只读它认识的),
 *    而擅自删掉会让"这份数据从哪来"无法追溯。
 * 4. 迁移函数**必须纯**: 不碰 localStorage、不碰时间、不碰随机数。
 *    同样的输入必须得到同样的输出, 否则没法测。
 */

/** 当前持久化结构的版本 */
export const UI_STORE_VERSION = 1;

/** v0 的结构: 没有 version 字段, 也没有两个安全开关 */
export const UI_STORE_VERSION_V0 = 0;

/**
 * 迁移函数。
 *
 * @param persisted 读回来的旧 state(可能是任意形状, 甚至不是对象)
 * @param fromVersion 读回来的版本号(缺 version 字段 ⇒ 0)
 * @returns 迁移后的 state 与新版本号
 */
export function migrateUiState(
  persisted: unknown,
  fromVersion: number,
): { state: Record<string, unknown>; version: number } {
  const rec = isRecord(persisted) ? persisted : {};

  if (fromVersion >= UI_STORE_VERSION) {
    // 已是当前版本(或来自更未来的版本): 原样带回, 不做改写。
    // 来自未来版本时原样保留是刻意的 —— 降级应用时不该把新版本的数据改坏,
    // 顶多是不认识新字段而已。
    return { state: { ...rec }, version: UI_STORE_VERSION };
  }

  // v0 → v1: 补两个安全开关。
  // 关键: 缺省必须是 **false**。
  // 老用户没做过这个选择, 把他当成"同意不安全连接"是替用户做决定;
  // 而"默认不安全"比"默认安全"危险得多。
  const state: Record<string, unknown> = {
    ...rec,
    allowInsecureCerts: rec.allowInsecureCerts === true,
    allowInsecureSources: rec.allowInsecureSources === true,
  };

  return { state, version: UI_STORE_VERSION };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
