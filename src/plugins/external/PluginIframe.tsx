import { useEffect, useRef, useState } from "react";
import { Alert, Button, Space } from "antd";
import { ReloadOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { buildZbizApi } from "./api";
import { openPluginsDir } from "./scanner";
import type { ExternalPlugin } from "./types";

interface PluginIframeProps {
  plugin: ExternalPlugin;
}

/**
 * 渲染外部插件 — 通过 iframe 沙箱加载,主应用注入 zBiz API。
 *
 * 注入策略:
 *   - iframe 加载 tauri:// 同源 URL(convertFileSrc)
 *   - onLoad 时设置 iframe.contentWindow.zBiz = buildZbizApi(plugin.id)
 *   - 插件内代码 window.zBiz.copyToClipboard(...) 即可调用
 *   - 任何 plugin 出错显示在 iframe 下方
 */
export function PluginIframe({ plugin }: PluginIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      try {
        const w = iframe.contentWindow;
        if (!w) {
          setError("iframe.contentWindow 不可访问");
          return;
        }
        (w as unknown as { zBiz: unknown }).zBiz = buildZbizApi(plugin.id);
        console.log(`[PluginIframe] injected zBiz for ${plugin.id}`);
      } catch (e) {
        setError(`注入 zBiz 失败: ${String(e)}`);
      }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [plugin.id, reloadKey]);

  if (plugin.error) {
    return (
      <Alert
        type="error"
        showIcon
        message="插件加载失败"
        description={
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <code style={{ color: "#ff7875" }}>{plugin.error}</code>
            <Space>
              <Button size="small" icon={<FolderOpenOutlined />} onClick={openPluginsDir}>
                打开插件目录
              </Button>
            </Space>
          </Space>
        }
        style={{ margin: 24 }}
      />
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      {error && (
        <Alert
          type="warning"
          showIcon
          closable
          message={error}
          onClose={() => setError(null)}
          style={{ margin: "8px 16px 0" }}
        />
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 16px",
          borderBottom: "1px solid var(--ant-color-border-secondary)",
          background: "var(--ant-color-bg-container)",
          fontSize: 12,
          color: "var(--ant-color-text-tertiary)",
        }}
      >
        <span>📦 外部插件 · {plugin.id} v{plugin.version}</span>
        <Button
          size="small"
          type="text"
          icon={<ReloadOutlined />}
          onClick={() => setReloadKey((k) => k + 1)}
        >
          重新加载
        </Button>
        <Button size="small" type="text" icon={<FolderOpenOutlined />} onClick={openPluginsDir}>
          打开目录
        </Button>
      </div>
      <iframe
        key={reloadKey}
        ref={iframeRef}
        src={plugin.mainUrl}
        title={plugin.name}
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          background: "var(--ant-color-bg-layout)",
        }}
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
      />
    </div>
  );
}
