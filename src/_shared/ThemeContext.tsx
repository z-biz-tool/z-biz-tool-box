import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import type { ThemeConfig } from "antd";

type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  toggle: () => {},
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "z-tool-theme";

/**
 * 项目级 design token — 集中管理复用样式常量。
 * 暴露给所有组件, 避免 80+ 处内联 style 写死。
 */
export const MONO_FONT =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggle = () => setMode((m) => (m === "light" ? "dark" : "light"));

  // 用 module augmentation 让 token 接受 monoFontFamily
  const config: ThemeConfig = {
    algorithm: mode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: "#1677ff",
      borderRadius: 6,
      fontSize: 14,
    },
  };
  // 暴露 mono 字体为 CSS variable, 所有组件可读
  return (
    <ThemeContext.Provider value={{ mode, toggle, setMode }}>
      <style>{`:root { --mono-font: ${MONO_FONT}; }`}</style>
      <ConfigProvider theme={config}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}

/**
 * 常用复合 style 集合 — 收敛 80+ 处内联 style 的最高频模式。
 * 用法:
 *   const s = useCommonStyles();
 *   <Input.TextArea style={s.output} />
 */
export function useCommonStyles() {
  const { token } = antdTheme.useToken();
  return {
    /** 输出区 (monospace + 浅灰底) */
    output: {
      fontFamily: "var(--mono-font)",
      background: token.colorBgLayout,
    } as const,
    /** 按钮行间距 */
    btnRow: { margin: "12px 0" } as const,
    /** 内嵌代码片段 */
    code: { fontFamily: "var(--mono-font)" } as const,
  };
}
