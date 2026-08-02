import { useState } from "react";
import {
  Card,
  Slider,
  Checkbox,
  Button,
  Space,
  Input,
  Progress,
  Tag,
  List,
  Typography,
  Row,
  Col,
  message,
} from "antd";

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?";

interface CharSets {
  lower: boolean;
  upper: boolean;
  number: boolean;
  symbol: boolean;
}

export default function PasswordGen() {
  const [length, setLength] = useState(16);
  const [charSets, setCharSets] = useState<CharSets>({
    lower: true,
    upper: true,
    number: true,
    symbol: true,
  });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [password, setPassword] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [strength, setStrength] = useState(0);

  const generate = () => {
    let pool = "";
    if (charSets.lower) pool += LOWERCASE;
    if (charSets.upper) pool += UPPERCASE;
    if (charSets.number) pool += NUMBERS;
    if (charSets.symbol) pool += SYMBOLS;

    if (excludeAmbiguous) {
      pool = pool.replace(/[0O1lI|`'"]/g, "");
    }

    if (!pool) {
      message.warning("请至少选择一种字符类型");
      return;
    }

    // 使用 crypto.getRandomValues 安全随机
    const result = new Array(length);
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      result[i] = pool[randomValues[i] % pool.length];
    }
    const pwd = result.join("");
    setPassword(pwd);
    setStrength(calcStrength(pwd, pool.length));
    setHistory([pwd, ...history].slice(0, 10));
  };

  const calcStrength = (pwd: string, poolSize: number): number => {
    // 熵 = 长度 * log2(字符集大小)
    const entropy = pwd.length * Math.log2(poolSize);
    // 映射到 0-100
    return Math.min(100, Math.round((entropy / 100) * 100));
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("已复制");
  };

  const strengthColor = strength < 40 ? "#ff4d4f" : strength < 70 ? "#faad14" : "#52c41a";
  const strengthLabel = strength < 40 ? "弱" : strength < 70 ? "中" : "强";

  return (
    <Card title="密码生成器" bordered={false}>
      <Row gutter={16}>
        <Col span={16}>
          <div style={{ marginBottom: 8 }}>
            <span>
              密码长度: <Tag color="blue">{length}</Tag>
            </span>
          </div>
          <Slider min={4} max={64} value={length} onChange={setLength} />
        </Col>
      </Row>
      <Space direction="vertical" style={{ width: "100%", marginBottom: 12 }}>
        <Checkbox
          checked={charSets.lower}
          onChange={(e) => setCharSets({ ...charSets, lower: e.target.checked })}
        >
          小写字母 (a-z)
        </Checkbox>
        <Checkbox
          checked={charSets.upper}
          onChange={(e) => setCharSets({ ...charSets, upper: e.target.checked })}
        >
          大写字母 (A-Z)
        </Checkbox>
        <Checkbox
          checked={charSets.number}
          onChange={(e) => setCharSets({ ...charSets, number: e.target.checked })}
        >
          数字 (0-9)
        </Checkbox>
        <Checkbox
          checked={charSets.symbol}
          onChange={(e) => setCharSets({ ...charSets, symbol: e.target.checked })}
        >
          特殊符号 (!@#$...)
        </Checkbox>
        <Checkbox
          checked={excludeAmbiguous}
          onChange={(e) => setExcludeAmbiguous(e.target.checked)}
        >
          排除易混淆字符 (0 O 1 l I |)
        </Checkbox>
      </Space>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={generate}>
          生成密码
        </Button>
        <Button onClick={() => generate()}>刷新</Button>
        <Button
          onClick={() => {
            setPassword("");
            setStrength(0);
          }}
        >
          清空
        </Button>
      </Space>
      {password && (
        <div style={{ marginBottom: 16 }}>
          <Input.Search
            value={password}
            readOnly
            enterButton="复制"
            style={{ fontFamily: "monospace", fontSize: 16 }}
            onSearch={() => copy(password)}
          />
          <div style={{ marginTop: 8 }}>
            <span style={{ marginRight: 8 }}>强度:</span>
            <Progress
              percent={strength}
              strokeColor={strengthColor}
              style={{ width: 200, display: "inline-flex" }}
            />
            <Tag
              color={strength < 40 ? "red" : strength < 70 ? "orange" : "green"}
              style={{ marginLeft: 8 }}
            >
              {strengthLabel} (熵 ~
              {Math.round(
                password.length *
                  Math.log2(
                    (charSets.lower ? 26 : 0) +
                      (charSets.upper ? 26 : 0) +
                      (charSets.number ? 10 : 0) +
                      (charSets.symbol ? 26 : 0) || 1
                  )
              )}{" "}
              bits)
            </Tag>
          </div>
        </div>
      )}
      {history.length > 0 && (
        <Card size="small" title="历史记录" type="inner">
          <List
            size="small"
            dataSource={history}
            renderItem={(item, index) => (
              <List.Item
                actions={[
                  <Button size="small" onClick={() => copy(item)}>
                    复制
                  </Button>,
                ]}
              >
                <Typography.Text code style={{ fontFamily: "monospace" }}>
                  {index + 1}. {item}
                </Typography.Text>
              </List.Item>
            )}
          />
        </Card>
      )}
    </Card>
  );
}
