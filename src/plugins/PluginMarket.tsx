import { useState, useEffect } from "react";
import { Card, Row, Col, Tag, Typography } from "antd";
import { invoke } from "@tauri-apps/api/core";

interface PluginInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
}

export default function PluginMarket() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);

  useEffect(() => {
    invoke<PluginInfo[]>("list_plugins").then(setPlugins);
  }, []);

  return (
    <div>
      <h3>插件市场</h3>
      <Row gutter={[16, 16]}>
        {plugins.map(p => (
          <Col span={8} key={p.id}>
            <Card size="small" hoverable>
              <Typography.Text strong>{p.name}</Typography.Text>
              <br />
              <Typography.Text type="secondary">{p.description}</Typography.Text>
              <br />
              <Tag color={p.enabled ? "green" : "default"}>
                {p.enabled ? "已启用" : "未启用"}
              </Tag>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
