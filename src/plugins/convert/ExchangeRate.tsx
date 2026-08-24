import { useState, useEffect } from "react";
import { Card, Select, InputNumber, Row, Col, Statistic, Space, Tag, Alert, message } from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "exchange",
  label: "汇率换算",
  description: "在线/离线参考汇率",
  cmds: ["exchange", "currency", "汇率", "汇率换算"],
  icon: "dollar",
};


const CURRENCIES: Record<string, { name: string; symbol: string; flag: string }> = {
  USD: { name: "美元", symbol: "$", flag: "🇺🇸" },
  EUR: { name: "欧元", symbol: "€", flag: "🇪🇺" },
  GBP: { name: "英镑", symbol: "£", flag: "🇬🇧" },
  JPY: { name: "日元", symbol: "¥", flag: "🇯🇵" },
  CNY: { name: "人民币", symbol: "¥", flag: "🇨🇳" },
  KRW: { name: "韩元", symbol: "₩", flag: "🇰🇷" },
  HKD: { name: "港币", symbol: "HK$", flag: "🇭🇰" },
  TWD: { name: "新台币", symbol: "NT$", flag: "🇹🇼" },
  AUD: { name: "澳元", symbol: "A$", flag: "🇦🇺" },
  CAD: { name: "加元", symbol: "C$", flag: "🇨🇦" },
  CHF: { name: "瑞士法郎", symbol: "Fr", flag: "🇨🇭" },
  SGD: { name: "新加坡元", symbol: "S$", flag: "🇸🇬" },
  RUB: { name: "俄罗斯卢布", symbol: "₽", flag: "🇷🇺" },
  INR: { name: "印度卢比", symbol: "₹", flag: "🇮🇳" },
  BRL: { name: "巴西雷亚尔", symbol: "R$", flag: "🇧🇷" },
  THB: { name: "泰铢", symbol: "฿", flag: "🇹🇭" },
  MYR: { name: "马来西亚林吉特", symbol: "RM", flag: "🇲🇾" },
  PHP: { name: "菲律宾比索", symbol: "₱", flag: "🇵🇭" },
  VND: { name: "越南盾", symbol: "₫", flag: "🇻🇳" },
  IDR: { name: "印尼盾", symbol: "Rp", flag: "🇮🇩" },
};

// 离线参考汇率（以 USD 为基准，仅供演示）
const OFFLINE_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.5,
  CNY: 7.24,
  KRW: 1335,
  HKD: 7.82,
  TWD: 31.8,
  AUD: 1.52,
  CAD: 1.36,
  CHF: 0.88,
  SGD: 1.35,
  RUB: 92.5,
  INR: 83.2,
  BRL: 4.95,
  THB: 35.8,
  MYR: 4.65,
  PHP: 56.3,
  VND: 24300,
  IDR: 15800,
};

export default function ExchangeRate() {
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("CNY");
  const [amount, setAmount] = useState(100);
  const [rates, setRates] = useState<Record<string, number>>(OFFLINE_RATES);
  const [source, setSource] = useState<"offline" | "online">("offline");
  const [loading, setLoading] = useState(false);

  const fetchRates = async () => {
    setLoading(true);
    try {
      // 尝试从公开 API 获取汇率
      const resp = await fetch("https://open.er-api.com/v6/latest/USD");
      if (resp.ok) {
        const data = await resp.json();
        if (data.rates) {
          setRates(data.rates);
          setSource("online");
          message.success("汇率已更新（在线）");
          return;
        }
      }
      throw new Error("API 不可用");
    } catch {
      setRates(OFFLINE_RATES);
      setSource("offline");
      message.info("使用离线参考汇率");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  const convert = (): number => {
    const usdAmount = amount / (rates[from] || OFFLINE_RATES[from] || 1);
    return usdAmount * (rates[to] || OFFLINE_RATES[to] || 1);
  };

  const result = convert();
  const inverseRate = (rates[from] || 1) / (rates[to] || 1);
  const toInfo = CURRENCIES[to];

  return (
    <Card title="汇率换算" bordered={false}>
      <Space style={{ marginBottom: 16 }}>
        <Tag color={source === "online" ? "green" : "orange"}>
          {source === "online" ? "在线汇率" : "离线参考汇率"}
        </Tag>
        <a onClick={fetchRates} style={{ fontSize: 12 }}>
          {loading ? "更新中..." : "刷新汇率"}
        </a>
      </Space>
      <Alert
        type="info"
        message="汇率仅供参考，实际交易请以银行牌价为准"
        style={{ marginBottom: 16 }}
        showIcon
      />
      <Row gutter={16} align="middle">
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>金额</div>
          <InputNumber
            value={amount}
            onChange={(v) => setAmount(v || 0)}
            style={{ width: "100%" }}
            size="large"
            min={0}
          />
        </Col>
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>源货币</div>
          <Select
            value={from}
            onChange={setFrom}
            style={{ width: "100%" }}
            size="large"
            showSearch
            optionFilterProp="label"
            options={Object.entries(CURRENCIES).map(([code, info]) => ({
              value: code,
              label: `${info.flag} ${code} - ${info.name}`,
            }))}
          />
        </Col>
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>目标货币</div>
          <Select
            value={to}
            onChange={setTo}
            style={{ width: "100%" }}
            size="large"
            showSearch
            optionFilterProp="label"
            options={Object.entries(CURRENCIES).map(([code, info]) => ({
              value: code,
              label: `${info.flag} ${code} - ${info.name}`,
            }))}
          />
        </Col>
      </Row>
      <Space style={{ margin: "12px 0" }}>
        <button
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          style={{ cursor: "pointer", padding: "4px 12px" }}
        >
          ⇄ 交换
        </button>
      </Space>
      <Card size="small" type="inner">
        <Statistic
          title={`${amount} ${from} =`}
          value={Number(result.toFixed(2))}
          suffix={to}
          prefix={toInfo.symbol}
          valueStyle={{ fontSize: 28, color: "#1890ff" }}
        />
      </Card>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Statistic
            title={`1 ${from} =`}
            value={Number(((rates[to] || 1) / (rates[from] || 1)).toFixed(4))}
            suffix={to}
          />
        </Col>
        <Col span={12}>
          <Statistic title={`1 ${to} =`} value={Number(inverseRate.toFixed(4))} suffix={from} />
        </Col>
      </Row>
    </Card>
  );
}
