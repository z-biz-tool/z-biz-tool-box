import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Space,
  Tag,
  Row as AntRow,
  Col,
  message,
  Typography,
  Input,
  Select,
  Tooltip,
} from "antd";
import {
  CopyOutlined,
  ClearOutlined,
  FullscreenOutlined,
  AimOutlined,
} from "@ant-design/icons";
import { MONO_FONT } from "../../_shared";
import type { PluginMeta } from "../_types";

export const meta: PluginMeta = {
  key: "ruler",
  label: "屏幕标尺",
  description: "像素级测量屏幕元素尺寸、距离、角度",
  cmds: ["ruler", "标尺", "测量", "尺寸", "pixel", "measure"],
  icon: "scale",
};

// 测量单位
type MeasurementUnit = "px" | "rem" | "em" | "pt" | "dp";

// 测量点
interface Point {
  x: number;
  y: number;
}

// 测量结果
interface Measurement {
  width: number;
  height: number;
  diagonal: number;
  angle: number;
}

// 单位转换系数 (相对于 px)
const UNIT_FACTORS: Record<MeasurementUnit, number> = {
  px: 1,
  rem: 16, // 假设 1rem = 16px
  em: 16,
  pt: 1.333, // 1pt ≈ 1.333px
  dp: 1, // dp ≈ px (在桌面端)
};

