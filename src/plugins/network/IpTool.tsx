import { useState } from "react";
import { Card, Input, Button, Space, Row, Col, Statistic, Tag, Alert, message } from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "ip",
  label: "IP 工具",
  description: "IP/子网掩码/CIDR 计算",
  icon: "globe",
};


function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function intToIp(int: number): string {
  return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join(".");
}

function countBits(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>>= 1;
  }
  return count;
}

function maskFromCidr(cidr: number): number {
  if (cidr < 0 || cidr > 32) return 0;
  return cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
}

function maskToInt(mask: string): number | null {
  const int = ipToInt(mask);
  if (int === null) return null;
  // 验证是否为合法掩码（连续 1 后跟连续 0）
  const inverted = ~int >>> 0;
  const isValid = (inverted & (inverted + 1)) === 0;
  return isValid ? int : null;
}

const PRIVATE_RANGES = [
  { start: ipToInt("10.0.0.0")!, end: ipToInt("10.255.255.255")!, name: "A类私有" },
  { start: ipToInt("172.16.0.0")!, end: ipToInt("172.31.255.255")!, name: "B类私有" },
  { start: ipToInt("192.168.0.0")!, end: ipToInt("192.168.255.255")!, name: "C类私有" },
  { start: ipToInt("127.0.0.0")!, end: ipToInt("127.255.255.255")!, name: "环回地址" },
  { start: ipToInt("169.254.0.0")!, end: ipToInt("169.254.255.255")!, name: "链路本地" },
];

function getIpClass(ip: string): string {
  const first = parseInt(ip.split(".")[0], 10);
  if (first < 128) return "A 类";
  if (first < 192) return "B 类";
  if (first < 224) return "C 类";
  if (first < 240) return "D 类（组播）";
  return "E 类（保留）";
}

function isPrivate(ipInt: number): string | null {
  for (const range of PRIVATE_RANGES) {
    if (ipInt >= range.start && ipInt <= range.end) return range.name;
  }
  return null;
}

export default function IpTool() {
  const [ip, setIp] = useState("192.168.1.100");
  const [mask, setMask] = useState("255.255.255.0");
  const [cidr, setCidr] = useState("24");
  const [result, setResult] = useState<{
    network: string;
    broadcast: string;
    hostMin: string;
    hostMax: string;
    totalHosts: number;
    usableHosts: number;
    wildcard: string;
    ipClass: string;
    privateType: string | null;
    isNetwork: boolean;
    isBroadcast: boolean;
    isHost: boolean;
  } | null>(null);
  const [error, setError] = useState("");

  const calculate = () => {
    setError("");
    const ipInt = ipToInt(ip);
    if (ipInt === null) {
      setError("无效的 IP 地址");
      setResult(null);
      return;
    }

    let maskInt: number | null;
    if (mask) {
      maskInt = maskToInt(mask);
      if (maskInt === null) {
        setError("无效的子网掩码");
        setResult(null);
        return;
      }
      const bits = countBits(maskInt);
      setCidr(String(bits));
    } else if (cidr) {
      const cidrNum = parseInt(cidr, 10);
      if (isNaN(cidrNum) || cidrNum < 0 || cidrNum > 32) {
        setError("无效的 CIDR");
        setResult(null);
        return;
      }
      maskInt = maskFromCidr(cidrNum);
      setMask(intToIp(maskInt));
    } else {
      setError("请输入子网掩码或 CIDR");
      setResult(null);
      return;
    }

    const network = (ipInt & maskInt) >>> 0;
    const wildcard = ~maskInt >>> 0;
    const broadcast = (network | wildcard) >>> 0;
    const totalHosts = wildcard + 1;
    const usableHosts = totalHosts > 2 ? totalHosts - 2 : totalHosts;
    const hostMin = totalHosts > 2 ? (network + 1) >>> 0 : network;
    const hostMax = totalHosts > 2 ? (broadcast - 1) >>> 0 : broadcast;

    setResult({
      network: intToIp(network),
      broadcast: intToIp(broadcast),
      hostMin: intToIp(hostMin),
      hostMax: intToIp(hostMax),
      totalHosts,
      usableHosts,
      wildcard: intToIp(wildcard),
      ipClass: getIpClass(ip),
      privateType: isPrivate(ipInt),
      isNetwork: ipInt === network,
      isBroadcast: ipInt === broadcast,
      isHost: ipInt !== network && ipInt !== broadcast,
    });
    message.success("计算完成");
  };

  return (
    <Card title="IP / 子网计算器" bordered={false}>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="IP 地址，如 192.168.1.1"
          style={{ width: 180, fontFamily: "monospace" }}
        />
        <Input
          value={mask}
          onChange={(e) => setMask(e.target.value)}
          placeholder="子网掩码"
          style={{ width: 160, fontFamily: "monospace" }}
        />
        <span>/</span>
        <Input
          value={cidr}
          onChange={(e) => setCidr(e.target.value)}
          placeholder="CIDR"
          style={{ width: 60, fontFamily: "monospace" }}
        />
        <Button type="primary" onClick={calculate}>
          计算
        </Button>
      </Space>
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      {result && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="网络地址"
                  value={result.network}
                  valueStyle={{ fontFamily: "monospace", fontSize: 16 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="广播地址"
                  value={result.broadcast}
                  valueStyle={{ fontFamily: "monospace", fontSize: 16 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="可用主机数" value={result.usableHosts} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="总地址数" value={result.totalHosts} />
              </Card>
            </Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="第一个主机"
                  value={result.hostMin}
                  valueStyle={{ fontFamily: "monospace", fontSize: 14 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="最后主机"
                  value={result.hostMax}
                  valueStyle={{ fontFamily: "monospace", fontSize: 14 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="通配符掩码"
                  value={result.wildcard}
                  valueStyle={{ fontFamily: "monospace", fontSize: 14 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="IP 类型" value={result.ipClass} />
              </Card>
            </Col>
          </Row>
          <Card size="small" type="inner" title="属性">
            <Space wrap>
              {result.privateType ? (
                <Tag color="orange">私有地址 ({result.privateType})</Tag>
              ) : (
                <Tag color="blue">公网地址</Tag>
              )}
              {result.isNetwork && <Tag color="purple">网络地址</Tag>}
              {result.isBroadcast && <Tag color="red">广播地址</Tag>}
              {result.isHost && <Tag color="green">主机地址</Tag>}
              <Tag color="cyan">
                CIDR: {ip}/{cidr}
              </Tag>
            </Space>
          </Card>
        </>
      )}
    </Card>
  );
}
