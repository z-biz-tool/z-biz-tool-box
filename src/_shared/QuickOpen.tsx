import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Input, List, Tag, Typography, Empty } from "antd";
import { StarFilled, HistoryOutlined, EnterOutlined, SearchOutlined, AppstoreOutlined } from "@ant-design/icons";
import { ALL_TOOLS } from "../plugins/_registry";
import { useUiStore } from "../stores/uiStore";
import { useExtStore } from "../plugins/external/store";

interface QuickOpenProps {
  /** 选择工具时回调(传入的 key 可能是内置 key 或 "ext::pluginId::featureCode") */
  onSelect: (key: string) => void;
}

interface QuickItem {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  group: string;
  isPlugin?: boolean;
  pluginId?: string;
  /** 命中的关键字(高亮用) */
  matchedWord?: string;
}

type Section = { title: string; icon: React.ReactNode; items: QuickItem[] };

/**
 * ⌘K / Ctrl+K 全局命令面板 (utools 风格)
 *
 *  - 内置工具: label/description 匹配
 *  - 外部插件 features: code / cmds 优先精确触发,模糊匹配
 *  - 三段布局: ★ 收藏 / ⏱ 最近 / 全部
 *  - ↑↓ Enter Esc 键盘导航
 */
export function QuickOpen({ onSelect }: QuickOpenProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<any>(null);

  const starred = useUiStore((s) => s.starred);
  const recent = useUiStore((s) => s.recent);
  const disabled = useUiStore((s) => s.disabled);
  const extPlugins = useExtStore((s) => s.plugins);
  const toggleStar = useUiStore((s) => s.toggleStar);

  // ⌘K / Ctrl+K 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !open) {
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

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus?.(), 50);
    }
  }, [open]);

  // 构造所有 QuickItem(内置 + 外部)
  const allItems: QuickItem[] = useMemo(() => {
    const builtin: QuickItem[] = ALL_TOOLS
      .filter((t) => !disabled.includes(t.key))
      .map((t) => ({
        key: t.key,
        label: t.label,
        description: t.description,
        icon: t.icon,
        group: t.groupLabel,
      }));

    const external: QuickItem[] = [];
    for (const p of extPlugins) {
      if (p.error) continue;
      for (const f of p.features) {
        external.push({
          key: `ext::${p.id}::${f.code}`,
          label: f.explain,
          description: `${p.name} · ${f.cmds?.join(" / ") ?? ""}`,
          icon: p.logoUrl ? <img src={p.logoUrl} style={{ width: 16, height: 16, borderRadius: 3 }} /> : <AppstoreOutlined />,
          group: `📦 ${p.name}`,
          isPlugin: true,
          pluginId: p.id,
        });
      }
    }
    return [...builtin, ...external];
  }, [disabled, extPlugins]);

  // 搜索匹配
  const matchItem = (item: QuickItem, q: string): { matched: boolean; word?: string } => {
    if (!q) return { matched: true };
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);

    // 优先级 1: 外部 feature code 精确前缀匹配(utools 风格)
    if (item.isPlugin) {
      const [, , featureCode] = item.key.split("::");
      if (featureCode?.toLowerCase().startsWith(q.toLowerCase())) {
        return { matched: true, word: q };
      }
    }

    // 优先级 2: 任何 word 命中 label/description/group
    const hay = `${item.label} ${item.description} ${item.group}`.toLowerCase();
    for (const w of words) {
      if (hay.includes(w)) return { matched: true, word: w };
    }
    return { matched: false };
  };

  // 构建分组
  const sections: Section[] = useMemo(() => {
    const q = query.trim();
    if (q) {
      const matched = allItems
        .map((it) => ({ it, m: matchItem(it, q) }))
        .filter((x) => x.m.matched)
        .map((x) => ({ ...x.it, matchedWord: x.m.word }))
        // 优先级排序:外部 code 精确匹配在前
        .sort((a, b) => {
          if (a.isPlugin && b.isPlugin) {
            const aCode = a.key.split("::")[2]?.toLowerCase() ?? "";
            const bCode = b.key.split("::")[2]?.toLowerCase() ?? "";
            if (aCode.startsWith(q.toLowerCase()) && !bCode.startsWith(q.toLowerCase())) return -1;
            if (!aCode.startsWith(q.toLowerCase()) && bCode.startsWith(q.toLowerCase())) return 1;
          }
          return 0;
        });
      return [{ title: `匹配 (${matched.length})`, icon: <SearchOutlined />, items: matched }];
    }

    const sec: Section[] = [];
    const findEnabled = (k: string): QuickItem | undefined => {
      const it = allItems.find((x) => x.key === k);
      return it;
    };
    if (starred.length > 0) {
      const ts = starred.map(findEnabled).filter((t): t is QuickItem => Boolean(t));
      if (ts.length > 0) sec.push({ title: "★ 收藏", icon: <StarFilled style={{ color: "#faad14" }} />, items: ts });
    }
    if (recent.length > 0) {
      const ts = recent.map(findEnabled).filter((t): t is QuickItem => Boolean(t));
      if (ts.length > 0) sec.push({ title: "⏱ 最近", icon: <HistoryOutlined />, items: ts });
    }
    sec.push({ title: "所有工具", icon: <SearchOutlined />, items: allItems });
    return sec;
  }, [query, allItems, starred, recent]);

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(flatItems.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = flatItems[activeIdx];
        if (it) {
          onSelect(it.key);
          setOpen(false);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatItems, activeIdx, onSelect]);

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
      width={600}
      styles={{
        body: { padding: 0, maxHeight: "65vh", overflow: "hidden", display: "flex", flexDirection: "column" },
        mask: { backdropFilter: "blur(2px)" },
      }}
      destroyOnClose
    >
      <div style={{ padding: 12, borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
        <Input
          ref={inputRef}
          size="large"
          prefix={<SearchOutlined />}
          placeholder="搜索工具/feature... (↑↓ 导航, ⏎ 打开, ⌘K 关闭)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          variant="borderless"
        />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
        {flatItems.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的工具" style={{ padding: 24 }} />
        ) : (
          sections.map((sec) => {
            if (sec.items.length === 0) return null;
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
                  dataSource={sec.items}
                  split={false}
                  renderItem={(t) => {
                    const idx = flatItems.findIndex((x) => x.key === t.key);
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
                          avatar={<span style={{ fontSize: 16, color: "var(--ant-color-primary)", display: "inline-flex" }}>{t.icon}</span>}
                          title={
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Typography.Text strong>{t.label}</Typography.Text>
                              {t.isPlugin && <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>外部</Tag>}
                              {starred.includes(t.key) && <StarFilled style={{ fontSize: 11, color: "#faad14" }} />}
                            </span>
                          }
                          description={
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {t.group} · {t.description}
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
          <EnterOutlined /> {ALL_TOOLS.length} 内置 + {extPlugins.reduce((s, p) => s + p.features.length, 0)} 外部
        </span>
      </div>
    </Modal>
  );
}
