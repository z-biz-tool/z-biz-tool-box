import { Typography, Tag, Tooltip } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button } from "antd";

interface ShortcutsViewProps {
  onBack: () => void;
}

interface ShortcutItem {
  keys: string[];
  desc: string;
  group: "全局" | "主面板" | "工具" | "插件";
}

const SHORTCUTS: ShortcutItem[] = [
  { group: "全局", keys: ["⌥", "Space"], desc: "唤起 / 隐藏主窗口" },
  { group: "全局", keys: ["⌃", "⌘", "K"], desc: "备用唤起(防止 ⌥Space 被抢)" },
  { group: "全局", keys: ["Esc"], desc: "主面板清空搜索 / 隐藏窗口" },

  { group: "主面板", keys: ["↑", "↓"], desc: "上下选择功能" },
  { group: "主面板", keys: ["Enter"], desc: "打开选中的功能" },

  { group: "工具", keys: ["Esc"], desc: "返回主面板 / 关闭工具" },
  { group: "工具", keys: ["⌥", "Space"], desc: "再次唤起(在工具内也可关掉)" },
];

/**
 * 快捷键速查 — 与代码同步维护。
 * 修改 lib.rs (Rust 端) 或 App.tsx (前端) 时,这里也要同步。
 */
export function ShortcutsView({ onBack }: ShortcutsViewProps) {
  const groups = Array.from(new Set(SHORTCUTS.map((s) => s.group)));

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
          onClick={onBack}
          style={{ width: 28, height: 28, borderRadius: 8 }}
          title="返回 (esc)"
        />
        <Typography.Text strong style={{ fontSize: 14, fontWeight: 600, marginLeft: 8 }}>
          快捷键
        </Typography.Text>
      </div>
      <div
        className="zBizScroll"
        style={{
          flex: 1,
          overflow: "auto",
          padding: "20px 32px",
        }}
      >
        {groups.map((g) => (
          <div key={g} style={{ marginBottom: 24 }}>
            <Typography.Title
              level={5}
              style={{ marginTop: 0, marginBottom: 12, color: "var(--ant-color-text-secondary)" }}
            >
              {g}
            </Typography.Title>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 360px) 1fr",
                rowGap: 10,
                columnGap: 24,
                alignItems: "center",
              }}
            >
              {SHORTCUTS.filter((s) => s.group === g).map((s, i) => (
                <div key={i} style={{ display: "contents" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {s.keys.map((k, ki) => (
                      <Tooltip key={ki} title={k}>
                        <Tag
                          color="default"
                          style={{
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontWeight: 600,
                            fontSize: 12,
                            padding: "2px 8px",
                            borderRadius: 6,
                            border: "1px solid var(--ant-color-border)",
                            background: "var(--ant-color-bg-elevated)",
                            minWidth: 32,
                            textAlign: "center",
                          }}
                        >
                          {k}
                        </Tag>
                      </Tooltip>
                    ))}
                  </div>
                  <div style={{ color: "var(--ant-color-text)" }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Typography.Paragraph
          type="secondary"
          style={{ fontSize: 12, marginTop: 24, padding: 12, background: "var(--ant-color-bg-layout)", borderRadius: 8 }}
        >
          💡 提示
          <br />
          · ⌥Space 在 macOS 上需要「辅助功能」权限,首次按会弹窗要求授权
          <br />
          · 如果 ⌥Space 被 Alfred / Raycast 占用,在它们的偏好设置里关掉对应快捷键即可
          <br />
          · 修改快捷键: 当前版本写死在 lib.rs,后续会迁移到 PreferencesView
        </Typography.Paragraph>
      </div>
    </div>
  );
}
