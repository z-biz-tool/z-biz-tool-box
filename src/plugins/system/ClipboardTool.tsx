import { useState, useEffect, useCallback } from "react";
import { List, Typography, Button, Space, Card, Input, Tag, message, Empty, Statistic, Row, Col } from "antd";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

interface ClipItem {
  id: number;
  text: string;
  time: number;
  pinned: boolean;
}

export default function ClipboardTool() {
  const [history, setHistory] = useState<ClipItem[]>([]);
  const [current, setCurrent] = useState("");
  const [filter, setFilter] = useState("");
  const [lastClip, setLastClip] = useState("");
  const [autoWatch, setAutoWatch] = useState(false);

  // 读取当前剪贴板
  const readClipboard = useCallback(async () => {
    try {
      const text = await readText();
      if (text && text !== lastClip) {
        setLastClip(text);
        setCurrent(text);
        if (autoWatch) {
          setHistory((prev) => {
            if (prev.some((item) => item.text === text)) return prev;
            return [{ id: Date.now(), text, time: Date.now(), pinned: false }, ...prev].slice(0, 100);
          });
        }
      }
    } catch {
      // 非Tauri环境使用浏览器API
      try {
        const text = await navigator.clipboard.readText();
        if (text && text !== lastClip) {
          setLastClip(text);
          setCurrent(text);
        }
      } catch {
        // 忽略
      }
    }
  }, [lastClip, autoWatch]);

  const writeClipboard = async (text: string) => {
    try {
      await writeText(text);
    } catch {
      try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    }
    setLastClip(text);
    setCurrent(text);
    message.success("已写入剪贴板");
  };

  const capture = async () => {
    try {
      const text = await readText().catch(async () => navigator.clipboard.readText());
      if (!text) { message.warning("剪贴板为空"); return; }
      if (history.some((item) => item.text === text)) {
        message.info("该项已存在");
        return;
      }
      setHistory([{ id: Date.now(), text, time: Date.now(), pinned: false }, ...history].slice(0, 100));
      message.success("已捕获到历史");
    } catch {
      message.error("无法读取剪贴板");
    }
  };

  useEffect(() => {
    if (autoWatch) {
      const timer = setInterval(readClipboard, 1000);
      return () => clearInterval(timer);
    }
  }, [autoWatch, readClipboard]);

  const deleteItem = (id: number) => {
    setHistory(history.filter((item) => item.id !== id));
  };

  const togglePin = (id: number) => {
    setHistory(history.map((item) => item.id === id ? { ...item, pinned: !item.pinned } : item));
  };

  const clearAll = () => {
    setHistory(history.filter((item) => item.pinned));
    message.success("已清空（保留置顶项）");
  };

  const filtered = filter
    ? history.filter((item) => item.text.toLowerCase().includes(filter.toLowerCase()))
    : history;

  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.time - a.time;
  });

  return (
    <Card title="剪贴板工具" bordered={false}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="当前剪贴板" value={current ? `${current.slice(0, 30)}${current.length > 30 ? "..." : ""}` : "空"} valueStyle={{ fontSize: 14 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="历史记录数" value={history.length} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="置顶数" value={history.filter((h) => h.pinned).length} />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" onClick={capture}>捕获当前剪贴板</Button>
        <Button onClick={() => setAutoWatch(!autoWatch)}>
          {autoWatch ? "停止监听" : "自动监听"}
        </Button>
        <Button onClick={readClipboard}>刷新当前</Button>
        <Button onClick={clearAll} danger>清空历史</Button>
        <Tag color={autoWatch ? "green" : "default"}>{autoWatch ? "监听中..." : "未监听"}</Tag>
      </Space>

      <Input.Search
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="搜索历史记录..."
        style={{ marginBottom: 12 }}
        allowClear
      />

      {sorted.length === 0 ? (
        <Empty description="暂无历史记录" />
      ) : (
        <List
          dataSource={sorted}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button size="small" type="link" onClick={() => writeClipboard(item.text)}>复制</Button>,
                <Button size="small" type="link" onClick={() => togglePin(item.id)}>
                  {item.pinned ? "取消置顶" : "置顶"}
                </Button>,
                <Button size="small" type="link" danger onClick={() => deleteItem(item.id)}>删除</Button>,
              ]}
            >
              <List.Item.Meta
                avatar={item.pinned ? <Tag color="orange">置顶</Tag> : undefined}
                title={
                  <Typography.Text
                    style={{ maxWidth: 600, display: "inline-block" }}
                    ellipsis
                  >
                    {item.text}
                  </Typography.Text>
                }
                description={
                  <Space size="small">
                    <Tag>{new Date(item.time).toLocaleTimeString()}</Tag>
                    <Tag color="blue">{item.text.length} 字符</Tag>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
