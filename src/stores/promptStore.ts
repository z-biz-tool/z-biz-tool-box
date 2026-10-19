/**
 * 敏感能力确认状态 — 会话内的决定放内存, 「始终允许」落盘。
 *
 * 纯逻辑在 `plugins/external/permission-prompt.ts`(可被 node 直接断言);
 * 本文件只负责**存**。
 *
 * 为什么要拆开: 「允许/拒绝」的语义(何时问、问什么、记多久)是规则,
 * 规则必须能被直接断言; 而"存在哪"是存储问题, 两者混在一起就没法测。
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  createPromptState,
  evaluatePrompt,
  recordAnswer,
  type PromptAnswer,
  type PromptOutcome,
  type PromptState,
} from "../plugins/external/permission-prompt.ts";

interface PromptStore {
  /** 会话内的决定: key → 决定 */
  sessionAnswers: Record<string, PromptAnswer>;
  /** 跨会话的「始终允许」key 集合 */
  alwaysAllowed: string[];
  /** 判定一次调用要不要弹窗 */
  evaluate: (key: string) => PromptOutcome;
  /** 记下一次回答 */
  record: (key: string, answer: PromptAnswer) => void;
  /** 当前状态的快照(给纯逻辑函数用) */
  snapshot: () => PromptState;
}

export const usePromptStore = create<PromptStore>()(
  persist(
    (set, get) => ({
      sessionAnswers: {},
      alwaysAllowed: [],

      evaluate: (key) => {
        const s = get();
        return evaluatePrompt(
          { session: new Map(Object.entries(s.sessionAnswers)), always: new Set(s.alwaysAllowed) },
          key,
        );
      },

      record: (key, answer) => {
        const s = get();
        const next: PromptState = recordAnswer(
          { session: new Map(Object.entries(s.sessionAnswers)), always: new Set(s.alwaysAllowed) },
          key,
          answer,
        );
        set({
          sessionAnswers: Object.fromEntries(next.session),
          alwaysAllowed: [...next.always],
        });
      },

      snapshot: () => {
        const s = get();
        return {
          session: new Map(Object.entries(s.sessionAnswers)),
          always: new Set(s.alwaysAllowed),
        };
      },
    }),
    {
      name: "z-biz-tool-box-prompts",
      storage: createJSONStorage(() => localStorage),
      // 只有「始终允许」需要跨会话; 会话内的决定刻意不落盘 ——
      // 重启后重新问一次, 免得用户几个月前点过一次"允许"就永久放行。
      partialize: (s) => ({ alwaysAllowed: s.alwaysAllowed }) as never,
    },
  )
);

/** 初始空状态(给不依赖 store 的纯逻辑调用用) */
export const EMPTY_PROMPT_STATE: PromptState = createPromptState();
