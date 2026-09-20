import type { ReactNode } from "react";
import { Layout, Button, Space, Typography, theme } from "antd";
import { BulbOutlined, BulbFilled } from "@ant-design/icons";
import { useTheme } from "./ThemeContext";

const { Header, Sider, Content } = Layout;

// 渐变色定义
const headerGradient = (mode: "light" | "dark") =>
  mode === "dark"
    ? "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
    : "linear-gradient(135deg, #ffffff 0%, #f8fafd 100%)";

const brandGradient = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

interface AppShellProps {
  title: string;
  icon?: ReactNode;
  sidebar: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  siderWidth?: number;
  /** 圆角半径 (Spotlight 浮层用) */
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
    <>
      <style>{`
        @keyframes slide-in-left {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .app-header {
          animation: slide-in-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .app-content {
          animation: fade-in 0.25s ease;
        }
        
        .brand-icon {
          transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .brand-icon:hover {
          transform: scale(1.1) rotate(5deg);
        }
      `}</style>
      
      <div
        style={{
          height: "100vh",
          borderRadius,
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: `1px solid ${token.colorBorderSecondary}`,
          background: mode === "dark" ? "#0f0f1e" : "#ffffff",
        }}
      >
        <Layout style={{ height: "100vh", background: "transparent" }}>
          <Header
            data-tauri-drag-region
            className="app-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 24px",
              height: 56,
              background: headerGradient(mode),
              borderBottom: `1px solid ${mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              borderRadius: `${borderRadius}px ${borderRadius}px 0 0`,
            }}
          >
            <Space size={12} style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
              <div 
                className="brand-icon"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: brandGradient,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(102,126,234,0.3)",
                }}
              >
                {icon || <span style={{ fontSize: 18, fontWeight: 600 }}>⚡</span>}
              </div>
              <Typography.Text 
                strong 
                style={{ 
                  fontSize: 16,
                  background: brandGradient,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {title}
              </Typography.Text>
            </Space>
            
            <Space size={8}>
              {headerExtra}
              <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                <Button
                  type="text"
                  icon={mode === "dark" ? <BulbFilled /> : <BulbOutlined />}
                  onClick={toggle}
                  style={{
                    borderRadius: 8,
                    padding: "8px",
                    minWidth: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: mode === "dark" 
                      ? "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)"
                      : "linear-gradient(135deg, rgba(102,126,234,0.08) 0%, rgba(118,75,162,0.08) 100%)",
                    color: mode === "dark" ? token.colorText : "#667eea",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: mode === "dark" 
                      ? "0 2px 8px rgba(255,255,255,0.05)" 
                      : "0 2px 8px rgba(102,126,234,0.15)"
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget as HTMLElement;
                    btn.style.transform = "scale(1.08)";
                    btn.style.boxShadow = mode === "dark"
                      ? "0 4px 12px rgba(255,255,255,0.1)"
                      : "0 4px 16px rgba(102,126,234,0.25)";
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget as HTMLElement;
                    btn.style.transform = "scale(1)";
                    btn.style.boxShadow = mode === "dark"
                      ? "0 2px 8px rgba(255,255,255,0.05)"
                      : "0 2px 8px rgba(102,126,234,0.15)";
                  }}
                  title={mode === "dark" ? "切换到亮色" : "切换到深色"}
                />
              </div>
            </Space>
          </Header>
          
          <Layout>
            <Sider
              width={siderWidth}
              style={{
                background: mode === "dark"
                  ? "linear-gradient(180deg, #1a1a2e 0%, #0f0f1e 100%)"
                  : "linear-gradient(180deg, #f8fafd 0%, #ffffff 100%)",
                borderRight: `1px solid ${mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                overflow: "auto",
                boxShadow: "2px 0 8px rgba(0,0,0,0.04)",
              }}
            >
              {sidebar}
            </Sider>
            
            <Content 
              className="app-content"
              style={{ 
                overflow: "auto", 
                background: mode === "dark" 
                  ? "linear-gradient(180deg, #0f0f1e 0%, #16213e 100%)" 
                  : "linear-gradient(180deg, #f8fafd 0%, #ffffff 100%)",
                padding: 24
              }}
            >
              {children}
            </Content>
          </Layout>
        </Layout>
      </div>
    </>
  );
}
