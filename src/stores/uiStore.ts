import { create } from "zustand";
import { persist } from "zustand/middleware";

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

  toggleTheme: () => void;
  setTheme: (t: ThemeMode) => void;

  toggleStar: (key: string) => void;
  isStarred: (key: string) => boolean;

  pushRecent: (key: string) => void;

  setInput: (key: string, value: string) => void;
  clearInput: (key: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "light",
      starred: [],
      recent: [],
      inputs: {},

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
    }),
    {
      name: "z-biz-tool-box-ui",
      // 仅持久化这些字段
      partialize: (s) => ({
        theme: s.theme,
        starred: s.starred,
        recent: s.recent,
        inputs: s.inputs,
      }),
    }
  )
);
