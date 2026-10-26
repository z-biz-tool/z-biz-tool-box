/**
 * 家族应用面板 — 对标 JetBrains Toolbox:一个面板里管全家族 app 的装/启/更新。
 *
 * 为什么要面板而不是 tray 菜单: macOS 原生 NSMenuItem 不支持图片 icon,
 * tray 菜单里永远只有 emoji。真图标 + 进度条 + 版本对比只能在自绘 UI 里做,
 * 所以 tray 的「未安装」那一行现在只是面板入口(见 tray.rs handle_brother_click)。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Empty, Progress, Spin, Tag, Tooltip, Typography, message } from "antd";
import {
  ArrowLeftOutlined,
  CloudDownloadOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { pushTrayTools } from "../trayBridge";
import { DragHandle } from "./DragHandle";

type ReleaseState =
  | "ok"
  | "noPublishedRelease"
  | "noAsset"
  | "rateLimited"
  | "unreachable";

interface BrotherRelease {
  state: ReleaseState;
  tag: string | null;
  version: string | null;
  assetName: string | null;
  assetUrl: string | null;
  assetKind: string | null;
  assetSize: number | null;
  note: string | null;
}

interface BrotherCard {
  key: string;
  name: string;
  displayName: string;
  bundleId: string;
  installed: boolean;
  installedPath: string | null;
  installedVersion: string | null;
  hasUpdate: boolean;
  /** base64 PNG(编译期内嵌自各兄弟仓), 缺图时 null → 首字母色块 */
  iconPng: string | null;
  release: BrotherRelease;
}

interface InstallProgress {
  key: string;
  phase: "download" | "verify" | "install" | "done" | "error";
  received: number | null;
  total: number | null;
  message: string | null;
}

interface BrothersViewProps {
  onBack: () => void;
  /** tray 点某个未装兄弟进来时带上的 key, 滚到并高亮那张卡 */
  highlightKey?: string | null;
}

const STATE_LABEL: Record<ReleaseState, { text: string; color: string }> = {
  ok: { text: "可安装", color: "green" },
  noPublishedRelease: { text: "未发布", color: "orange" },
  noAsset: { text: "暂无安装包", color: "default" },
  rateLimited: { text: "查询受限", color: "gold" },
  unreachable: { text: "查询失败", color: "red" },
};

