import { useState, useEffect } from "react";
import {
  Input,
  Button,
  Space,
  Card,
  message,
  Row,
  Col,
  Statistic,
  Select,
  DatePicker,
  Radio,
  Tag,
} from "antd";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import dayOfYear from "dayjs/plugin/dayOfYear";
import isLeapYear from "dayjs/plugin/isLeapYear";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "timestamp",
  label: "时间戳",
  description: "Unix 时间戳/日期 多时区互转",
  icon: "clock",
};


dayjs.extend(utc);
dayjs.extend(dayOfYear);
dayjs.extend(isLeapYear);

type Mode = "ts2date" | "date2ts";
type Unit = "s" | "ms";

const TIMEZONES = [
  { value: "UTC", label: "UTC (协调世界时)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (北京时间)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (东京时间)" },
  { value: "Asia/Seoul", label: "Asia/Seoul (首尔时间)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (新加坡时间)" },
  { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong (香港时间)" },
  { value: "Asia/Taipei", label: "Asia/Taipei (台北时间)" },
  { value: "Europe/London", label: "Europe/London (伦敦时间)" },
  { value: "Europe/Paris", label: "Europe/Paris (巴黎时间)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (柏林时间)" },
  { value: "America/New_York", label: "America/New_York (纽约时间)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (洛杉矶时间)" },
  { value: "America/Chicago", label: "America/Chicago (芝加哥时间)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (悉尼时间)" },
];

export default function TimestampTool() {
  const [mode, setMode] = useState<Mode>("ts2date");
  const [unit, setUnit] = useState<Unit>("s");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [timestamp, setTimestamp] = useState("");
  const [dateStr, setDateStr] = useState<dayjs.Dayjs | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [currentNow, setCurrentNow] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const getNow = async () => {
    try {
      const result = await invoke<string>("execute_plugin", {
        pluginId: "timestamp",
        action: "now",
        input: "",
      });
      setCurrentNow(result);
    } catch {
      setCurrentNow(String(Math.floor(Date.now() / 1000)));
    }
  };

  const convertTs = () => {
    if (!timestamp) {
      message.warning("请输入时间戳");
      return;
    }
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) {
      message.error("无效的时间戳");
      return;
    }
    const ms = unit === "s" ? ts * 1000 : ts;
    setDateStr(dayjs(ms));
    message.success("转换成功");
  };

  const convertDate = () => {
    if (!dateStr) {
      message.warning("请选择日期");
      return;
    }
    const ts = dateStr.unix();
    setTimestamp(String(ts));
    message.success("转换成功");
  };

  const formatInTz = (d: dayjs.Dayjs | null): string => {
    if (!d) return "";
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(d.toDate());
    } catch {
      return d.format("YYYY-MM-DD HH:mm:ss");
    }
  };

  return (
    <Card title="时间戳转换" bordered={false}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Radio.Button value="ts2date">时间戳 → 日期</Radio.Button>
          <Radio.Button value="date2ts">日期 → 时间戳</Radio.Button>
        </Radio.Group>
        <Select
          value={timezone}
          onChange={setTimezone}
          options={TIMEZONES}
          style={{ width: 240 }}
        />
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="当前时间戳(秒)" value={now} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="当前时间戳(毫秒)" value={now * 1000} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ fontSize: 12, color: "#999" }}>当前时间 ({timezone})</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{formatInTz(dayjs())}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Button size="small" onClick={getNow} style={{ marginTop: 4 }}>
              获取时间戳
            </Button>
            {currentNow && <div style={{ fontSize: 12 }}>{currentNow}</div>}
          </Card>
        </Col>
      </Row>

      {mode === "ts2date" ? (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Radio.Group value={unit} onChange={(e) => setUnit(e.target.value)}>
              <Radio.Button value="s">秒</Radio.Button>
              <Radio.Button value="ms">毫秒</Radio.Button>
            </Radio.Group>
            <Input
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              placeholder="输入时间戳，如 1700000000"
              style={{ width: 250, fontFamily: "monospace" }}
            />
            <Button type="primary" onClick={convertTs}>
              转换
            </Button>
            <Button onClick={() => setTimestamp(String(now))}>填入当前</Button>
          </Space>
          {dateStr && (
            <Card size="small" type="inner">
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic title="本地时间" value={dateStr.format("YYYY-MM-DD HH:mm:ss")} />
                </Col>
                <Col span={6}>
                  <Statistic title={`${timezone}`} value={formatInTz(dateStr)} />
                </Col>
                <Col span={6}>
                  <Statistic title="UTC" value={dateStr.utc().format("YYYY-MM-DD HH:mm:ss")} />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="ISO 8601"
                    value={dateStr.toISOString()}
                    valueStyle={{ fontSize: 12 }}
                  />
                </Col>
              </Row>
              <div style={{ marginTop: 8 }}>
                <Tag color="blue">
                  星期{["日", "一", "二", "三", "四", "五", "六"][dateStr.day()]}
                </Tag>
                <Tag color="green">今年第 {Math.ceil(dateStr.dayOfYear() / 7)} 周</Tag>
                <Tag color="orange">{dateStr.isLeapYear() ? "闰年" : "平年"}</Tag>
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          <Space style={{ marginBottom: 12 }}>
            <DatePicker
              showTime
              value={dateStr}
              onChange={setDateStr}
              format="YYYY-MM-DD HH:mm:ss"
              style={{ width: 250 }}
            />
            <Button type="primary" onClick={convertDate}>
              转换
            </Button>
            <Button onClick={() => setDateStr(dayjs())}>填入当前</Button>
          </Space>
          {timestamp && (
            <Card size="small" type="inner">
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic title="时间戳(秒)" value={timestamp} />
                </Col>
                <Col span={12}>
                  <Statistic title="时间戳(毫秒)" value={parseInt(timestamp, 10) * 1000} />
                </Col>
              </Row>
            </Card>
          )}
        </>
      )}
    </Card>
  );
}
