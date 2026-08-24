import type { ReactNode } from "react";
import { Layout, Button, Space, Typography, theme } from "antd";
import { BulbOutlined, BulbFilled } from "@ant-design/icons";
import { useTheme } from "./ThemeContext";

const { Header, Sider, Content } = Layout;

interface AppShellProps {
  title: string;
  icon?: ReactNode;
  sidebar: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  siderWidth?: number;
  /** 圆角半径(Spotlight 浮层用) */
  borderRadius?: number;
}

export function AppShell({
  title,
  icon,
  sidebar,
  headerExtra,
  children,
  siderWidth = 220,
  borderRadius = 12,
}: AppShellProps) {
  const { mode, toggle } = useTheme();
  const { token } = theme.useToken();

  return (
    <div
      style={{
        height: "100vh",
        // 浮层窗口需要给根容器加圆角 + overflow hidden,让 webview 边框圆起来
        borderRadius,
        overflow: "hidden",
        // Spotlight 风格: 明显的阴影 + 边框
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
      }}
    >
      <Layout style={{ height: "100vh", background: "transparent" }}>
        <Header
          data-tauri-drag-region
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            height: 48,
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            // 顶部圆角跟随外层
            borderRadius: `${borderRadius}px ${borderRadius}px 0 0`,
          }}
        >
          <Space size={8} style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
            {icon}
            <Typography.Text strong style={{ fontSize: 15 }}>
              {title}
            </Typography.Text>
          </Space>
          <Space>
            {headerExtra}
            <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
              <Button
                type="text"
                icon={mode === "dark" ? <BulbFilled /> : <BulbOutlined />}
                onClick={toggle}
                title={mode === "dark" ? "切换到亮色" : "切换到暗色"}
              />
            </div>
          </Space>
        </Header>
        <Layout>
          <Sider
            width={siderWidth}
            style={{
              background: token.colorBgContainer,
              borderRight: `1px solid ${token.colorBorderSecondary}`,
              overflow: "auto",
            }}
          >
            {sidebar}
          </Sider>
          <Content style={{ overflow: "auto", background: token.colorBgLayout }}>{children}</Content>
        </Layout>
      </Layout>
    </div>
  );
}
