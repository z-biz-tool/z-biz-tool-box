import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Input, List, Tag, Typography, Empty } from "antd";
import { StarFilled, HistoryOutlined, EnterOutlined, SearchOutlined } from "@ant-design/icons";
import { ALL_TOOLS } from "../plugins/_registry";
import type { ToolMeta } from "../plugins/_types";
import { useUiStore } from "../stores/uiStore";

interface QuickOpenProps {
  /** 选择工具时回调 */
  onSelect: (key: string) => void;
}

type Section = { title: string; tools: ToolMeta[]; icon: React.ReactNode };

/**
 * ⌘K / Ctrl+K 全局命令面板
 *
 *  - 顶部搜索框: 模糊匹配 label/description/keywords
 *  - 分三段: ★ 收藏 / ⏱ 最近 / 全量
 *  - 输入关键词时: 仅显示匹配项,按匹配度排序
 *  - ↑/↓ 选中, Enter 跳转, Esc 关闭
 *  - 快捷键: ⌘K(mac) Ctrl+K(其他) 打开/关闭
 */
export function QuickOpen({ onSelect }: QuickOpenProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<any>(null);

  const starred = useUiStore((s) => s.starred);
  const recent = useUiStore((s) => s.recent);
  const toggleStar = useUiStore((s) => s.toggleStar);

  // ⌘K / Ctrl+K 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !open) {
        // '/' 也可快速打开(模仿 raycast)
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // 打开时聚焦输入框 + 重置
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // 延迟到 modal 渲染后
      setTimeout(() => inputRef.current?.focus?.(), 50);
    }
  }, [open]);

  // 构建分组
  const sections: Section[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (t: ToolMeta) => {
      if (!q) return true;
      const hay = `${t.label} ${t.description} ${t.keywords ?? ""} ${t.key}`.toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    };

    if (q) {
      // 有查询: 全部工具扁平展示, 按匹配度排序
      const matched = ALL_TOOLS.filter(matches);
      return [{ title: `匹配 (${matched.length})`, tools: matched, icon: <SearchOutlined /> }];
    }

    // 无查询: 收藏 / 最近 / 全量
    const sec: Section[] = [];
    if (starred.length > 0) {
      const ts = starred.map((k) => ALL_TOOLS.find((t) => t.key === k)).filter(Boolean) as ToolMeta[];
      sec.push({ title: "★ 收藏", tools: ts, icon: <StarFilled style={{ color: "#faad14" }} /> });
    }
    if (recent.length > 0) {
      const ts = recent.map((k) => ALL_TOOLS.find((t) => t.key === k)).filter(Boolean) as ToolMeta[];
      sec.push({ title: "⏱ 最近", tools: ts, icon: <HistoryOutlined /> });
    }
    sec.push({ title: "所有工具", tools: ALL_TOOLS, icon: <SearchOutlined /> });
    return sec;
  }, [query, starred, recent]);

  // 扁平化用于键盘导航
  const flatTools = useMemo(() => sections.flatMap((s) => s.tools), [sections]);

  // query 变化时重置 active
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // 键盘导航
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(flatTools.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const t = flatTools[activeIdx];
        if (t) {
          onSelect(t.key);
          setOpen(false);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatTools, activeIdx, onSelect]);

  // 滚动到 active 项
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector(`[data-qo-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx, open]);

  return (
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      closable={false}
      width={560}
      styles={{
        body: { padding: 0, maxHeight: "60vh", overflow: "hidden", display: "flex", flexDirection: "column" },
        mask: { backdropFilter: "blur(2px)" },
      }}
      destroyOnClose
    >
      <div style={{ padding: 12, borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
        <Input
          ref={inputRef}
          size="large"
          prefix={<SearchOutlined />}
          placeholder="搜索工具...  (↑↓ 导航, ⏎ 打开, ⌘K 关闭)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          variant="borderless"
        />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
        {flatTools.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的工具" style={{ padding: 24 }} />
        ) : (
          sections.map((sec) => {
            if (sec.tools.length === 0) return null;
            return (
              <div key={sec.title}>
                <div
                  style={{
                    padding: "6px 16px 4px",
                    fontSize: 11,
                    color: "var(--ant-color-text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {sec.icon}
                  {sec.title}
                </div>
                <List
                  size="small"
                  dataSource={sec.tools}
                  split={false}
                  renderItem={(t) => {
                    // 找到这个 tool 在 flatTools 里的位置
                    const idx = flatTools.findIndex((x) => x.key === t.key);
                    const isActive = idx === activeIdx;
                    return (
                      <List.Item
                        data-qo-idx={idx}
                        onClick={() => {
                          onSelect(t.key);
                          setOpen(false);
                        }}
                        onMouseEnter={() => setActiveIdx(idx)}
                        style={{
                          cursor: "pointer",
                          padding: "8px 16px",
                          background: isActive ? "var(--ant-color-fill-secondary)" : "transparent",
                          borderLeft: isActive ? "3px solid var(--ant-color-primary)" : "3px solid transparent",
                          transition: "background 0.1s",
                        }}
                      >
                        <List.Item.Meta
                          avatar={<span style={{ fontSize: 16, color: "var(--ant-color-primary)" }}>{t.icon}</span>}
                          title={
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Typography.Text strong>{t.label}</Typography.Text>
                              {starred.includes(t.key) && <StarFilled style={{ fontSize: 11, color: "#faad14" }} />}
                            </span>
                          }
                          description={
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {t.description}
                            </Typography.Text>
                          }
                        />
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStar(t.key);
                          }}
                          style={{
                            cursor: "pointer",
                            padding: "0 8px",
                            fontSize: 16,
                            color: starred.includes(t.key) ? "#faad14" : "var(--ant-color-text-quaternary)",
                          }}
                          title={starred.includes(t.key) ? "取消收藏" : "收藏"}
                        >
                          {starred.includes(t.key) ? <StarFilled /> : <span>☆</span>}
                        </span>
                      </List.Item>
                    );
                  }}
                />
              </div>
            );
          })
        )}
      </div>
      <div
        style={{
          padding: "6px 16px",
          borderTop: "1px solid var(--ant-color-border-secondary)",
          fontSize: 11,
          color: "var(--ant-color-text-tertiary)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>↑↓</Tag> 导航
          <Tag color="blue" style={{ margin: "0 4px", fontSize: 10 }}>⏎</Tag> 打开
          <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>esc</Tag> 关闭
        </span>
        <span>
          <EnterOutlined /> 27 个工具
        </span>
      </div>
    </Modal>
  );
}
