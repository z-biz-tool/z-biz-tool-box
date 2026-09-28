import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { MarketList, MarketSource } from "../plugins/external/types";

export type ThemeMode = "light" | "dark";

/** 持久化 key(沿用旧值, 不迁数据) */
const PERSIST_KEY = "z-biz-tool-box-ui";
/** 单个工具状态槽的字节上限: 超出就不落盘, 只在内存里保留 */
const MAX_SLOT_BYTES = 64 * 1024;
/** 整份 UI 状态的软上限, 超出后按槽位大小淘汰 */
const MAX_TOTAL_BYTES = 1.5 * 1024 * 1024;
/** 合并高频写入(逐字符输入) */
const WRITE_DEBOUNCE_MS = 400;

const isQuotaError = (e: unknown): boolean => {
  const err = e as { name?: string; code?: number } | null;
  return (
    err?.name === "QuotaExceededError" ||
    err?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err?.code === 22
  );
};

/** 从序列化串里丢掉超大/过多的工具槽, 给配额腾地方 */
function shrinkPersisted(raw: string): string {
  let parsed: { state?: Record<string, unknown> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  const state = parsed.state;
  if (!state || typeof state !== "object") return raw;
  for (const field of ["toolStates", "inputs"] as const) {
    const bag = state[field];
    if (!bag || typeof bag !== "object") continue;
    const entries = Object.entries(bag as Record<string, string>)
      .filter(([, v]) => typeof v === "string")
      .sort((a, b) => b[1].length - a[1].length);
    const kept: Record<string, string> = {};
    let used = 0;
    for (const [k, v] of entries) {
      if (v.length > MAX_SLOT_BYTES || used + v.length > MAX_TOTAL_BYTES) continue;
      used += v.length;
      kept[k] = v;
    }
    state[field] = kept;
  }
  return JSON.stringify(parsed);
}

/**
 * localStorage 包装: 写入防抖 + 配额溢出降级重试。
 * 满了就淘汰最大的工具槽, 再失败就放弃这次写入(内存状态不受影响)。
 */
function createPersistStorage(): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queued: string | null = null;

  const write = (value: string) => {
    try {
      localStorage.setItem(PERSIST_KEY, value);
      return;
    } catch (e) {
      if (!isQuotaError(e)) {
        console.warn("[uiStore] 持久化写入失败", e);
        return;
      }
    }
    try {
      localStorage.setItem(PERSIST_KEY, shrinkPersisted(value));
    } catch (e) {
      console.warn("[uiStore] 存储已满, 本次状态未持久化", e);
    }
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (queued !== null) {
      const value = queued;
      queued = null;
      write(value);
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (_name, value) => {
      queued = value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    removeItem: (name) => localStorage.removeItem(name),
  };
}

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
   * 工具状态槽: key = `${toolKey}:${slot}`, value = JSON 串。
   * 让工具里的 select/number/mode 等非文本状态也跟着 reload 存活(文本仍走 inputs)。
   */
  toolStates: Record<string, string>;

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

  /** 写入工具状态槽; value = undefined 时删除该槽 */
  setToolState: (key: string, value: string | undefined) => void;

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
      toolStates: {},
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

      setToolState: (key, value) =>
        set((s) => {
          if (value === undefined) {
            if (!(key in s.toolStates)) return s;
            const { [key]: _, ...rest } = s.toolStates;
            return { toolStates: rest };
          }
          return { toolStates: { ...s.toolStates, [key]: value } };
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
      name: PERSIST_KEY,
      storage: createJSONStorage(() => createPersistStorage()),
      partialize: (s) => ({
        theme: s.theme,
        starred: s.starred,
        recent: s.recent,
        inputs: s.inputs,
        // 超过单槽上限的内容(如整篇文档)只在内存保留, 不落盘
        toolStates: Object.fromEntries(
          Object.entries(s.toolStates).filter(([, v]) => v.length <= MAX_SLOT_BYTES)
        ),
        disabled: s.disabled,
        // 市场源完整持久化(配置 + 最近一次成功缓存,下次启动省一次 fetch)
        marketSources: s.marketSources,
      }),
    }
  )
);
