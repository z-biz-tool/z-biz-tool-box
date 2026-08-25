import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Button, Space, Card, message, Segmented, Empty, Typography } from "antd";
import { FileImageOutlined, CopyOutlined, ClearOutlined, UploadOutlined } from "@ant-design/icons";
import { useCopyToClipboard, useClearAll, usePluginInput, useCommonStyles } from "../../_shared";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "image-base64",
  label: "图片 Base64",
  description: "图片 ↔ Base64 字符串,可复制 data URL",
  keywords: "image base64 图片 dataurl data-url img preview 预览",
  order: 5,
  icon: "file",
};

type Mode = "encode" | "decode";

/**
 * 图片 Base64 编解码 — 演示插件架构:
 *   这一个文件被 _registry.tsx 的 import.meta.glob 自动收进菜单栏 / 侧边栏 / QuickOpen,
 *   不需要改 registry / App / 任何其他文件。
 */
export default function ImageBase64Tool() {
  const s = useCommonStyles();
  const [mode, setMode] = useState<Mode>("decode");
  const [input, setInput] = usePluginInput("image-base64");
  const [dataUrl, setDataUrl] = useState("");
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const copy = useCopyToClipboard();

  // 解码模式:输入变化时尝试解析
  useEffect(() => {
    if (mode !== "decode") {
      setDataUrl("");
      setSize(null);
      setErr(null);
      return;
    }
    const v = input.trim();
    if (!v) {
      setDataUrl("");
      setSize(null);
      setErr(null);
      return;
    }
    // 接受 data URL 或纯 base64
    const url = v.startsWith("data:") ? v : `data:image/*;base64,${v}`;
    const img = new Image();
    img.onload = () => {
      setDataUrl(url);
      setSize({ w: img.naturalWidth, h: img.naturalHeight });
      setErr(null);
    };
    img.onerror = () => {
      setDataUrl("");
      setSize(null);
      setErr("Base64 解析失败:不是有效的图片数据");
    };
    img.src = url;
  }, [mode, input]);

  // 编码模式:从 file → dataURL
  const onPickFile = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      message.error("请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      setInput(result);
      message.success(`已加载 ${f.name} (${(f.size / 1024).toFixed(1)} KB)`);
    };
    reader.onerror = () => message.error("文件读取失败");
    reader.readAsDataURL(f);
  };

  const base64Only = useMemo(() => {
    if (!dataUrl) return "";
    const i = dataUrl.indexOf(",");
    return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  }, [dataUrl]);

  const clear = useClearAll([
    () => setInput(""),
    () => {
      setDataUrl("");
      setSize(null);
      setErr(null);
      if (fileRef.current) fileRef.current.value = "";
    },
  ]);

  return (
    <Card
      title="图片 Base64 编解码"
      bordered={false}
      extra={
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { label: "解码 Base64 → 图片", value: "decode" },
            { label: "编码 图片 → Base64", value: "encode" },
          ]}
        />
      }
    >
      {mode === "encode" ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onPickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              style={{
                border: "2px dashed var(--ant-color-border)",
                borderRadius: 8,
                padding: 40,
                textAlign: "center",
                cursor: "pointer",
                background: "var(--ant-color-bg-layout)",
              }}
            >
              <UploadOutlined style={{ fontSize: 32, color: "var(--ant-color-primary)" }} />
              <div style={{ marginTop: 8 }}>
                点击选择图片,或把图片<strong>拖到这里</strong>
              </div>
            </div>
            <Input.TextArea
              rows={6}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="data URL 会出现在这里..."
              readOnly={input.startsWith("data:") && input.length > 1000}
            />
            <Space>
              <Button onClick={() => fileRef.current?.click()} icon={<UploadOutlined />}>
                重新选择
              </Button>
              <Button onClick={clear} icon={<ClearOutlined />}>
                清空
              </Button>
              <Button
                type="primary"
                onClick={() => copy(input)}
                disabled={!input}
                icon={<CopyOutlined />}
              >
                复制 data URL
              </Button>
              <Button onClick={() => copy(base64Only)} disabled={!base64Only} icon={<CopyOutlined />}>
                复制纯 Base64
              </Button>
            </Space>
          </Space>
        </>
      ) : (
        <>
          <Input.TextArea
            rows={6}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴 Base64 字符串(带或不带 data:image/...;base64, 前缀都行)"
          />
          <Space style={s.btnRow}>
            <Button onClick={clear} icon={<ClearOutlined />}>
              清空
            </Button>
            <Button
              type="primary"
              onClick={() => copy(dataUrl)}
              disabled={!dataUrl}
              icon={<CopyOutlined />}
            >
              复制 data URL
            </Button>
            <Button onClick={() => copy(base64Only)} disabled={!base64Only} icon={<CopyOutlined />}>
              复制纯 Base64
            </Button>
          </Space>
          {err ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<Typography.Text type="danger">{err}</Typography.Text>}
              style={{ marginTop: 24 }}
            />
          ) : dataUrl ? (
            <Card size="small" style={{ marginTop: 16 }}>
              <Space align="start" size="large">
                <img
                  src={dataUrl}
                  alt="preview"
                  style={{ maxWidth: 360, maxHeight: 240, borderRadius: 4, border: "1px solid var(--ant-color-border)" }}
                />
                <Space direction="vertical" size={4}>
                  <Typography.Text strong>
                    <FileImageOutlined /> {size?.w} × {size?.h} px
                  </Typography.Text>
                  <Typography.Text type="secondary">原始 Base64: {base64Only.length} 字符</Typography.Text>
                  <Typography.Text type="secondary">data URL: {dataUrl.length} 字符</Typography.Text>
                </Space>
              </Space>
            </Card>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="粘贴 Base64 试试" style={{ marginTop: 24 }} />
          )}
        </>
      )}
    </Card>
  );
}
