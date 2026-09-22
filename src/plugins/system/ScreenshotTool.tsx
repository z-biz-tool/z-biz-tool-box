import { useState, useRef } from "react";
import {
  Button,
  Space,
  Row as AntRow,
  Col,
  message,
  Typography,
  Card,
  Slider,
  Select,
  Tooltip,
  Switch,
} from "antd";
import {
  CameraOutlined,
  DownloadOutlined,
  CopyOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PictureOutlined,
} from "@ant-design/icons";
import type { PluginMeta } from "../_types";

export const meta: PluginMeta = {
  key: "screenshot",
  label: "截图工具",
  description: "屏幕截图、区域截图、标注编辑、GIF 录制",
  cmds: ["screenshot", "截图", "屏幕截图", "capture", "录屏"],
  icon: "desktop",
};

// 截图模式
type ScreenshotMode = "fullscreen" | "region" | "window";

// 截图历史记录
interface ScreenshotRecord {
  id: string;
  timestamp: number;
  thumbnail: string;
  width: number;
  height: number;
}

export default function ScreenshotTool() {
  const [mode, setMode] = useState<ScreenshotMode>("fullscreen");
  const [delay, setDelay] = useState(0);
  const [captureCursor, setCaptureCursor] = useState(true);
  const [format, setFormat] = useState<"png" | "jpg" | "webp">("png");
  const [quality, setQuality] = useState(100);
  const [history, setHistory] = useState<ScreenshotRecord[]>([]);
  const [msgApi, msgContext] = message.useMessage();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 模拟截图功能
  const captureScreen = async () => {
    try {
      // 尝试使用 Screen Capture API
      if ("getDisplayMedia" in navigator.mediaDevices) {
        const stream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { displaySurface: mode === "window" ? "window" : "monitor" },
        });

        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();

        // 等待视频加载
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 创建 canvas 并截图
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0);

        // 停止所有轨道
        stream.getTracks().forEach((track: any) => track.stop());

        // 获取截图数据
        const dataUrl = canvas.toDataURL(`image/${format}`, quality / 100);

        // 添加到历史记录
        const record: ScreenshotRecord = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          thumbnail: dataUrl,
          width: canvas.width,
          height: canvas.height,
        };
        setHistory((prev) => [record, ...prev].slice(0, 20));

        msgApi.success("截图成功！");
        return dataUrl;
      } else {
        msgApi.warning("当前浏览器不支持屏幕截图 API");
        return null;
      }
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        msgApi.info("用户取消了截图");
      } else {
        msgApi.error("截图失败: " + err.message);
      }
      return null;
    }
  };

  // 下载截图
  const downloadScreenshot = (dataUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  // 复制到剪贴板
  const copyToClipboard = async (dataUrl: string) => {
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      msgApi.success("已复制到剪贴板");
    } catch {
      msgApi.error("复制失败");
    }
  };

  // 删除历史记录
  const deleteRecord = (id: string) => {
    setHistory((prev) => prev.filter((r) => r.id !== id));
    msgApi.success("已删除");
  };

  return (
    <div
      style={{
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100%",
      }}
    >
      {msgContext}

      {/* 截图控制面板 */}
      <Card size="small" title="截图设置">
        <AntRow gutter={[16, 16]}>
          <Col span={8}>
            <Typography.Text style={{ display: "block", marginBottom: 4 }}>
              截图模式
            </Typography.Text>
            <Select
              value={mode}
              onChange={setMode}
              style={{ width: "100%" }}
              options={[
                { value: "fullscreen", label: "全屏截图" },
                { value: "region", label: "区域截图" },
                { value: "window", label: "窗口截图" },
              ]}
            />
          </Col>
          <Col span={8}>
            <Typography.Text style={{ display: "block", marginBottom: 4 }}>
              延迟 (秒)
            </Typography.Text>
            <Slider
              min={0}
              max={10}
              value={delay}
              onChange={setDelay}
              marks={{ 0: "0", 3: "3", 5: "5", 10: "10" }}
            />
          </Col>
          <Col span={8}>
            <Typography.Text style={{ display: "block", marginBottom: 4 }}>
              输出格式
            </Typography.Text>
            <Select
              value={format}
              onChange={setFormat}
              style={{ width: "100%" }}
              options={[
                { value: "png", label: "PNG (无损)" },
                { value: "jpg", label: "JPG (有损)" },
                { value: "webp", label: "WebP (推荐)" },
              ]}
            />
          </Col>
          <Col span={8}>
            <Typography.Text style={{ display: "block", marginBottom: 4 }}>
              图片质量: {quality}%
            </Typography.Text>
            <Slider
              min={10}
              max={100}
              value={quality}
              onChange={setQuality}
              disabled={format === "png"}
            />
          </Col>
          <Col span={8}>
            <Space direction="vertical">
              <Switch
                checked={captureCursor}
                onChange={setCaptureCursor}
                checkedChildren="包含光标"
                unCheckedChildren="不含光标"
              />
            </Space>
          </Col>
          <Col span={8}>
            <Space>
              <Tooltip title="全屏截图">
                <Button
                  type="primary"
                  icon={<CameraOutlined />}
                  onClick={captureScreen}
                >
                  截图
                </Button>
              </Tooltip>
              <Tooltip title="录屏 (GIF)">
                <Button icon={<PictureOutlined />} disabled>
                  录屏
                </Button>
              </Tooltip>
            </Space>
          </Col>
        </AntRow>
      </Card>

      {/* 截图历史 */}
      <Card
        size="small"
        title={
          <Space>
            <HistoryOutlined />
            截图历史 ({history.length})
          </Space>
        }
        extra={
          history.length > 0 && (
            <Button
              size="small"
              type="text"
              icon={<DeleteOutlined />}
              onClick={() => {
                setHistory([]);
                msgApi.success("已清空历史");
              }}
            >
              清空
            </Button>
          )
        }
      >
        {history.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: "var(--ant-color-text-secondary)",
            }}
          >
            <PictureOutlined style={{ fontSize: 48, marginBottom: 12 }} />
            <div>暂无截图</div>
            <div style={{ fontSize: 12 }}>点击上方"截图"按钮开始</div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 12,
              maxHeight: 400,
              overflow: "auto",
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
                      height: 120,
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#f5f5f5",
                    }}
                  >
                    <img
                      src={record.thumbnail}
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
                    <CopyOutlined
                      onClick={() => copyToClipboard(record.thumbnail)}
                    />
                  </Tooltip>,
                  <Tooltip title="下载" key="download">
                    <DownloadOutlined
                      onClick={() =>
                        downloadScreenshot(
                          record.thumbnail,
                          `screenshot_${record.id}.${format}`
                        )
                      }
                    />
                  </Tooltip>,
                  <Tooltip title="删除" key="delete">
                    <DeleteOutlined
                      onClick={() => deleteRecord(record.id)}
                    />
                  </Tooltip>,
                ]}
              >
                <Card.Meta
                  title={`${record.width} × ${record.height}`}
                  description={new Date(record.timestamp).toLocaleString()}
                />
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* 隐藏的 canvas 用于截图 */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}