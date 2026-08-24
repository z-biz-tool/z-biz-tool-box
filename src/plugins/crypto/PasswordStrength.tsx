import { useState, useMemo } from "react";
import { Card, Input, Progress, Tag, Row, Col, Statistic, List } from "antd";

import type { PluginMeta } from "../_types";
export const meta: PluginMeta = {
  key: "pwdstr",
  label: "密码强度",
  description: "密码强度评分与建议",
  cmds: ["pwdstr", "password strength", "密码强度"],
  icon: "shield",
};


interface Analysis {
  length: number;
  hasLower: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  hasSpace: boolean;
  uniqueChars: number;
  entropy: number;
  score: number;
  level: string;
  color: string;
  issues: string[];
}

function analyze(pwd: string): Analysis {
  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pwd);
  const hasSpace = /\s/.test(pwd);
  const uniqueChars = new Set(pwd).size;
  const length = pwd.length;

  let poolSize = 0;
  if (hasLower) poolSize += 26;
  if (hasUpper) poolSize += 26;
  if (hasNumber) poolSize += 10;
  if (hasSymbol) poolSize += 32;
  const entropy = length > 0 ? Math.round(length * Math.log2(poolSize || 1)) : 0;

  // 计算评分 0-100
  let score = 0;
  if (length >= 8) score += 10;
  if (length >= 12) score += 10;
  if (length >= 16) score += 10;
  if (length >= 20) score += 10;
  if (hasLower) score += 10;
  if (hasUpper) score += 10;
  if (hasNumber) score += 10;
  if (hasSymbol) score += 15;
  if (uniqueChars >= length * 0.7) score += 15;
  if (entropy >= 60) score += 10;
  if (entropy >= 100) score += 10;
  score = Math.min(100, score);

  // 常见弱密码检查
  const issues: string[] = [];
  if (length === 0) issues.push("密码为空");
  if (length > 0 && length < 8) issues.push("密码太短（建议至少 8 位）");
  if (/^(password|123456|qwerty|abc123|admin|letmein|welcome|monkey|dragon)/i.test(pwd))
    issues.push("常见弱密码");
  if (/^(\d+|[a-z]+)$/i.test(pwd) && length > 0) issues.push("仅包含单一类型字符");
  if (/(.)\1{2,}/.test(pwd)) issues.push("包含连续重复字符");
  if (/^(0123456|1234567|abcdefg|qwerty)/i.test(pwd)) issues.push("包含连续序列");
  if (!hasLower && length > 0) issues.push("缺少小写字母");
  if (!hasUpper && length > 0) issues.push("缺少大写字母");
  if (!hasNumber && length > 0) issues.push("缺少数字");
  if (!hasSymbol && length > 0) issues.push("缺少特殊符号");

  // 检测重复模式
  if (length >= 4) {
    for (let i = 1; i <= length / 2; i++) {
      const pattern = pwd.substr(0, i);
      if (
        pattern.repeat(Math.floor(length / i)) ===
        pwd.substr(0, pattern.length * Math.floor(length / i))
      ) {
        if (i < length / 2) issues.push("检测到重复模式");
        break;
      }
    }
  }

  let level: string, color: string;
  if (score < 30) {
    level = "非常弱";
    color = "#ff4d4f";
  } else if (score < 50) {
    level = "弱";
    color = "#fa8c16";
  } else if (score < 70) {
    level = "中等";
    color = "#faad14";
  } else if (score < 85) {
    level = "强";
    color = "#52c41a";
  } else {
    level = "非常强";
    color = "#13c2c2";
  }

  return {
    length,
    hasLower,
    hasUpper,
    hasNumber,
    hasSymbol,
    hasSpace,
    uniqueChars,
    entropy,
    score,
    level,
    color,
    issues,
  };
}

export default function PasswordStrength() {
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const analysis = useMemo(() => analyze(password), [password]);

  return (
    <Card title="密码强度检测" bordered={false}>
      <Input.Password
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="输入密码进行检测"
        visibilityToggle={{ visible: showPwd, onVisibleChange: setShowPwd }}
        size="large"
        style={{ marginBottom: 16 }}
      />
      {password && (
        <>
          <div style={{ marginBottom: 8 }}>
            <span style={{ marginRight: 12 }}>强度评分: {analysis.score}/100</span>
            <Tag color={analysis.color} style={{ fontSize: 14, padding: "2px 12px" }}>
              {analysis.level}
            </Tag>
          </div>
          <Progress
            percent={analysis.score}
            strokeColor={analysis.color}
            strokeWidth={16}
            style={{ marginBottom: 16 }}
          />
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic title="密码长度" value={analysis.length} />
            </Col>
            <Col span={6}>
              <Statistic title="唯一字符" value={analysis.uniqueChars} />
            </Col>
            <Col span={6}>
              <Statistic title="熵值" value={analysis.entropy} suffix="bits" />
            </Col>
            <Col span={6}>
              <Statistic
                title="破解难度"
                value={
                  analysis.entropy > 100
                    ? "极高"
                    : analysis.entropy > 60
                      ? "高"
                      : analysis.entropy > 36
                        ? "中"
                        : "低"
                }
              />
            </Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Tag color={analysis.hasLower ? "green" : "default"}>小写字母 a-z</Tag>
            </Col>
            <Col span={6}>
              <Tag color={analysis.hasUpper ? "green" : "default"}>大写字母 A-Z</Tag>
            </Col>
            <Col span={6}>
              <Tag color={analysis.hasNumber ? "green" : "default"}>数字 0-9</Tag>
            </Col>
            <Col span={6}>
              <Tag color={analysis.hasSymbol ? "green" : "default"}>特殊符号</Tag>
            </Col>
          </Row>
          {analysis.issues.length > 0 && (
            <Card size="small" title="安全建议" type="inner" style={{ marginTop: 8 }}>
              <List
                size="small"
                dataSource={analysis.issues}
                renderItem={(item) => (
                  <List.Item>
                    <span style={{ color: "#faad14" }}>⚠ {item}</span>
                  </List.Item>
                )}
              />
            </Card>
          )}
        </>
      )}
    </Card>
  );
}
