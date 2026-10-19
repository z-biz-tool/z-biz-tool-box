import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Space, Typography } from "antd";
import { ReloadOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { buildZbizApi } from "./api";
import {
  createBudget,
  dispatchBridgeMethod,
  HOST_REPLY_TARGET_ORIGIN,
  parseHello,
  parseRpc,
  permissionDenial,
  PLUGIN_SANDBOX,
  readyMessage,
  responseMessage,
  type BridgeMessage,
} from "./bridge-protocol";
import { openPluginsDir } from "./scanner";
import { describeUnknown, resolvePermissions } from "./permissions.ts";
import { HOST_API_VERSION } from "./api-version.ts";
import {
  describePrompt,
  isSensitiveMethod,
  promptKey,
  type PromptAnswer,
} from "./permission-prompt.ts";
import { usePromptStore } from "../../stores/promptStore";
import type { ExternalPlugin } from "./types";

interface PluginIframeProps {
  plugin: ExternalPlugin;
}

interface PendingPrompt {
  key: string;
  title: string;
  body: string;
  resolve: (answer: PromptAnswer) => void;
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
  // 敏感能力确认弹窗(台账 T2.6)
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const promptEvaluate = usePromptStore((s) => s.evaluate);
  const promptRecord = usePromptStore((s) => s.record);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // 该插件的权限来自它自己的 plugin.json; 没写就是只拿到隐式档。
    const perms = resolvePermissions(plugin);
    // API 表面按权限裁剪(台账 T1.9): 被拒的方法在 api-gate 层就拿不到能力。
    const api = buildZbizApi(plugin.id, perms);
    const takeToken = createBudget();
    const post = (msg: BridgeMessage) => {
      try {
        iframe.contentWindow?.postMessage(msg, HOST_REPLY_TARGET_ORIGIN);
      } catch {
        /* iframe 可能已卸载, 忽略 */
      }
    };
    const ready = () => post(readyMessage(plugin.id, HOST_API_VERSION, [...perms.granted]));

    // 敏感能力确认: 规则在 permission-prompt.ts, 这里只负责把"问"变成
    // 一个能被 await 的 Promise(弹窗在 React 树里渲染, 不在 iframe 里)。
    const askPermission = (key: string, title: string, body: string): Promise<PromptAnswer> =>
      new Promise<PromptAnswer>((resolve) => {
        setPending({ key, title, body, resolve });
      });

    const onMessage = async (ev: MessageEvent) => {
      // 不透明源下 ev.origin 恒为 "null", 只有窗口句柄能把消息绑定到这个 frame
      if (ev.source !== iframe.contentWindow) return;
      if (parseHello(ev.data)) {
        ready();
        return;
      }
      const rpc = parseRpc(ev.data, perms);
      if (!rpc) {
        // 非法包与"有权限但被拒"要分开处理: 后者必须回一句可执行的原因,
        // 否则插件作者只会看到"调用没反应", 永远查不出是权限没声明。
        const reason = permissionDenial(ev.data, perms);
        if (reason) {
          const id = typeof ev.data === "object" && ev.data !== null ? (ev.data as { id?: unknown }).id : undefined;
          if (typeof id === "string") {
            post(responseMessage(id, undefined, reason));
          }
        }
        return; // 不调用任何能力
      }
      if (!takeToken()) {
        post(responseMessage(rpc.id, undefined, "zBiz 桥接: 调用过于频繁"));
        return;
      }

      // 敏感能力首次调用确认(台账 T2.6)
      const cmd = rpc.method === "invoke" ? String(rpc.args[0] ?? "") : undefined;
      if (isSensitiveMethod(rpc.method, cmd)) {
        const key = promptKey(plugin.id, rpc.method, cmd);
        let outcome = promptEvaluate(key);
        if (outcome === "ask") {
          const answer = await askPermission(
            key,
            "插件请求使用敏感能力",
            describePrompt(rpc.method, cmd),
          );
          promptRecord(key, answer);
          outcome = answer === "deny" ? "deny" : "allow";
        }
        if (outcome === "deny") {
          post(
            responseMessage(
              rpc.id,
              undefined,
              "PermissionDenied: 用户拒绝了该敏感操作。如需继续, 请在宿主里重新允许。",
            ),
          );
          return;
        }
      }

      try {
        const result = await dispatchBridgeMethod(api, rpc.method, rpc.args);
        post(responseMessage(rpc.id, result));
      } catch (e) {
        post(responseMessage(rpc.id, undefined, e instanceof Error ? e.message : String(e)));
      }
    };
    window.addEventListener("message", onMessage);

    // 插件的 hello 若早于 load 送达, 这里再推一次 ready 兜底(插件侧 install 幂等)
    const onLoad = () => {
      if (!iframe.contentWindow) {
        setError("iframe.contentWindow 不可访问");
        return;
      }
      ready();
    };
    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("message", onMessage);
    };
  }, [plugin.id, reloadKey, promptEvaluate, promptRecord]);

  // 声明了但宿主不认识的权限名: 几乎都是拼写错误, 静默忽略会让作者以为
  // 权限已生效, 所以直接在界面上说出来。
  const permissionNotice = describeUnknown(resolvePermissions(plugin));

  const answerPrompt = (answer: PromptAnswer) => {
    pending?.resolve(answer);
    setPending(null);
  };

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
      {permissionNotice && (
        <Alert
          type="warning"
          showIcon
          closable
          message={permissionNotice}
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

      <Modal
        open={pending !== null}
        title={pending?.title ?? ""}
        onCancel={() => answerPrompt("deny")}
        maskClosable={false}
        footer={
          <Space>
            <Button danger onClick={() => answerPrompt("deny")}>
              拒绝
            </Button>
            <Button onClick={() => answerPrompt("allow")}>允许</Button>
            <Button type="primary" onClick={() => answerPrompt("always")}>
              始终允许
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph style={{ marginBottom: 4 }}>
          插件 <code>{plugin.name}</code> 请求使用敏感能力:
        </Typography.Paragraph>
        <Typography.Paragraph type="warning">{pending?.body}</Typography.Paragraph>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          「允许」「拒绝」只在本次运行内生效;「始终允许」会记住这个决定。
        </Typography.Text>
      </Modal>
    </div>
  );
}
