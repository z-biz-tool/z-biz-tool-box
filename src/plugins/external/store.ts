import { create } from "zustand";
import type { ExternalPlugin } from "./types";
import { scanExternalPlugins } from "./scanner";

interface ExtState {
  plugins: ExternalPlugin[];
  loading: boolean;
  lastScan: number;
  refresh: () => Promise<void>;
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
  refresh: async () => {
    set({ loading: true });
    try {
      const plugins = await scanExternalPlugins();
      set({ plugins, loading: false, lastScan: Date.now() });
    } catch (e) {
      console.error("[extStore.refresh]", e);
      set({ loading: false });
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