export function BrothersView({ onBack, highlightKey }: BrothersViewProps) {
  const [cards, setCards] = useState<BrotherCard[] | null>(null);
  const [progress, setProgress] = useState<Record<string, InstallProgress>>({});
  const [msgApi, contextHolder] = message.useMessage();
  /** 拖文件进来时，指针悬在哪张卡上（用于高亮落点） */
  const [dragKey, setDragKey] = useState<string | null>(null);
  /** 名字要用于提示文案，但拖放订阅不该因列表刷新而重建 ⇒ 走 ref */
  const cardsRef = useRef<BrotherCard[] | null>(null);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const load = useCallback(async (force: boolean) => {
    try {
      const next = await invoke<BrotherCard[]>("brother_overview", { force });
      setCards(next);
    } catch (e) {
      msgApi.error("读取兄弟应用列表失败: " + e);
      setCards([]);
    }
  }, [msgApi]);

  useEffect(() => {
    void load(false);
  }, [load]);

  // 安装进度由 Rust 侧 emit; 装完重拉一次列表, 让版本/安装态变成最新
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<InstallProgress>("brother-install-progress", (e) => {
      const p = e.payload;
      setProgress((prev) => ({ ...prev, [p.key]: p }));
      if (p.phase === "done") {
        setProgress((prev) => {
          const next = { ...prev };
          delete next[p.key];
          return next;
        });
        void load(false);
        // 装完兄弟应用后 tray 的「兄弟应用」子菜单要跟着更新 ——
        // 那份清单是 Rust 侧扫出来的,前端不推一次它就一直显示装之前的状态。
        void pushTrayTools();
        msgApi.success("安装完成");
      }
      if (p.phase === "error") {
        setProgress((prev) => {
          const next = { ...prev };
          delete next[p.key];
          return next;
        });
        msgApi.error(p.message ?? "安装失败");
      }
    }).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, [load, msgApi]);

  // tray 带 key 进来时把那张卡滚进视野
  useEffect(() => {
    if (!highlightKey || !cards) return;
    const el = document.getElementById(`brother-${highlightKey}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightKey, cards]);

  const install = async (card: BrotherCard) => {
    try {
      await invoke("install_brother", { key: card.key });
    } catch (e) {
      msgApi.error("安装失败: " + e);
    }
  };

  const launch = async (card: BrotherCard) => {
    try {
      await invoke("launch_brother", { key: card.key });
    } catch (e) {
      msgApi.error("启动失败: " + e);
    }
  };

  /**
   * 把文件交给某个兄弟应用：带上 `zbiz://<key>/open?file=…` 启动。
   *
   * 这是 box 从「启动器」变成「交接中枢」的那一步 —— 以前 box 只能把应用叫起来，
   * 用户还得自己在目标应用里再找一遍文件。
   */
  const launchWithFile = useCallback(
    async (key: string, file: string) => {
      const name = cardsRef.current?.find((c) => c.key === key)?.displayName ?? key;
      const base = file.split(/[\\/]/).pop() ?? file;
      try {
        await invoke("launch_brother", { key, target: { file } });
        msgApi.success(`已把「${base}」交给 ${name}`);
      } catch (e) {
        msgApi.error(`交给 ${name} 失败: ${e}`);
      }
    },
    [msgApi],
  );

  // 拖文件到卡片上 → 用该应用打开。
  // 位置是物理像素（Retina 上是 CSS 像素的 2 倍），elementFromPoint 要 CSS 像素，
  // 不换算的话在 2x 屏上会指到角落，看着像「拖到哪儿都没反应」。
  const keyAtPointer = useCallback((position: { x: number; y: number }): string | null => {
    const dpr = window.devicePixelRatio || 1;
    const el = document.elementFromPoint(position.x / dpr, position.y / dpr);
    const host = el?.closest("[data-brother-key]");
    return host instanceof HTMLElement ? host.dataset.brotherKey ?? null : null;
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") {
          setDragKey(keyAtPointer(p.position));
          return;
        }
        if (p.type === "drop") {
          const key = keyAtPointer(p.position);
          setDragKey(null);
          const file = p.paths[0];
          if (key && file) void launchWithFile(key, file);
          return;
        }
        setDragKey(null);
      })
      .then((u) => {
        if (disposed) {
          u();
          return;
        }
        unlisten = u;
      })
      .catch((e) => {
        // 纯浏览器预览没有拖放事件；桌面版失败只影响「拖文件交接」这一条捷径
        console.warn("[box] 订阅拖放事件失败（非 Tauri 环境属预期）", e);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [keyAtPointer, launchWithFile]);

  const installedCount = cards?.filter((c) => c.installed).length ?? 0;
  const updateCount = cards?.filter((c) => c.hasUpdate).length ?? 0;

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
      <DragHandle
        right={
          <Tooltip title="重新检查更新">
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              aria-label="重新检查更新"
              onClick={() => void load(true)}
              style={{ width: 28, height: 28, borderRadius: 8 }}
            />
          </Tooltip>
        }
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
        <Typography.Text strong style={{ fontSize: 14, fontWeight: 600 }}>
          家族应用
        </Typography.Text>
        {cards && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            已装 {installedCount}/{cards.length}
            {updateCount > 0 && ` · ${updateCount} 个可更新`}
          </Typography.Text>
        )}
        {dragKey && (
          <Typography.Text style={{ fontSize: 12, color: "var(--ant-color-primary)" }}>
            松开即用「{cardsRef.current?.find((c) => c.key === dragKey)?.displayName ?? dragKey}
            」打开
          </Typography.Text>
        )}
      </DragHandle>

      <div
        className="zBizScroll"
        style={{ flex: 1, overflow: "auto", padding: 16, background: "var(--ant-color-bg-layout)" }}
      >
        {cards === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spin tip="正在检查 GitHub 上的最新版本…">
              <div style={{ padding: 24 }} />
            </Spin>
          </div>
        ) : cards.length === 0 ? (
          <Empty description="清单里没有可召唤的兄弟应用" />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))",
              gap: 12,
            }}
          >
            {cards.map((c) => (
              <BrotherTile
                key={c.key}
                card={c}
                progress={progress[c.key]}
                highlighted={highlightKey === c.key}
                dragTarget={dragKey === c.key}
                onInstall={() => void install(c)}
                onLaunch={() => void launch(c)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BrotherTile({
  card,
  progress,
  highlighted,
  dragTarget,
  onInstall,
  onLaunch,
}: {
  card: BrotherCard;
  progress?: InstallProgress;
  highlighted: boolean;
  /** 拖着文件悬在这张卡上：给一个比 hover 更明确的落点反馈 */
  dragTarget: boolean;
  onInstall: () => void;
  onLaunch: () => void;
}) {
  const state = STATE_LABEL[card.release.state];
  const busy = progress !== undefined;
  const percent =
    progress && progress.total && progress.total > 0 && progress.received !== null
      ? Math.round((progress.received / progress.total) * 100)
      : null;

  return (
    // data-brother-key 是拖放落点的唯一抓手：指针位置靠 elementFromPoint 反查它
    <div id={`brother-${card.key}`} data-brother-key={card.key}>
      <Card
        size="small"
        hoverable={!busy}
        style={{
          borderRadius: 12,
          ...(highlighted
            ? { borderColor: "var(--ant-color-primary)", boxShadow: "0 0 0 2px rgba(99,102,241,0.18)" }
            : {}),
          ...(dragTarget
            ? {
                borderColor: "var(--ant-color-primary)",
                borderStyle: "dashed",
                background: "var(--ant-color-primary-bg, rgba(99,102,241,0.06))",
              }
            : {}),
        }}
        styles={{ body: { padding: 14 } }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <AppIcon card={card} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text strong style={{ fontSize: 13 }} ellipsis>
              {card.displayName}
            </Typography.Text>
            <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {card.installed ? (
                <Tag color={card.hasUpdate ? "blue" : "green"} style={tagStyle}>
                  {card.hasUpdate ? `可更新 ${card.release.version ?? ""}` : `已装 ${card.installedVersion ?? "?"}`}
                </Tag>
              ) : (
                <Tag color={card.release.state === "ok" ? "green" : state.color} style={tagStyle}>
                  {card.release.state === "ok" ? "未安装" : state.text}
                </Tag>
              )}
            </div>
          </div>
        </div>

        {!card.installed && card.release.note && (
          <Tooltip title={card.release.note}>
            <Typography.Text
              type="secondary"
              style={{ fontSize: 11, display: "block", marginTop: 8, lineHeight: 1.5 }}
              ellipsis={{ tooltip: false }}
            >
              {card.release.note}
            </Typography.Text>
          </Tooltip>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          {card.installed ? (
            <Button size="small" icon={<PlayCircleOutlined />} onClick={onLaunch} style={{ flex: 1 }}>
              启动
            </Button>
          ) : null}
          <Button
            size="small"
            type={card.hasUpdate ? "primary" : "default"}
            icon={<CloudDownloadOutlined />}
            disabled={card.release.state !== "ok" || busy}
            loading={busy && progress?.phase !== "download"}
            onClick={onInstall}
            style={{ flex: 1 }}
          >
            {card.hasUpdate ? "更新" : "安装"}
          </Button>
        </div>

        {busy && (
          <div style={{ marginTop: 10 }}>
            <Progress
              percent={percent ?? 0}
              size="small"
              status={progress?.phase === "error" ? "exception" : "active"}
            />
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {progress?.phase === "download" && "下载中…"}
              {progress?.phase === "verify" && "校验包身份…"}
              {progress?.phase === "install" && "安装到 /Applications…"}
            </Typography.Text>
          </div>
        )}
      </Card>
    </div>
  );
}

const tagStyle = { fontSize: 11, borderRadius: 6, padding: "0 6px", margin: 0, lineHeight: "18px" };

/** 编译期内嵌的 32x32 PNG;缺图退首字母色块(与 MarketView 的回退一致) */
function AppIcon({ card }: { card: BrotherCard }) {
  const size = 40;
  if (card.iconPng) {
    return (
      <img
        src={`data:image/png;base64,${card.iconPng}`}
        width={size}
        height={size}
        style={{ borderRadius: 9, flexShrink: 0 }}
        alt={card.displayName}
      />
    );
  }
  const initial = (card.displayName || card.key).trim().charAt(0).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 9,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: 17,
        fontWeight: 600,
        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
      }}
    >
      {initial}
    </div>
  );
}
