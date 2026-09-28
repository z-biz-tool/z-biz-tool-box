import { useEffect, useRef, useState } from "react";
import { Alert, Button, Space } from "antd";
import { ReloadOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { buildZbizApi } from "./api";
import {
  createBudget,
  dispatchBridgeMethod,
  HOST_REPLY_TARGET_ORIGIN,
  parseHello,
  parseRpc,
  PLUGIN_SANDBOX,
  readyMessage,
  responseMessage,
  type BridgeMessage,
} from "./bridge-protocol";
import { openPluginsDir } from "./scanner";
import type { ExternalPlugin } from "./types";

interface PluginIframeProps {
  plugin: ExternalPlugin;
}

/**
 * 渲染外部插件 — iframe 沙箱加载, 能力只经 zBiz 桥接协议给出。
 *
 * 沙箱: PLUGIN_SANDBOX 刻意不含 allow-same-origin。
 * 之前 `allow-scripts + allow-same-origin` 让插件文档保留 asset:// 这个特权源:
 * 既能在 scope($HOME/.z-biz-tools/**) 内任意读别人的插件/数据文件, 又和宿主共享
 * WebView 的 IPC 注入面; 而旧桥接用 `method.split(".").reduce(...)` 取值,
 * 一条 `{method:"constructor.constructor", args:["return this"]}` 就能拿到宿主
 * window(含 __TAURI_INTERNALS__) → 任意 fs/shell。
 * 现在: 文档为不透明源 + 协议白名单(见 bridge-protocol.ts), 两条路都堵死。
 *
 * 插件侧用法不变: window.zBiz.copyToClipboard(...) 由插件自身 bootstrap 建立,
 * 出错显示在 iframe 上方。
 */
export function PluginIframe({ plugin }: PluginIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const api = buildZbizApi(plugin.id);
    const takeToken = createBudget();
    const post = (msg: BridgeMessage) => {
      try {
        iframe.contentWindow?.postMessage(msg, HOST_REPLY_TARGET_ORIGIN);
      } catch {
        /* iframe 可能已卸载, 忽略 */
      }
    };

    const onMessage = (ev: MessageEvent) => {
      // 不透明源下 ev.origin 恒为 "null", 只有窗口句柄能把消息绑定到这个 frame
      if (ev.source !== iframe.contentWindow) return;
      if (parseHello(ev.data)) {
        post(readyMessage(plugin.id));
        return;
      }
      const rpc = parseRpc(ev.data);
      if (!rpc) return; // 非法包: 静默丢弃, 不调用任何能力
      if (!takeToken()) {
        post(responseMessage(rpc.id, undefined, "zBiz 桥接: 调用过于频繁"));
        return;
      }
      Promise.resolve()
        .then(() => dispatchBridgeMethod(api, rpc.method, rpc.args))
        .then((result) => post(responseMessage(rpc.id, result)))
        .catch((e) => post(responseMessage(rpc.id, undefined, e instanceof Error ? e.message : String(e))));
    };
    window.addEventListener("message", onMessage);

    // 插件的 hello 若早于 load 送达, 这里再推一次 ready 兜底(插件侧 install 幂等)
    const onLoad = () => {
      if (!iframe.contentWindow) {
        setError("iframe.contentWindow 不可访问");
        return;
      }
      post(readyMessage(plugin.id));
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
        sandbox={PLUGIN_SANDBOX}
      />
    </div>
  );
}
