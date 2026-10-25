// tray 菜单与前端的唯一出口。
//
// 为什么要单独一个模块：Rust 的 `register_tools` 需要「当前启用的工具分组」，
// 而这个数据在前端的注册表（TOOL_GROUPS）和偏好 store（disabled）里。
// App 挂载时要推一次、装完兄弟应用后还要再推一次（tray 的「兄弟应用」子菜单
// 是 Rust 侧扫出来的，装完不推就还是旧的）⇒ 两处都要用同一份逻辑，
// 放一个模块里免得两处各写一份、慢慢漂移。
import { invoke } from "@tauri-apps/api/core";
import { TOOL_GROUPS } from "./tools";
import { useUiStore } from "./stores/uiStore";

/**
 * 把当前启用的工具分组推给 Rust，让它重建 tray 菜单。
 *
 * - 只推**启用中**的工具：被关掉的工具不该出现在菜单里；
 * - 空分组不推：Rust 侧会为每个 group 建一个子菜单，空的会变成"点开什么都没有"；
 * - 失败不抛：tray 菜单是锦上添花，推失败不能把主窗口带崩。
 */
export async function pushTrayTools(disabled?: string[]): Promise<void> {
  const off = disabled ?? useUiStore.getState().disabled;
  const groups = TOOL_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    tools: g.tools
      .filter((t) => !off.includes(t.key))
      .map((t) => ({ key: t.key, label: t.label })),
  })).filter((g) => g.tools.length > 0);
  try {
    await invoke("register_tools", { groups });
  } catch {
    /* tray 推失败不该影响主界面 */
  }
}
