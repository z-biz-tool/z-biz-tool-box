import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MarketList, MarketSource } from "../plugins/external/types";

export type ThemeMode = "light" | "dark";

interface UiState {
  /** 当前主题模式 */
  theme: ThemeMode;
  /** 收藏的工具 key 列表 */
  starred: string[];
  /** 最近使用的工具 key 列表（最多 8 个，最新在前） */
  recent: string[];

  /**
   * 每个工具的最近输入值,key = plugin key, value = 上次输入文本。
   * 用于切到别的工具再切回来时不丢工作上下文。
   */
  inputs: Record<string, string>;

  /**
   * 禁用的工具 key 列表(用户主动隐藏)。空数组 = 全部启用。
   * 禁用后从侧边栏/QuickOpen 过滤,但 PluginMarket 里仍可见/可重新启用。
   */
  disabled: string[];

  /**
   * 用户配置的远程市场源(base URL 列表)。每个源 GET {url}/list 得 MarketList。
   * 持久化在 localStorage,启用/禁用/增删改查都在这里。
   */
  marketSources: MarketSource[];

  toggleTheme: () => void;
  setTheme: (t: ThemeMode) => void;

  toggleStar: (key: string) => void;
  isStarred: (key: string) => boolean;

  pushRecent: (key: string) => void;

  setInput: (key: string, value: string) => void;
  clearInput: (key: string) => void;

  toggleDisabled: (key: string) => void;
  isDisabled: (key: string) => boolean;
  setDisabled: (disabled: string[]) => void;

  // ---- 市场源操作 ----
  addMarketSource: (url: string, label?: string) => string;
  removeMarketSource: (id: string) => void;
  toggleMarketSource: (id: string) => void;
  renameMarketSource: (id: string, label: string) => void;
  setMarketSourceCache: (id: string, list: MarketList) => void;
  setMarketSourceError: (id: string, error: string) => void;
}

/** 生成简短的本地唯一 id(无外部依赖) */
function genId(): string {
  return `ms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "light",
      starred: [],
      recent: [],
      inputs: {},
      disabled: [],
      marketSources: [],

      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      setTheme: (t) => set({ theme: t }),

      toggleStar: (key) =>
        set((s) => ({
          starred: s.starred.includes(key)
            ? s.starred.filter((k) => k !== key)
            : [...s.starred, key],
        })),
      isStarred: (key) => get().starred.includes(key),

      pushRecent: (key) =>
        set((s) => ({
          recent: [key, ...s.recent.filter((k) => k !== key)].slice(0, 8),
        })),

      setInput: (key, value) =>
        set((s) => ({ inputs: { ...s.inputs, [key]: value } })),
      clearInput: (key) =>
        set((s) => {
          const { [key]: _, ...rest } = s.inputs;
          return { inputs: rest };
        }),

      toggleDisabled: (key) =>
        set((s) => ({
          disabled: s.disabled.includes(key)
            ? s.disabled.filter((k) => k !== key)
            : [...s.disabled, key],
        })),
      isDisabled: (key) => get().disabled.includes(key),
      setDisabled: (disabled) => set({ disabled }),

      // ---- 市场源 ----
      addMarketSource: (url, label) => {
        const id = genId();
        set((s) => ({
          marketSources: [
            ...s.marketSources,
            { id, url: url.trim(), label, enabled: true },
          ],
        }));
        return id;
      },
      removeMarketSource: (id) =>
        set((s) => ({
          marketSources: s.marketSources.filter((m) => m.id !== id),
        })),
      toggleMarketSource: (id) =>
        set((s) => ({
          marketSources: s.marketSources.map((m) =>
            m.id === id ? { ...m, enabled: !m.enabled } : m
          ),
        })),
      renameMarketSource: (id, label) =>
        set((s) => ({
          marketSources: s.marketSources.map((m) =>
            m.id === id ? { ...m, label: label.trim() || undefined } : m
          ),
        })),
      setMarketSourceCache: (id, list) =>
        set((s) => ({
          marketSources: s.marketSources.map((m) =>
            m.id === id
              ? { ...m, cachedList: list, lastFetchAt: Date.now(), lastError: undefined }
              : m
          ),
        })),
      setMarketSourceError: (id, error) =>
        set((s) => ({
          marketSources: s.marketSources.map((m) =>
            m.id === id ? { ...m, lastError: error } : m
          ),
        })),
    }),
    {
      name: "z-biz-tool-box-ui",
      partialize: (s) => ({
        theme: s.theme,
        starred: s.starred,
        recent: s.recent,
        inputs: s.inputs,
        disabled: s.disabled,
        // 市场源完整持久化(配置 + 最近一次成功缓存,下次启动省一次 fetch)
        marketSources: s.marketSources,
      }),
    }
  )
);
