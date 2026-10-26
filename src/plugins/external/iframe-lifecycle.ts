/**
 * 外部插件 iframe 的生命周期状态机（台账 T3.6）。
 *
 * 为什么是纯模块：iframe 的真实加载/超时/失败在本仓的 node 测试里跑不出来
 * （jsdom 也没有 iframe 资源加载），所以把「什么信号把状态推到哪一相」
 * 抽成可断言的纯函数，React 侧只负责把 load / message / error / 定时器
 * 映射成这些调用。
 *
 * 相位：
 *   loading  → 骨架屏覆盖，iframe 在下面照常加载
 *   ready    → 收到 load，或插件发来任何一条合法消息（后者更可信）
 *   timeout  → 超过 FRAME_TIMEOUT_MS 仍没有任何信号：给可执行原因 + 重试
 *   error    → 浏览器明确报错（iframe onError）
 *
 * 晚到的信号可以把 timeout 拉回 ready（加载慢 ≠ 坏了，不该逼用户再点一次）。
 * 但 error 不被普通 load 覆盖 —— 报过错就必须让用户看见。
 */

export type FramePhase = "loading" | "ready" | "timeout" | "error";

/** 超时阈值：main.html 是本机文件，10s 还没 load 基本是资源/CSP 问题 */
export const FRAME_TIMEOUT_MS = 10_000;

export interface FrameLife {
  phase: FramePhase;
  /** 本次加载开始时间（ms）。重试/切换插件时重置。 */
  startedAt: number;
  /** error 相的可读原因；其余相位为 null */
  errorMessage: string | null;
}

export function createFrameLife(now: number): FrameLife {
  return { phase: "loading", startedAt: now, errorMessage: null };
}

/** iframe 触发 load。timeout 后晚到的 load 视为恢复。 */
export function frameLoaded(life: FrameLife): FrameLife {
  if (life.phase === "error") return life;
  if (life.phase === "ready") return life;
  return { ...life, phase: "ready", errorMessage: null };
}

/**
 * 插件发来消息（hello 或任一 RPC）。比 load 更强的信号：
 * 只有页面里的脚本真的跑起来了才发得出消息。
 */
export function frameAlive(life: FrameLife): FrameLife {
  if (life.phase === "ready") return life;
  return { ...life, phase: "ready", errorMessage: null };
}

/** 浏览器报错 / 资源不可达。error 是终态，直到重新加载。 */
export function frameFailed(life: FrameLife, reason?: string): FrameLife {
  return {
    ...life,
    phase: "error",
    errorMessage: reason?.trim() || "iframe 加载失败（资源不可达或被安全策略拦截）",
  };
}

/**
 * 定时器到点时调用。只在 loading 且已超过阈值时推进到 timeout；
 * 其余相位原样返回（ready 后不准再翻回 timeout）。
 */
export function frameTimedOut(
  life: FrameLife,
  now: number,
  timeoutMs: number = FRAME_TIMEOUT_MS
): FrameLife {
  if (life.phase !== "loading") return life;
  if (now - life.startedAt < timeoutMs) return life;
  return { ...life, phase: "timeout", errorMessage: null };
}

/** 「重新加载」：回到 loading，并重置计时起点 */
export function restartFrame(now: number): FrameLife {
  return createFrameLife(now);
}

/** 是否需要用覆盖层挡住 iframe（loading 时避免用户点到半成品） */
export function isFrameBlocked(phase: FramePhase): boolean {
  return phase === "loading" || phase === "timeout" || phase === "error";
}

export interface FramePhaseCopy {
  title: string;
  description: string;
  tone: "info" | "warning" | "error";
}

/** 面向用户的文案：发生什么 + 能做什么。不出现栈/内部字段名。 */
export function describeFramePhase(
  phase: FramePhase,
  timeoutMs: number = FRAME_TIMEOUT_MS
): FramePhaseCopy {
  switch (phase) {
    case "ready":
      return { title: "插件已加载", description: "", tone: "info" };
    case "timeout":
      return {
        title: `插件加载超过 ${Math.round(timeoutMs / 1000)} 秒`,
        description:
          "插件页面没有回应。可能是 main.html 引用了被安全策略拦截的外部脚本，或文件被移动/删除。可以重新加载，或打开插件目录检查文件。",
        tone: "warning",
      };
    case "error":
      return {
        title: "插件未能加载",
        description: "插件页面在浏览器层面就失败了。检查插件目录里的 main.html 是否存在，然后重新加载。",
        tone: "error",
      };
    case "loading":
    default:
      return { title: "正在加载插件", description: "首次加载需要读取本地文件。", tone: "info" };
  }
}
