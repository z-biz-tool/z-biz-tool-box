import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Space,
  Row as AntRow,
  Col,
  message,
  Typography,
  Card,
  Select,
  Tooltip,
  Segmented,
  Empty,
  Tag,
} from "antd";
import {
  CameraOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PictureOutlined,
  BorderOutlined,
  DesktopOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import type { PluginMeta } from "../_types";
import {
  listDisplays,
  listWindows,
  captureDisplay,
  capturePrimaryDisplay,
  captureRegion,
  captureWindow,
  toDataUrl,
  type DisplayInfo,
  type ScreenshotData,
  type WindowInfo,
} from "../../_shared/imageApi";

export const meta: PluginMeta = {
  key: "screenshot",
  label: "截图工具",
  description: "真实屏幕截图：全屏、区域选框、窗口捕获",
  cmds: ["screenshot", "截图", "屏幕截图", "capture", "截屏"],
  icon: "desktop",
};

/** 截屏模式 */
type ScreenshotMode = "display" | "region" | "window";

/** 截图历史记录 */
interface ScreenshotRecord {
  id: string;
  timestamp: number;
  /** data URL（PNG 无损） */
  url: string;
  width: number;
  height: number;
  /** 来源说明 */
  source: string;
}

/** 选框状态（相对显示器的局部坐标） */
interface RegionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 截图工具。
 *
 * ## 为什么不用 getDisplayMedia
 *
 * 旧实现用前端的 `navigator.mediaDevices.getDisplayMedia`：
 *   - 区域选框**没实现**（选了「区域截图」也只截全屏）
 *   - 截不到原生窗口
 *   - 多显示器行为不可控
 *   - 浏览器 API 在 Tauri webview 里要用户每次授权
 *
 * 现在走后端真截屏（cap-screen / xcap）：显示器、窗口、区域都支持，
 * 且不需要每次弹浏览器授权框。**前端只做选框交互与预览**，
 * 像素采集在 Rust 侧。
 */
export default function ScreenshotTool() {
  const [msgApi, msgContext] = message.useMessage();
  const [mode, setMode] = useState<ScreenshotMode>("display");
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [displayId, setDisplayId] = useState<number | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [history, setHistory] = useState<ScreenshotRecord[]>([]);
  const [capturing, setCapturing] = useState(false);

  // 选框用的整屏预览图（base64）
  const [preview, setPreview] = useState<ScreenshotData | null>(null);
  const [rect, setRect] = useState<RegionRect | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<{ startX: number; startY: number } | null>(null);

  // 枚举显示器与窗口
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ds, ws] = await Promise.all([listDisplays(), listWindows()]);
        if (cancelled) return;
        setDisplays(ds);
        setWindows(ws);
        const primary = ds.find((d) => d.isPrimary) ?? ds[0];
        if (primary) setDisplayId(primary.id);
        if (ws.length > 0) setWindowId(ws[0].id);
      } catch (e) {
        if (!cancelled) msgApi.error(`枚举屏幕失败：${e}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // msgApi 是 message.useMessage 的稳定引用，不进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 记录一条截图历史 */
  const pushHistory = useCallback(
    (data: ScreenshotData, source: string) => {
      const record: ScreenshotRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        url: toDataUrl(data.data),
        width: data.width,
        height: data.height,
        source,
      };
      setHistory((prev) => [record, ...prev].slice(0, 30));
      return record;
    },
    []
  );

  /** 直接截屏（显示器或窗口模式） */
  const captureDirect = useCallback(async () => {
    setCapturing(true);
    try {
      if (mode === "window") {
        if (windowId == null) {
          msgApi.warning("没有可捕获的窗口");
          return;
        }
        const data = await captureWindow(windowId);
        const w = windows.find((x) => x.id === windowId);
        pushHistory(data, w?.title || "窗口");
        msgApi.success("窗口截图成功");
      } else {
        const data =
          displayId == null
            ? await capturePrimaryDisplay()
            : await captureDisplay(displayId);
        const d = displays.find((x) => x.id === displayId);
        pushHistory(data, d?.name || "显示器");
        msgApi.success("屏幕截图成功");
      }
    } catch (e) {
      msgApi.error(`截图失败：${e}`);
    } finally {
      setCapturing(false);
    }
  }, [mode, windowId, displayId, windows, displays, pushHistory, msgApi]);

  /** 进入区域选框模式：先抓一张整屏当底图 */
  const startRegionSelect = useCallback(async () => {
    setCapturing(true);
    try {
      const data =
        displayId == null
          ? await capturePrimaryDisplay()
          : await captureDisplay(displayId);
      setPreview(data);
      setRect(null);
    } catch (e) {
      msgApi.error(`截取底图失败：${e}`);
    } finally {
      setCapturing(false);
    }
  }, [displayId, msgApi]);

  /** 在预览图上拖拽选框 */
  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!preview) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    // 预览图可能被缩放显示 ⇒ 坐标要按缩放比换算回原图像素
    const scaleX = preview.width / box.width;
    const scaleY = preview.height / box.height;
    const x = Math.round((e.clientX - box.left) * scaleX);
    const y = Math.round((e.clientY - box.top) * scaleY);
    draggingRef.current = { startX: x, startY: y };
    setRect({ x, y, w: 0, h: 0 });
  };

  const onCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = draggingRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas || !preview) return;
    const box = canvas.getBoundingClientRect();
    const scaleX = preview.width / box.width;
    const scaleY = preview.height / box.height;
    const x = Math.round((e.clientX - box.left) * scaleX);
    const y = Math.round((e.clientY - box.top) * scaleY);
    setRect({
      x: Math.min(drag.startX, x),
      y: Math.min(drag.startY, y),
      w: Math.abs(x - drag.startX),
      h: Math.abs(y - drag.startY),
    });
  };

  const onCanvasMouseUp = () => {
    draggingRef.current = null;
  };

  /** 确认选框并截取该区域 */
  const confirmRegion = useCallback(async () => {
    if (!rect || !preview) return;
    if (rect.w < 2 || rect.h < 2) {
      msgApi.warning("选框太小了");
      return;
    }
    if (displayId == null) {
      msgApi.error("没有选中显示器");
      return;
    }
    setCapturing(true);
    try {
      const data = await captureRegion(displayId, rect.x, rect.y, rect.w, rect.h);
      pushHistory(data, `区域 ${rect.w}×${rect.h}`);
      setPreview(null);
      setRect(null);
      msgApi.success("区域截图成功");
    } catch (e) {
      msgApi.error(`区域截图失败：${e}`);
    } finally {
      setCapturing(false);
    }
  }, [rect, preview, displayId, pushHistory, msgApi]);

  /** 复制到剪贴板 */
  const copyToClipboard = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      msgApi.success("已复制到剪贴板");
    } catch {
      msgApi.error("复制失败");
    }
  };

  /** 下载 */
  const download = (url: string, id: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `screenshot_${id}.png`;
    a.click();
  };

  return (
    <div
      style={{
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100%",
        overflow: "auto",
      }}
    >
      {msgContext}

      {/* 截图控制面板 */}
      <Card size="small" title="截图设置">
        <AntRow gutter={[16, 12]}>
          <Col span={8}>
            <Typography.Text style={{ display: "block", marginBottom: 4 }}>
              截图模式
            </Typography.Text>
            <Segmented
              block
              value={mode}
              onChange={(v) => {
                setMode(v as ScreenshotMode);
                setPreview(null);
                setRect(null);
              }}
              options={[
                { label: "屏幕", value: "display", icon: <DesktopOutlined /> },
                { label: "区域", value: "region", icon: <BorderOutlined /> },
                { label: "窗口", value: "window", icon: <AppstoreOutlined /> },
              ]}
            />
          </Col>

          {mode === "display" && (
            <Col span={10}>
              <Typography.Text style={{ display: "block", marginBottom: 4 }}>
                显示器
              </Typography.Text>
              <Select
                value={displayId}
                onChange={setDisplayId}
                style={{ width: "100%" }}
                placeholder="选择显示器"
                options={displays.map((d) => ({
                  value: d.id,
                  label: `${d.name}${d.isPrimary ? "（主）" : ""} · ${d.width}×${d.height}`,
                }))}
              />
            </Col>
          )}

          {mode === "window" && (
            <Col span={10}>
              <Typography.Text style={{ display: "block", marginBottom: 4 }}>
                窗口
              </Typography.Text>
              <Select
                value={windowId}
                onChange={setWindowId}
                style={{ width: "100%" }}
                placeholder="选择窗口"
                showSearch
                optionFilterProp="label"
                options={windows.map((w) => ({
                  value: w.id,
                  label: `${w.appName} — ${w.title || "(无标题)"}`,
                }))}
              />
            </Col>
          )}

          <Col span={6}>
            <Space>
              <Tooltip title={mode === "region" ? "抓取底图以框选" : "开始截图"}>
                <Button
                  type="primary"
                  icon={<CameraOutlined />}
                  loading={capturing}
                  onClick={mode === "region" ? startRegionSelect : captureDirect}
                >
                  {mode === "region" ? "框选" : "截图"}
                </Button>
              </Tooltip>
              {mode === "region" && preview && (
                <Button onClick={confirmRegion} disabled={!rect || rect.w < 2}>
                  截取选区
                </Button>
              )}
            </Space>
          </Col>
        </AntRow>
      </Card>

      {/* 区域选框 */}
      {preview && (
        <Card
          size="small"
          title="框选区域"
          extra={
            <Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {rect && rect.w > 1
                  ? `${rect.w} × ${rect.h}（起点 ${rect.x},${rect.y}）`
                  : "在图上拖拽选择区域"}
              </Typography.Text>
              <Button
                size="small"
                onClick={() => {
                  setPreview(null);
                  setRect(null);
                }}
              >
                取消
              </Button>
            </Space>
          }
        >
          <div style={{ position: "relative", display: "inline-block" }}>
            <canvas
              ref={canvasRef}
              width={preview.width}
              height={preview.height}
              onMouseDown={onCanvasMouseDown}
              onMouseMove={onCanvasMouseMove}
              onMouseUp={onCanvasMouseUp}
              onMouseLeave={onCanvasMouseUp}
              style={{
                maxWidth: "100%",
                maxHeight: "50vh",
                cursor: "crosshair",
                border: "1px solid var(--ant-color-border)",
                borderRadius: 6,
                display: "block",
              }}
            />
            {/* 选框覆盖层：画在 canvas 之上，随 canvas 一起缩放 */}
            {rect && rect.w > 1 && (
              <div
                style={{
                  position: "absolute",
                  left: `${(rect.x / preview.width) * 100}%`,
                  top: `${(rect.y / preview.height) * 100}%`,
                  width: `${(rect.w / preview.width) * 100}%`,
                  height: `${(rect.h / preview.height) * 100}%`,
                  border: "2px solid var(--ant-color-primary)",
                  background: "rgba(22,119,255,0.15)",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
        </Card>
      )}

      {/* 截图历史 */}
      <Card
        size="small"
        title={`截图历史（${history.length}）`}
        extra={
          history.length > 0 && (
            <Button
              size="small"
              type="text"
              icon={<DeleteOutlined />}
              onClick={() => setHistory([])}
            >
              清空
            </Button>
          )
        }
      >
        {history.length === 0 ? (
          <Empty
            image={
              <PictureOutlined
                style={{ fontSize: 40, color: "var(--ant-color-text-quaternary)" }}
              />
            }
            description={
              <Space direction="vertical" size={2}>
                <span>还没有截图</span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  支持整屏、区域框选、窗口捕获
                </Typography.Text>
              </Space>
            }
            style={{ padding: "16px 0" }}
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {history.map((record) => (
              <Card
                key={record.id}
                size="small"
                hoverable
                cover={
                  <div
                    style={{
                      height: 130,
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--ant-color-fill-tertiary)",
                    }}
                  >
                    <img
                      src={record.url}
                      alt="截图"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  </div>
                }
                actions={[
                  <Tooltip title="复制" key="copy">
                    <CopyOutlined onClick={() => copyToClipboard(record.url)} />
                  </Tooltip>,
                  <Tooltip title="下载 PNG" key="download">
                    <DownloadOutlined onClick={() => download(record.url, record.id)} />
                  </Tooltip>,
                  <Tooltip title="删除" key="delete">
                    <DeleteOutlined
                      onClick={() =>
                        setHistory((prev) => prev.filter((r) => r.id !== record.id))
                      }
                    />
                  </Tooltip>,
                ]}
              >
                <Card.Meta
                  title={
                    <span style={{ fontSize: 12 }}>
                      {record.width} × {record.height}
                    </span>
                  }
                  description={
                    <Space size={4} wrap>
                      <Tag style={{ margin: 0, fontSize: 11 }}>{record.source}</Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {new Date(record.timestamp).toLocaleTimeString()}
                      </Typography.Text>
                    </Space>
                  }
                />
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
