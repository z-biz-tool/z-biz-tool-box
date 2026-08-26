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
 * 注入策略(iframe 经 asset://localhost 加载本地 main.html, 与宿主跨源):
 *   - 同源(浏览器直开调试)时 onLoad 直接设置 contentWindow.zBiz
 *   - 跨源(客户端内, 常态)时走 postMessage 桥接:
 *       插件 bootstrap 发 {__zbiz_hello} → 宿主回 {__zbiz_ready, pluginId}
 *       插件按 {__zbiz, id, method, args} 发起 RPC → 宿主回 {__zbiz_rsp, id, result|error}
 *   - 插件内代码 window.zBiz.copyToClipboard(...) 即可调用(两种方式对插件透明)
 *   - 任何 plugin 出错显示在 iframe 下方
 */
export function PluginIframe({ plugin }: PluginIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const api = buildZbizApi(plugin.id);
    const post = (msg: unknown) => {
      try {
        iframe.contentWindow?.postMessage(msg, "*");
      } catch {
        /* iframe 可能已卸载, 忽略 */
      }
    };

    // postMessage 桥接: iframe 经 asset://localhost 加载, 与宿主跨源,
    // contentWindow.zBiz 直注会抛 SecurityError, 由插件内 bootstrap 发起 RPC
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow) return;
      const d = ev.data as Record<string, unknown> | null | undefined;
      if (!d || typeof d !== "object") return;
      if (d.__zbiz_hello) {
        post({ __zbiz_ready: 1, pluginId: plugin.id });
        return;
      }
      const id = d.id as string | undefined;
      const method = d.method as string | undefined;
      const args = d.args as unknown[] | undefined;
      if (!d.__zbiz || !id || !method) return;
      const respond = (result: unknown, error?: unknown) =>
        post({ __zbiz_rsp: 1, id, result, error: error === undefined ? undefined : String(error) });
      Promise.resolve()
        .then(() => {
          const fn = method.split(".").reduce<unknown>(
            (o, k) => (o as Record<string, unknown> | undefined)?.[k],
            api
          );
          if (typeof fn !== "function") throw new Error(`zBiz 桥接: 未知方法 "${method}"`);
          return (fn as (...a: unknown[]) => unknown)(...(args ?? []));
        })
        .then((r) => respond(r))
        .catch((e) => respond(undefined, e));
    };
    window.addEventListener("message", onMessage);

    const onLoad = () => {
      // 同源(浏览器直开调试)时直注; 跨源抛 SecurityError 由桥接兜底, 不视为错误
      try {
        const w = iframe.contentWindow;
        if (!w) {
          setError("iframe.contentWindow 不可访问");
          return;
        }
        (w as unknown as { zBiz: unknown }).zBiz = api;
        console.log(`[PluginIframe] injected zBiz for ${plugin.id}`);
      } catch {
        /* 跨源: 走 postMessage 桥接 */
      }
      // bootstrap 的 hello 若早于 load 送达已被应答, 这里再推一次 ready 兜底(插件侧幂等)
      post({ __zbiz_ready: 1, pluginId: plugin.id });
    };
    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("message", onMessage);
    };
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
