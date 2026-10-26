import { useEffect, useState } from "react";
import { Switch, Select, InputNumber, Divider, Typography, Button, message, Space } from "antd";
import { ArrowLeftOutlined, ReloadOutlined, ClearOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "./ThemeContext";
import { useUiStore } from "../stores/uiStore";

interface PreferencesViewProps {
  onBack: () => void;
}

interface Prefs {
  theme: "auto" | "light" | "dark";
  alwaysOnTop: boolean;
  autoLaunch: boolean;
  closeToTray: boolean;
  escToHide: boolean;
  altSpaceToToggle: boolean;
  historyLimit: number;
  fontFamily: "system" | "mono";
}

const STORAGE_KEY = "zBizPrefs.v1";

const DEFAULTS: Prefs = {
  theme: "auto",
  alwaysOnTop: false,
  autoLaunch: true,
  closeToTray: true,
  escToHide: true,
  altSpaceToToggle: true,
  historyLimit: 50,
  fontFamily: "system",
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/**
 * 偏好设置视图 — 简洁的设置面板,所有项立即写入 localStorage。
 * 设计目标: 不依赖 Rust 端 / Tauri store,纯前端可工作,后续可平滑迁移。
 */
export function PreferencesView({ onBack }: PreferencesViewProps) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const { mode, setMode } = useTheme();
  const [msgApi, contextHolder] = message.useMessage();
  // 日志目录：前端报错会写进那里（Rust 的 write_log）⇒ 给出入口，
  // 否则用户只能翻代码才知道日志在哪。
  const [logDir, setLogDir] = useState<string | null>(null);
  const [openingLogDir, setOpeningLogDir] = useState(false);
  // 安全开关(台账 T1.1 / T1.6)存在 uiStore 里 —— 与插件市场、HTTP 工具共用同一份,
  // 避免"设置页开着的开关, 别的界面看不到"这类不一致。
  const allowInsecureCerts = useUiStore((s) => s.allowInsecureCerts);
  const setAllowInsecureCerts = useUiStore((s) => s.setAllowInsecureCerts);
  const allowInsecureSources = useUiStore((s) => s.allowInsecureSources);
  const setAllowInsecureSources = useUiStore((s) => s.setAllowInsecureSources);

  // 写入 prefs 后立即同步到对应系统
  useEffect(() => {
    savePrefs(prefs);
    if (prefs.theme === "light" || prefs.theme === "dark") {
      setMode(prefs.theme);
    } else {
      // "auto": 删掉 localStorage 标记,让 ThemeContext 重新走系统判断
      localStorage.removeItem("z-tool-theme");
    }
  }, [prefs, setMode]);

  // 打开日志目录：Rust 侧用 tauri-plugin-opener 打开并把路径带回来
  const openLogDir = async () => {
    setOpeningLogDir(true);
    try {
      const dir = await invoke<string>("open_log_dir");
      setLogDir(dir);
    } catch (e) {
      msgApi.error(`打开日志目录失败：${e}`);
    } finally {
      setOpeningLogDir(false);
    }
  };

  const update = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  // 实时生效的窗口级偏好: 改完立刻 push 到 Rust,不用重启
  const onAlwaysOnTopChange = async (v: boolean) => {
    update("alwaysOnTop", v);
    try {
      await invoke("apply_window_prefs", { prefs: { alwaysOnTop: v } });
      msgApi.success(v ? "窗口已置顶" : "已取消置顶");
    } catch (e) {
      msgApi.error("应用失败: " + e);
    }
  };

  const clearRecent = () => {
    try {
      const k = "zBizUiStore";
      const raw = localStorage.getItem(k);
      if (raw) {
        const obj = JSON.parse(raw);
        obj.state = { ...obj.state, recent: [] };
        localStorage.setItem(k, JSON.stringify(obj));
      }
      msgApi.success("已清空最近使用,刷新后生效");
    } catch {
      msgApi.error("清空失败");
    }
  };

  const clearStarred = () => {
    try {
      const k = "zBizUiStore";
      const raw = localStorage.getItem(k);
      if (raw) {
        const obj = JSON.parse(raw);
        obj.state = { ...obj.state, starred: [] };
        localStorage.setItem(k, JSON.stringify(obj));
      }
      msgApi.success("已清空收藏,刷新后生效");
    } catch {
      msgApi.error("清空失败");
    }
  };

  const reset = () => {
    setPrefs(DEFAULTS);
    msgApi.success("已重置为默认");
  };

  return (
    <div
      data-tauri-drag-region
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--ant-color-bg-container)",
      }}
    >
      {contextHolder}
      <TopBar title="偏好设置" onBack={onBack} />
      <div
        className="zBizScroll"
        style={{
          flex: 1,
          overflow: "auto",
          padding: "20px 32px",
        }}
      >
        <Section title="外观">
          <Row label="主题">
            <Select
              value={prefs.theme}
              onChange={(v) => update("theme", v)}
              style={{ width: 160 }}
              options={[
                { value: "auto", label: "跟随系统" },
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
              ]}
            />
            <Hint text={`当前生效: ${mode}`} />
          </Row>
          <Row label="字体">
            <Select
              value={prefs.fontFamily}
              onChange={(v) => update("fontFamily", v)}
              style={{ width: 160 }}
              options={[
                { value: "system", label: "系统字体" },
                { value: "mono", label: "等宽字体" },
              ]}
            />
          </Row>
        </Section>

        <Divider style={{ margin: "20px 0" }} />

        <Section title="行为">
          <Row label="窗口置顶">
            <Switch
              checked={prefs.alwaysOnTop}
              onChange={onAlwaysOnTopChange}
            />
            <Hint text="实时生效,不用重启" />
          </Row>
          <Row label="开机自启">
            <Switch
              checked={prefs.autoLaunch}
              onChange={(v) => update("autoLaunch", v)}
            />
            <Hint text="macOS 需授权辅助功能" />
          </Row>
          <Row label="关闭按钮隐藏到托盘">
            <Switch
              checked={prefs.closeToTray}
              onChange={(v) => update("closeToTray", v)}
            />
          </Row>
          <Row label="Esc 隐藏窗口">
            <Switch
              checked={prefs.escToHide}
              onChange={(v) => update("escToHide", v)}
            />
          </Row>
          <Row label="⌥Space 唤起/隐藏">
            <Switch
              checked={prefs.altSpaceToToggle}
              onChange={(v) => update("altSpaceToToggle", v)}
            />
          </Row>
        </Section>

        <Divider style={{ margin: "20px 0" }} />

        <Section title="安全">
          <Row label="允许不安全连接">
            <Switch
              checked={allowInsecureCerts}
              onChange={setAllowInsecureCerts}
            />
            <Hint text="关闭 TLS 证书校验（内网自签证书调试用）。开启后 HTTP 测试工具才会出现「忽略证书校验」勾选框，且默认不勾。" />
          </Row>
          <Row label="允许不安全市场源">
            <Switch
              checked={allowInsecureSources}
              onChange={setAllowInsecureSources}
            />
            <Hint text="放行 http 明文市场源。开启后界面会用红色警告标出这类源 —— 源返回的插件代码可被中间人替换。" />
          </Row>
        </Section>

        <Divider style={{ margin: "20px 0" }} />

        <Section title="数据">
          <Row label="最近使用上限">
            <InputNumber
              value={prefs.historyLimit}
              onChange={(v) => update("historyLimit", Number(v) || 50)}
              min={5}
              max={200}
              style={{ width: 120 }}
            />
            <Hint text="超出后自动删除最早记录" />
          </Row>
          <Row label="清空最近使用">
            <Button icon={<ClearOutlined />} onClick={clearRecent}>
              清空
            </Button>
          </Row>
          <Row label="清空收藏">
            <Button icon={<ClearOutlined />} onClick={clearStarred}>
              清空
            </Button>
          </Row>
        </Section>

        <Divider style={{ margin: "20px 0" }} />

        <Section title="关于">
          <Row label="版本">
            <Typography.Text>v0.1.0</Typography.Text>
          </Row>
          <Row label="仓库">
            <Typography.Text copyable={{ text: "https://github.com/z-biz/z-biz-tool-box" }}>
              z-biz/z-biz-tool-box
            </Typography.Text>
          </Row>
          <Row label="日志目录">
            {/* 前端的 window.onerror / unhandledrejection 会写进这个目录
                （Rust 的 write_log 命令）⇒ 用户找日志时得有个入口，
                否则「日志在哪」只能靠翻代码。 */}
            <Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {logDir ?? "（读取中…）"}
              </Typography.Text>
              <Button
                icon={<FolderOpenOutlined />}
                onClick={openLogDir}
                loading={openingLogDir}
              >
                打开目录
              </Button>
            </Space>
          </Row>
          <Row label="重置全部">
            <Button icon={<ReloadOutlined />} onClick={reset}>
              重置为默认
            </Button>
          </Row>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12, color: "var(--ant-color-text-secondary)" }}>
        {title}
      </Typography.Title>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, minHeight: 32 }}>
      <div style={{ width: 140, flexShrink: 0, color: "var(--ant-color-text)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      {text}
    </Typography.Text>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div
      data-tauri-drag-region="deep"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 14px",
        borderBottom: "1px solid var(--ant-color-border-secondary)",
        background: "linear-gradient(180deg, var(--ant-color-bg-container) 0%, transparent 100%)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
      }}
    >
      <Button
        size="small"
        type="text"
        icon={<ArrowLeftOutlined />}
        aria-label="返回"
        onClick={onBack}
        style={{ width: 28, height: 28, borderRadius: 8 }}
        title="返回 (esc)"
      />
      <Typography.Text strong style={{ fontSize: 14, fontWeight: 600, marginLeft: 8 }}>
        {title}
      </Typography.Text>
    </div>
  );
}

