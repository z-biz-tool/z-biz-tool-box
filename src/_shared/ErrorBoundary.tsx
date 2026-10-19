/**
 * React ErrorBoundary — 工具渲染区的兜底(台账 T4.5)。
 *
 * ## 为什么需要
 *
 * 工具区是整个应用里最容易炸的地方: 每个工具都是一段独立代码,
 * 任何一个在渲染期抛异常, **整棵 React 树会被卸载** —— 表现是白屏,
 * 而且没有任何提示。用户只能杀掉进程重来。
 *
 * 有了 ErrorBoundary, 出错的只是那一个工具, 其余功能照常,
 * 出错的那个显示一句可读的原因 + 「重试」/「返回」两个出口。
 *
 * ## 为什么必须是 class
 *
 * ErrorBoundary 依赖 `componentDidCatch` / `getDerivedStateFromError` ——
 * 这两个是 class 组件的生命周期方法, React 19 里仍然支持
 * (函数组件的 error boundary 方案要靠 react-error-boundary 这类库)。
 * 本仓不引入新依赖, 所以用 class。
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Button, Space, Typography } from "antd";
import { ReloadOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { writeFrontendLog } from "./errorLogger";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 出错时提供的兜底 UI; 不给就用默认的 */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  /** "返回"按钮的回调(通常是回到 spotlight) */
  onBack?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 落盘: 光有 fallback 不够 —— 用户不一定会把截图给你。
    writeFrontendLog(
      "error",
      `ErrorBoundary: ${error.name}: ${error.message}\n${info.componentStack ?? ""}`,
    );
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.retry);
    }

    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          showIcon
          message="这个工具出错了"
          description={
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <Typography.Text style={{ fontSize: 12 }} type="secondary">
                其它工具不受影响, 可以继续用。错误详情已写入日志目录。
              </Typography.Text>
              <Typography.Text
                style={{ fontSize: 12, fontFamily: "var(--mono-font)" }}
                code
              >
                {error.name}: {error.message}
              </Typography.Text>
            </Space>
          }
        />
        <Space style={{ marginTop: 12 }}>
          <Button icon={<ReloadOutlined />} onClick={this.retry}>
            重试
          </Button>
          {this.props.onBack && (
            <Button icon={<ArrowLeftOutlined />} onClick={this.props.onBack}>
              返回搜索
            </Button>
          )}
        </Space>
      </div>
    );
  }
}
