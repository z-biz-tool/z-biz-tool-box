import { useState } from "react";
import { Input, Button, Space, Card, message, Select, Tag, Row, Col, Statistic } from "antd";

const ALGORITHMS = [
  { value: "md5", label: "MD5 (128位)" },
  { value: "sha-1", label: "SHA-1 (160位)" },
  { value: "sha-256", label: "SHA-256 (256位)" },
  { value: "sha-384", label: "SHA-384 (384位)" },
  { value: "sha-512", label: "SHA-512 (512位)" },
];

export default function HashTool() {
  const [input, setInput] = useState("");
  const [algo, setAlgo] = useState("sha-256");
  const [results, setResults] = useState<Record<string, string>>({});

  const computeHash = async (algorithm: string, text: string): Promise<string> => {
    const data = new TextEncoder().encode(text);
    let hashName = algorithm;
    if (algorithm === "md5") {
      // Web Crypto 不支持 MD5，使用简易实现
      return md5(text);
    }
    const hashBuffer = await crypto.subtle.digest(hashName, data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const generate = async () => {
    if (!input) {
      message.warning("请输入文本");
      return;
    }
    try {
      const hash = await computeHash(algo, input);
      setResults({ ...results, [algo]: hash });
      message.success(`${algo.toUpperCase()} 哈希计算完成`);
    } catch {
      message.error("计算失败");
    }
  };

  const generateAll = async () => {
    if (!input) {
      message.warning("请输入文本");
      return;
    }
    const all: Record<string, string> = {};
    for (const a of ALGORITHMS) {
      try {
        all[a.value] = await computeHash(a.value, input);
      } catch {
        all[a.value] = "计算失败";
      }
    }
    setResults(all);
    message.success("所有算法计算完成");
  };

  const copy = (val: string) => {
    navigator.clipboard.writeText(val);
    message.success("已复制");
  };

  return (
    <Card title="哈希计算 (MD5/SHA)" bordered={false}>
      <Input.TextArea
        rows={5}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入要计算哈希的文本"
      />
      <Space style={{ margin: "12px 0" }}>
        <Select value={algo} onChange={setAlgo} options={ALGORITHMS} style={{ width: 200 }} />
        <Button type="primary" onClick={generate}>
          计算
        </Button>
        <Button onClick={generateAll}>计算全部算法</Button>
        <Button
          onClick={() => {
            setInput("");
            setResults({});
          }}
        >
          清空
        </Button>
      </Space>
      <Row gutter={[16, 16]}>
        {ALGORITHMS.map((a) => (
          <Col span={24} key={a.value}>
            <Card size="small" type="inner" title={<Tag color="blue">{a.label}</Tag>}>
              <Row gutter={16} align="middle">
                <Col flex="auto">
                  <Input.TextArea
                    rows={2}
                    value={results[a.value] || ""}
                    readOnly
                    style={{ fontFamily: "monospace" }}
                    placeholder="等待计算..."
                  />
                </Col>
                <Col>
                  <Statistic
                    title="位数"
                    value={
                      a.value === "md5"
                        ? 128
                        : a.value.includes("256")
                          ? 256
                          : a.value.includes("384")
                            ? 384
                            : a.value.includes("512")
                              ? 512
                              : 160
                    }
                  />
                </Col>
                <Col>
                  <Button
                    size="small"
                    onClick={() => results[a.value] && copy(results[a.value])}
                    disabled={!results[a.value]}
                  >
                    复制
                  </Button>
                </Col>
              </Row>
            </Card>
          </Col>
        ))}
      </Row>
    </Card>
  );
}

// 简易 MD5 实现（Web Crypto API 不支持 MD5）
function md5(string: string): string {
  function rotateLeft(x: number, c: number): number {
    return (x << c) | (x >>> (32 - c));
  }
  function addUnsigned(x: number, y: number): number {
    const x8 = x & 0x80000000;
    const y8 = y & 0x80000000;
    const x4 = x & 0x40000000;
    const y4 = y & 0x40000000;
    const result = (x & 0x3fffffff) + (y & 0x3fffffff);
    if (x4 & y4) return result ^ 0x80000000 ^ x8 ^ y8;
    if (x4 | y4) {
      if (result & 0x40000000) return result ^ 0xc0000000 ^ x8 ^ y8;
      return result ^ 0x40000000 ^ x8 ^ y8;
    }
    return result ^ x8 ^ y8;
  }
  function F(x: number, y: number, z: number): number {
    return (x & y) | (~x & z);
  }
  function G(x: number, y: number, z: number): number {
    return (x & z) | (y & ~z);
  }
  function H(x: number, y: number, z: number): number {
    return x ^ y ^ z;
  }
  function I(x: number, y: number, z: number): number {
    return y ^ (x | ~z);
  }
  function FF(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function GG(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function HH(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function II(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function convertToWordArray(string: string): number[] {
    const text = unescape(encodeURIComponent(string));
    const m = text.length;
    const n = m + 8;
    const k = Math.floor(n / 16);
    const ba = new Array(k * 16);
    for (let i = 0; i < k * 16; i++) ba[i] = 0;
    for (let i = 0; i < m; i++) {
      ba[i >> 2] |= (text.charCodeAt(i) & 0xff) << ((i % 4) * 8);
    }
    ba[m >> 2] |= 0x80 << ((m % 4) * 8);
    ba[k * 16 - 2] = m * 8;
    return ba;
  }
  function wordToHex(value: number): string {
    let wordToHexValue = "";
    let wordToHexValueTemp = "";
    for (let count = 0; count <= 3; count++) {
      const byte = (value >>> (count * 8)) & 255;
      wordToHexValueTemp = "0" + byte.toString(16);
      wordToHexValue += wordToHexValueTemp.substr(wordToHexValueTemp.length - 2, 2);
    }
    return wordToHexValue;
  }

  const x: number[] = convertToWordArray(string);
  let a = 0x67452301,
    b = 0xefcdab89,
    c = 0x98badcfe,
    d = 0x10325476;
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
    14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];
  for (let i = 0; i < x.length; i += 16) {
    const aa = a,
      bb = b,
      cc = c,
      dd = d;
    for (let j = 0; j < 64; j++) {
      const g = j < 16 ? j : j < 32 ? (5 * j + 1) % 16 : j < 48 ? (3 * j + 5) % 16 : (7 * j) % 16;
      if (j < 16) a = FF(a, b, c, d, x[i + g], S[j], K[j]);
      else if (j < 32) a = GG(a, b, c, d, x[i + g], S[j], K[j]);
      else if (j < 48) a = HH(a, b, c, d, x[i + g], S[j], K[j]);
      else a = II(a, b, c, d, x[i + g], S[j], K[j]);
      [a, b, c, d] = [d, a, b, c];
    }
    a = addUnsigned(a, aa);
    b = addUnsigned(b, bb);
    c = addUnsigned(c, cc);
    d = addUnsigned(d, dd);
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}
