import { create } from "zustand";
import type { ExternalPlugin } from "./types";
import { scanExternalPlugins } from "./scanner";

interface ExtState {
  plugins: ExternalPlugin[];
  loading: boolean;
  lastScan: number;
  /** 整次扫描失败的原因（目录读不了 / 非 Tauri 环境…）。单插件错误在 plugins[i].error 里。 */
  error: string | null;
  refresh: () => Promise<void>;
}

/** 把底层异常翻译成"发生了什么 + 能做什么"，不把 [object Object] 丢给用户 */
function describeScanError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/__TAURI|not defined|Cannot read properties of undefined|undefined is not an object/i.test(raw)) {
    return "当前环境读不到插件目录（只有桌面版支持外部插件）。浏览器预览时出现这条属预期。";
  }
  return `读取插件目录失败：${raw}`;
}

/**
 * 外部插件 store — 启动时 scan 一次,用户在 QuickOpen / Market 里也可手动 refresh。
 *
 * 设计: 不持久化(每次启动重新扫),但 directory 路径和 plugin.json 本身是用户控制的。
 */
export const useExtStore = create<ExtState>((set) => ({
  plugins: [],
  loading: false,
  lastScan: 0,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const plugins = await scanExternalPlugins();
      set({ plugins, loading: false, lastScan: Date.now() });
    } catch (e) {
      // 不能只 console.error：扫描失败时界面会显示"还没有插件"，
      // 那是把"错误"伪装成"空"（交互契约四·3）。
      console.error("[extStore.refresh]", e);
      set({ loading: false, error: describeScanError(e) });
    }
  },
}));

/**
 * App 启动时自动 scan 一次。
 * 调用方: App.tsx 在 useEffect 里 useExtStore.getState().refresh()
 */
export async function initExtStore(): Promise<void> {
  await useExtStore.getState().refresh();
}
