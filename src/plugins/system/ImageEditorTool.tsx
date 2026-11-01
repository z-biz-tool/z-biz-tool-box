import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Space,
  Card,
  Typography,
  Select,
  Slider,
  Tooltip,
  Tag,
  Table,
  InputNumber,
  Empty,
  message,
  Tabs,
  Progress,
  Alert,
} from "antd";
import {
  FolderOpenOutlined,
  RotateRightOutlined,
  RotateLeftOutlined,
  SwapOutlined,
  BorderOutlined,
  SaveOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import type { PluginMeta } from "../_types";
import {
  FILTERS,
  getImageInfo,
  getImageThumbnail,
  readExif,
  stripExif,
  resizeImage,
  rotateImage,
  flipImage,
  cropImage,
  applyFilter,
  exportImage,
  toDataUrl,
  type ImageInfo,
  type ExifData,
  type ExifField,
  type FilterName,
} from "../../_shared/imageApi";

export const meta: PluginMeta = {
  key: "image-editor",
  label: "图片编辑",
  description: "裁剪旋转、滤镜、格式转换、EXIF 查看与隐私清除，像素处理走能力层",
  cmds: ["image", "图片编辑", "图片", "image editor", "裁剪", "滤镜"],
  icon: "picture",
};

/** 工作目录：所有中间产物与导出文件都落在这里 */
const WORK_DIR = "~/.z-biz-tools/images";

/**
 * 图片编辑器。
 *
 * ## 边界：像素级的事一律下沉到能力层
 *
 * 前端**只做预览与交互**（选框、滑杆、CSS 滤镜的即时反馈），
 * 真正改像素的活全部走后端 cap-img：
 *
 *   裁剪 → cap-img::crop      旋转 → cap-img::rotate
 *   翻转 → cap-img::flip      缩放 → cap-img::resize
 *   滤镜 → cap-img::apply_filter   格式转换 → cap-img::export
 *   EXIF → cap-img::exif::{read,write,strip}
 *
 * 为什么不在前端 canvas 里做：file 仓已经踩过这个坑 ——
 * 同一个仓里同时存在「前端 canvas 缩放」与「Rust Lanczos3 缩放」两条路径，
 * 预览和导出结果对不上，用户看到的和拿到的不是同一张图。
 *
 * 预览用 CSS 滤镜是**刻意的**：它快、即时，只用于「看效果」；
 * 导出永远走 Rust，出唯一真值。
 */
export default function ImageEditorTool() {
  const [msgApi, msgContext] = message.useMessage();
  const [path, setPath] = useState<string | null>(null);
  const [info, setInfo] = useState<ImageInfo | null>(null);
  const [exif, setExif] = useState<ExifData | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 预览用的滤镜（CSS 滤镜串）
  const [filterName, setFilterName] = useState<FilterName | "none">("none");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [blur, setBlur] = useState(0);
  const [sepia, setSepia] = useState(0);
  const [saturate, setSaturate] = useState(100);

  // 裁剪选框（相对原图像素）
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const draggingRef = useRef<{ startX: number; startY: number } | null>(null);

  // 缩放目标
  const [targetWidth, setTargetWidth] = useState<number>(0);
  const [targetHeight, setTargetHeight] = useState<number>(0);

  /** 组合出 CSS 滤镜串（只用于预览） */
  const previewFilter = useMemo(() => {
    const parts: string[] = [];
    if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
    if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
    if (blur > 0) parts.push(`blur(${blur}px)`);
    if (sepia > 0) parts.push(`sepia(${sepia}%)`);
    if (saturate !== 100) parts.push(`saturate(${saturate}%)`);
    // 预设滤镜与手动滑杆叠加
    const preset = FILTERS.find((f) => f.key === filterName);
    if (preset) {
      switch (preset.key) {
        case "grayscale":
          parts.push("grayscale(100%)");
          break;
        case "sepia":
          parts.push("sepia(80%)");
          break;
        case "invert":
          parts.push("invert(100%)");
          break;
        case "contrast":
          parts.push("contrast(150%)");
          break;
      }
    }
    return parts.length > 0 ? parts.join(" ") : "none";
  }, [brightness, contrast, blur, sepia, saturate, filterName]);

  /** 打开文件并加载信息 */
  const pickFile = useCallback(async () => {
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"] }],
      });
      if (typeof picked !== "string") return;
      setPath(picked);
      setCropMode(false);
      setCropRect({ x: 0, y: 0, w: 0, h: 0 });
    } catch (e) {
      msgApi.error(`打开失败：${e}`);
    }
  }, [msgApi]);

  /** 载入图片信息、缩略图与 EXIF */
  const loadMeta = useCallback(
    async (p: string) => {
      try {
        const [i, t, e] = await Promise.all([
          getImageInfo(p),
          getImageThumbnail(p, 1600),
          readExif(p).catch(() => null),
        ]);
        setInfo(i);
        setThumb(toDataUrl(t.data));
        setExif(e);
        setTargetWidth(i.width);
        setTargetHeight(i.height);
      } catch (err) {
        msgApi.error(`读取图片信息失败：${err}`);
      }
    },
    [msgApi]
  );

  useEffect(() => {
    if (path) void loadMeta(path);
  }, [path, loadMeta]);

  /** 生成输出路径 */
  const outPath = useCallback(
    (suffix: string, ext?: string) => {
      const base = path ?? "";
      const dir = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : WORK_DIR;
      const name = base.includes("/") ? base.slice(base.lastIndexOf("/") + 1) : "image";
      const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
      const finalExt = ext ?? (stem.includes(".") ? "" : "png");
      return `${dir}/${stem}${suffix}${finalExt ? `.${finalExt}` : ""}`;
    },
    [path]
  );

  /** 执行一个会改像素的操作 */
  const runOp = useCallback(
    async (label: string, fn: (dest: string) => Promise<void>, ext?: string) => {
      if (!path) return;
      setBusy(true);
      try {
        const dest = outPath(`_${label}`, ext);
        await fn(dest);
        msgApi.success(`${label}完成`);
        // 结果另存为后自动切到新文件，让用户能连续操作
        setPath(dest);
      } catch (e) {
        msgApi.error(`${label}失败：${e}`);
      } finally {
        setBusy(false);
      }
    },
    [path, outPath, msgApi]
  );

  /** 裁剪选框的鼠标交互 */
  const onImgMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!cropMode || !info) return;
    const el = imgRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const scaleX = info.width / box.width;
    const scaleY = info.height / box.height;
    const x = Math.round((e.clientX - box.left) * scaleX);
    const y = Math.round((e.clientY - box.top) * scaleY);
    draggingRef.current = { startX: x, startY: y };
    setCropRect({ x, y, w: 0, h: 0 });
  };

  const onImgMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const drag = draggingRef.current;
    const el = imgRef.current;
    if (!drag || !el || !info) return;
    const box = el.getBoundingClientRect();
    const scaleX = info.width / box.width;
    const scaleY = info.height / box.height;
    const x = Math.round((e.clientX - box.left) * scaleX);
    const y = Math.round((e.clientY - box.top) * scaleY);
    setCropRect({
      x: Math.min(drag.startX, x),
      y: Math.min(drag.startY, y),
      w: Math.abs(x - drag.startX),
      h: Math.abs(y - drag.startY),
    });
  };

  const onImgMouseUp = () => {
    draggingRef.current = null;
  };

  /** 应用裁剪 */
  const doCrop = useCallback(async () => {
    if (!path || !info) return;
    if (cropRect.w < 2 || cropRect.h < 2) {
      msgApi.warning("请先在图上拖拽选择裁剪区域");
      return;
    }
    await runOp("crop", (dest) =>
      cropImage(path, dest, cropRect.x, cropRect.y, cropRect.w, cropRect.h)
    );
  }, [path, info, cropRect, runOp, msgApi]);

  /** 清除 EXIF（隐私刚需） */
  const doStripExif = useCallback(async () => {
    if (!path) return;
    await runOp("noexif", (dest) => stripExif(path, dest));
  }, [path, runOp]);

  /** 导出为指定格式 */
  const doExport = useCallback(
    async (format: string) => {
      if (!path) return;
      const ext = format === "jpeg" ? "jpg" : format;
      await runOp(format, (dest) => exportImage(path, dest, format, 92), ext);
    },
    [path, runOp]
  );

  if (!path) {
    return (
      <div style={{ padding: "24px" }}>
        {msgContext}
        <Empty
          image={<FolderOpenOutlined style={{ fontSize: 44, color: "var(--ant-color-text-quaternary)" }} />}
          description={
            <Space direction="vertical" size={4}>
              <Typography.Text>选择一张图片开始编辑</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                像素级处理全部由能力层 cap-img 完成，导出即唯一真值
              </Typography.Text>
            </Space>
          }
        >
          <Button type="primary" icon={<FolderOpenOutlined />} onClick={pickFile}>
            选择图片
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 20px", display: "flex", gap: 16, height: "100%", overflow: "hidden" }}>
      {msgContext}

      {/* 预览区 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <Card
          size="small"
          title={
            <Space size={8}>
              <span style={{ fontSize: 13 }}>{path.split("/").pop()}</span>
              {info && (
                <Tag style={{ margin: 0, fontSize: 11 }}>
                  {info.width} × {info.height} · {info.format.toUpperCase()}
                </Tag>
              )}
              {info?.hasAlpha && (
                <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                  透明
                </Tag>
              )}
            </Space>
          }
          extra={
            <Space size={4}>
              <Button size="small" icon={<FolderOpenOutlined />} onClick={pickFile}>
                换一张
              </Button>
              <Tooltip title="清除全部 EXIF（隐私：抹掉 GPS 与机型，像素不动）">
                <Button
                  size="small"
                  icon={<SafetyCertificateOutlined />}
                  onClick={doStripExif}
                  disabled={busy}
                >
                  清除 EXIF
                </Button>
              </Tooltip>
            </Space>
          }
          styles={{ body: { padding: 12, overflow: "auto" } }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: 260,
              background: "var(--ant-color-fill-quaternary)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            {thumb ? (
              <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
                <img
                  ref={imgRef}
                  src={thumb}
                  alt="预览"
                  draggable={false}
                  onMouseDown={onImgMouseDown}
                  onMouseMove={onImgMouseMove}
                  onMouseUp={onImgMouseUp}
                  onMouseLeave={onImgMouseUp}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "52vh",
                    display: "block",
                    cursor: cropMode ? "crosshair" : "default",
                    filter: previewFilter,
                  }}
                />
                {cropMode && cropRect.w > 1 && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${(cropRect.x / (info?.width || 1)) * 100}%`,
                      top: `${(cropRect.y / (info?.height || 1)) * 100}%`,
                      width: `${(cropRect.w / (info?.width || 1)) * 100}%`,
                      height: `${(cropRect.h / (info?.height || 1)) * 100}%`,
                      border: "2px solid var(--ant-color-primary)",
                      background: "rgba(22,119,255,0.15)",
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            ) : (
              <Progress type="circle" size="small" />
            )}
          </div>
          {busy && <Progress percent={100} status="active" showInfo={false} size="small" />}
        </Card>
      </div>

      {/* 操作面板 */}
      <div style={{ width: 300, flexShrink: 0, overflow: "auto" }}>
        <Tabs
          size="small"
          items={[
            {
              key: "edit",
              label: "编辑",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Card size="small" title="裁剪">
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                      <Button
                        icon={<BorderOutlined />}
                        onClick={() => setCropMode((v) => !v)}
                        type={cropMode ? "primary" : "default"}
                        block
                      >
                        {cropMode ? "退出裁剪" : "框选裁剪区域"}
                      </Button>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {cropRect.w > 1
                          ? `已选 ${cropRect.w} × ${cropRect.h}（起点 ${cropRect.x},${cropRect.y}）`
                          : "开启后在预览图上拖拽"}
                      </Typography.Text>
                      <Button
                        type="primary"
                        onClick={doCrop}
                        disabled={!cropMode || cropRect.w < 2 || busy}
                        block
                      >
                        裁剪
                      </Button>
                    </Space>
                  </Card>

                  <Card size="small" title="旋转与翻转">
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                      <Space.Compact block>
                        <Button
                          icon={<RotateLeftOutlined />}
                          onClick={() => runOp("rot90", (d) => rotateImage(path, d, 90))}
                          disabled={busy}
                        >
                          左转
                        </Button>
                        <Button
                          icon={<RotateRightOutlined />}
                          onClick={() => runOp("rot270", (d) => rotateImage(path, d, 270))}
                          disabled={busy}
                        >
                          右转
                        </Button>
                      </Space.Compact>
                      <Button
                        icon={<SwapOutlined />}
                        onClick={() => runOp("rot180", (d) => rotateImage(path, d, 180))}
                        disabled={busy}
                        block
                      >
                        转 180°
                      </Button>
                      <Space.Compact block>
                        <Button
                          onClick={() => runOp("fliph", (d) => flipImage(path, d, true))}
                          disabled={busy}
                        >
                          水平翻转
                        </Button>
                        <Button
                          onClick={() => runOp("flipv", (d) => flipImage(path, d, false))}
                          disabled={busy}
                        >
                          垂直翻转
                        </Button>
                      </Space.Compact>
                    </Space>
                  </Card>

                  <Card size="small" title="缩放">
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                      <Space.Compact block>
                        <InputNumber
                          value={targetWidth}
                          onChange={(v) => setTargetWidth(v ?? 0)}
                          min={1}
                          addonBefore="宽"
                          style={{ width: "50%" }}
                        />
                        <InputNumber
                          value={targetHeight}
                          onChange={(v) => setTargetHeight(v ?? 0)}
                          min={1}
                          addonBefore="高"
                          style={{ width: "50%" }}
                        />
                      </Space.Compact>
                      <Button
                        onClick={() =>
                          runOp("resize", (d) =>
                            resizeImage(path, d, targetWidth, targetHeight)
                          )
                        }
                        disabled={busy || !targetWidth || !targetHeight}
                        block
                      >
                        缩放
                      </Button>
                    </Space>
                  </Card>

                  <Card size="small" title="滤镜（导出走能力层）">
                    <Space direction="vertical" size={10} style={{ width: "100%" }}>
                      <Select
                        value={filterName}
                        onChange={setFilterName}
                        style={{ width: "100%" }}
                        options={[
                          { value: "none", label: "无（仅调参）" },
                          ...FILTERS.map((f) => ({ value: f.key, label: f.label })),
                        ]}
                      />
                      {(
                        [
                          ["亮度", brightness, setBrightness],
                          ["对比度", contrast, setContrast],
                          ["饱和度", saturate, setSaturate],
                          ["模糊", blur, setBlur],
                          ["复古", sepia, setSepia],
                        ] as const
                      ).map(([label, value, setter]) => (
                        <div key={label}>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            {label}: {value}
                          </Typography.Text>
                          <Slider
                            min={label === "模糊" ? 0 : 0}
                            max={label === "模糊" ? 10 : 200}
                            value={value}
                            onChange={setter as (v: number) => void}
                          />
                        </div>
                      ))}
                      <Button
                        icon={<ThunderboltOutlined />}
                        onClick={() =>
                          runOp(filterName === "none" ? "adjust" : filterName, (d) =>
                            applyFilter(path, d, filterName === "none" ? "brightness" : filterName)
                          )
                        }
                        disabled={busy}
                        block
                      >
                        应用预设滤镜
                      </Button>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        滑杆只是预览；导出会由能力层重新计算像素
                      </Typography.Text>
                    </Space>
                  </Card>

                  <Card size="small" title="格式转换">
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                      <Button
                        icon={<SaveOutlined />}
                        onClick={() => doExport("png")}
                        disabled={busy}
                        block
                      >
                        导出 PNG
                      </Button>
                      <Button onClick={() => doExport("jpeg")} disabled={busy} block>
                        导出 JPEG
                      </Button>
                      <Button onClick={() => doExport("webp")} disabled={busy} block>
                        导出 WebP
                      </Button>
                    </Space>
                  </Card>
                </Space>
              ),
            },
            {
              key: "exif",
              label: "EXIF",
              children: (
                <ExifPanel exif={exif} onStrip={doStripExif} busy={busy} />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

/** EXIF 面板：按 IFD 分组展示全部字段 */
function ExifPanel({
  exif,
  onStrip,
  busy,
}: {
  exif: ExifData | null;
  onStrip: () => void;
  busy: boolean;
}) {
  if (!exif || exif.primary.fields.length + exif.exif.fields.length + exif.gps.fields.length === 0) {
    return (
      <Empty
        image={<InfoCircleOutlined style={{ fontSize: 34, color: "var(--ant-color-text-quaternary)" }} />}
        description="这张图片没有 EXIF 元数据"
        style={{ padding: "20px 0" }}
      />
    );
  }

  const groups: { label: string; fields: ExifField[] }[] = [
    { label: "主信息 (IFD0)", fields: exif.primary.fields },
    { label: "拍摄参数 (Exif)", fields: exif.exif.fields },
    { label: "GPS 定位", fields: exif.gps.fields },
    { label: "缩略图 (IFD1)", fields: exif.thumbnail.fields },
  ].filter((g) => g.fields.length > 0);

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="EXIF 全量读取"
        description={
          <span style={{ fontSize: 11 }}>
            共 {groups.reduce((n, g) => n + g.fields.length, 0)} 个字段
            {exif.littleEndian ? "（小端）" : "（大端）"}。
            分享照片前建议清除 GPS。
          </span>
        }
      />
      <Button
        icon={<SafetyCertificateOutlined />}
        onClick={onStrip}
        disabled={busy}
        danger
        block
      >
        清除全部 EXIF
      </Button>
      {groups.map((g) => (
        <Card key={g.label} size="small" title={g.label}>
          <Table
            size="small"
            pagination={false}
            showHeader={false}
            rowKey={(r) => `${r.name}-${r.tag}`}
            dataSource={g.fields}
            columns={[
              {
                title: "字段",
                dataIndex: "name",
                render: (name: string, r: ExifField) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text style={{ fontSize: 12 }}>{name}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                      0x{r.tag.toString(16).padStart(4, "0")} · {r.kind}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: "值",
                dataIndex: "display",
                render: (v: string) => (
                  <Typography.Text style={{ fontSize: 12, wordBreak: "break-all" }}>
                    {v || "—"}
                  </Typography.Text>
                ),
              },
            ]}
          />
        </Card>
      ))}
    </Space>
  );
}