export default function ScreenRuler() {
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [unit, setUnit] = useState<MeasurementUnit>("px");
  const [fontSize, setFontSize] = useState(16);
  const [msgApi, msgContext] = message.useMessage();

  // 计算测量结果
  const measurement = useCallback((): Measurement | null => {
    if (!startPoint || !currentPoint) return null;

    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);
    const diagonal = Math.sqrt(width * width + height * height);
    const angle =
      (Math.atan2(currentPoint.y - startPoint.y, currentPoint.x - startPoint.x) *
        180) /
      Math.PI;

    return { width, height, diagonal, angle };
  }, [startPoint, currentPoint]);

  // 单位转换
  const convertUnit = useCallback(
    (px: number): string => {
      const factor = unit === "em" ? fontSize : UNIT_FACTORS[unit];
      const value = px / factor;
      return `${value.toFixed(2)} ${unit}`;
    },
    [unit, fontSize]
  );

  // 开始测量
  const startMeasurement = useCallback(() => {
    setIsMeasuring(true);
    setStartPoint(null);
    setCurrentPoint(null);
    msgApi.info("点击并拖动进行测量");
  }, [msgApi]);

  // 停止测量
  const stopMeasurement = useCallback(() => {
    setIsMeasuring(false);
  }, []);

  // 鼠标事件处理
  useEffect(() => {
    if (!isMeasuring) return;

    const handleMouseDown = (e: MouseEvent) => {
      const point = { x: e.clientX, y: e.clientY };
      setStartPoint(point);
      setCurrentPoint(point);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const point = { x: e.clientX, y: e.clientY };
      setCurrentPoint(point);
    };

    const handleMouseUp = () => {
      stopMeasurement();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMeasuring(false);
        setStartPoint(null);
        setCurrentPoint(null);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMeasuring, stopMeasurement]);

  // 复制测量结果
  const copyResult = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => msgApi.success("已复制"),
      () => msgApi.error("复制失败")
    );
  };

  // 清空
  const clear = () => {
    setStartPoint(null);
    setCurrentPoint(null);
  };

  // 获取测量结果
  const result = measurement();

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

      {/* 测量控制面板 */}
      <AntRow gutter={[16, 16]} align="middle">
        <Col>
          <Space>
            <Button
              type={isMeasuring ? "default" : "primary"}
              danger={isMeasuring}
              icon={isMeasuring ? <ClearOutlined /> : <AimOutlined />}
              onClick={isMeasuring ? clear : startMeasurement}
            >
              {isMeasuring ? "取消测量" : "开始测量"}
            </Button>
            <Tooltip title="全屏测量模式">
              <Button
                icon={<FullscreenOutlined />}
                onClick={startMeasurement}
                disabled={isMeasuring}
              >
                全屏
              </Button>
            </Tooltip>
          </Space>
        </Col>
        <Col>
          <Space>
            <Typography.Text>单位:</Typography.Text>
            <Select
              value={unit}
              onChange={setUnit}
              style={{ width: 80 }}
              size="small"
              options={[
                { value: "px", label: "px" },
                { value: "rem", label: "rem" },
                { value: "em", label: "em" },
                { value: "pt", label: "pt" },
                { value: "dp", label: "dp" },
              ]}
            />
            {unit === "em" && (
              <>
                <Typography.Text>字号:</Typography.Text>
                <Input
                  type="number"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  style={{ width: 60 }}
                  size="small"
                />
                <Typography.Text type="secondary">px</Typography.Text>
              </>
            )}
          </Space>
        </Col>
        <Col flex="auto" />
        <Col>
          <Tag color={isMeasuring ? "processing" : "default"}>
            {isMeasuring ? "测量中 - 点击拖动" : "就绪"}
          </Tag>
        </Col>
      </AntRow>

      {/* 测量结果 */}
      {result && (
        <AntRow gutter={[16, 16]}>
          <Col span={6}>
            <div
              style={{
                background: "var(--ant-color-bg-layout)",
                borderRadius: 8,
                padding: 12,
                textAlign: "center",
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                宽度
              </Typography.Text>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  fontFamily: MONO_FONT,
                }}
              >
                {convertUnit(result.width)}
              </div>
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined />}
                onClick={() => copyResult(convertUnit(result.width))}
              />
            </div>
          </Col>
          <Col span={6}>
            <div
              style={{
                background: "var(--ant-color-bg-layout)",
                borderRadius: 8,
                padding: 12,
                textAlign: "center",
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                高度
              </Typography.Text>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  fontFamily: MONO_FONT,
                }}
              >
                {convertUnit(result.height)}
              </div>
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined />}
                onClick={() => copyResult(convertUnit(result.height))}
              />
            </div>
          </Col>
          <Col span={6}>
            <div
              style={{
                background: "var(--ant-color-bg-layout)",
                borderRadius: 8,
                padding: 12,
                textAlign: "center",
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                对角线
              </Typography.Text>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  fontFamily: MONO_FONT,
                }}
              >
                {convertUnit(result.diagonal)}
              </div>
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined />}
                onClick={() => copyResult(convertUnit(result.diagonal))}
              />
            </div>
          </Col>
          <Col span={6}>
            <div
              style={{
                background: "var(--ant-color-bg-layout)",
                borderRadius: 8,
                padding: 12,
                textAlign: "center",
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                角度
              </Typography.Text>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  fontFamily: MONO_FONT,
                }}
              >
                {result.angle.toFixed(1)}°
              </div>
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined />}
                onClick={() => copyResult(`${result.angle.toFixed(1)}°`)}
              />
            </div>
          </Col>
        </AntRow>
      )}

      {/* 坐标信息 */}
      {startPoint && (
        <AntRow gutter={[16, 16]}>
          <Col span={12}>
            <div
              style={{
                background: "var(--ant-color-bg-layout)",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                起点坐标
              </Typography.Text>
              <div style={{ fontFamily: MONO_FONT }}>
                X: {startPoint.x}, Y: {startPoint.y}
              </div>
            </div>
          </Col>
          <Col span={12}>
            <div
              style={{
                background: "var(--ant-color-bg-layout)",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                当前坐标
              </Typography.Text>
              <div style={{ fontFamily: MONO_FONT }}>
                X: {currentPoint?.x ?? "-"}, Y: {currentPoint?.y ?? "-"}
              </div>
            </div>
          </Col>
        </AntRow>
      )}

      {/* 使用说明 */}
      <div
        style={{
          background: "var(--ant-color-bg-layout)",
          borderRadius: 8,
          padding: 12,
          marginTop: "auto",
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          <strong>使用说明:</strong>
          <br />
          1. 点击"开始测量"进入测量模式
          <br />
          2. 在屏幕上点击并拖动绘制测量区域
          <br />
          3. 松开鼠标完成测量
          <br />
          4. 按 ESC 键取消当前测量
          <br />
          5. 支持 px、rem、em、pt、dp 等单位
        </Typography.Text>
      </div>
    </div>
  );
}