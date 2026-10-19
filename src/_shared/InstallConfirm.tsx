/**
 * 安装前确认弹窗 — 台账 T1.7。
 *
 * 用户点「安装」之后、**真正下载主文件之前**, 给他看:
 * 插件名 / 来源 URL / 版本 / 完整性校验情况 / 权限清单。
 *
 * 为什么用 hook 而不是 antd 的静态 Modal.confirm:
 *  - 静态方法不继承 App 里的主题上下文(本仓 antd 没有 ConfigProvider, 影响不大,
 *    但更重要的是静态 confirm 无法拿到 React 树里的状态);
 *  - 我们需要"等用户回答"这个 Promise, 而受控 Modal 天然能给。
 *
 * 关键设计: 确认弹窗**只展示**计划, 不做任何下载动作。
 * 下载由调用方在拿到 true 之后才发起 —— 顺序错了, "确认后才开始下载"就名存实亡。
 */
import { useCallback, useRef, useState } from "react";
import { Alert, Descriptions, Modal, Space, Typography } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import type { InstallPlan } from "../plugins/external/install-plan.ts";

export interface InstallConfirmModalProps {
  plan: InstallPlan | null;
  onResolve: (confirmed: boolean) => void;
}

export function InstallConfirmModal({ plan, onResolve }: InstallConfirmModalProps) {
  return (
    <Modal
      open={plan !== null}
      title="确认安装插件"
      okText="确认安装"
      cancelText="取消"
      onOk={() => onResolve(true)}
      onCancel={() => onResolve(false)}
      maskClosable={false}
      width={560}
    >
      {plan && (
        <>
          <Descriptions
            size="small"
            column={1}
            bordered
            items={plan.lines.map((l) => ({
              key: l.label,
              label: l.label,
              children: (
                <Typography.Text
                  style={{ whiteSpace: "pre-wrap", fontSize: 12 }}
                  copyable={l.label === "来源 URL"}
                >
                  {l.value}
                </Typography.Text>
              ),
            }))}
          />
          {plan.warnings.length > 0 && (
            <Space direction="vertical" size={4} style={{ width: "100%", marginTop: 12 }}>
              {plan.warnings.map((w, i) => (
                <Alert
                  key={i}
                  type="warning"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  message={w}
                />
              ))}
            </Space>
          )}
          {plan.blocking.length > 0 && (
            <Space direction="vertical" size={4} style={{ width: "100%", marginTop: 12 }}>
              {plan.blocking.map((b, i) => (
                <Alert key={i} type="error" showIcon message={b} />
              ))}
            </Space>
          )}
        </>
      )}
    </Modal>
  );
}

/**
 * 返回一个「请求确认」的方法与要渲染的弹窗元素。
 *
 * 用法:
 *   const { request: confirmInstall, modal } = useInstallConfirm();
 *   if (!(await confirmInstall(plan))) return;   // 用户取消
 *   ...开始下载...
 *   return modal;                                // 渲染到组件树里
 */
export function useInstallConfirm() {
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const request = useCallback((p: InstallPlan) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPlan(p);
    });
  }, []);

  const onResolve = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setPlan(null);
  }, []);

  const modal = <InstallConfirmModal plan={plan} onResolve={onResolve} />;
  return { request, modal };
}
