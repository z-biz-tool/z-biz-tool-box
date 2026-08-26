# 远程市场源格式

> **目标**: 让你造的插件能通过 URL 被其他用户发现 + 一键安装到他们的 z-biz-tool-box。

---

## 架构

```
你的市场源 (B = base URL, 如 https://example.com/market/v1)
│
├── GET  {B}/list                    → MarketList JSON   (市场索引)
│
├── 插件 1 文件目录 (按插件 id 命名):
│   ├── {B}/plugins/com.example.foo/plugin.json   (manifest)
│   ├── {B}/plugins/com.example.foo/main.html     (入口 HTML)
│   └── {B}/plugins/com.example.foo/logo.png      (图标, 可选)
│
└── 插件 2 文件目录...
```

用户在你提供的 base URL 上加到 z-biz-tool-box 的"市场源"列表, app 会:
1. `GET {B}/list` → 拉取你的索引
2. 用户点"安装" → 下载你的 `plugin.json` + `main.html` + `logo.png` → 写到本地 `~/.z-biz-tools/plugins/<id>/` → 在 iframe 里加载 `main.html` (主应用注入 `window.zBiz` API)

---

## 完整规范

见 [`docs/market-spec.md`](../../docs/market-spec.md) (项目根目录)。

**TL;DR**:

| 端点 | 方法 | 必填 | 返回 |
| ---- | ---- | ---- | ---- |
| `{B}/list` | GET | ✅ | `MarketList` JSON |
| `{B}/plugins/{id}/plugin.json` | GET | ✅ | `plugin.json` (manifest) |
| `{B}/plugins/{id}/main.html` | GET | ✅ | `text/html` |
| `{B}/plugins/{id}/logo.png` | GET | ❌ | `image/png` (404 静默) |

**URL 规则**:
- `{B}` 必须 `https://` (生产) 或 `http://localhost` / `http://127.0.0.1` (本地开发)
- `{id}` 必须 `[a-zA-Z0-9._-]+`

---

## MarketList 模板

```json
{
  "schemaVersion": 1,
  "name": "我的市场",
  "description": "我整理的 z-biz 插件合集",
  "homepage": "https://github.com/me/market",
  "updatedAt": "2026-08-26T12:00:00Z",
  "plugins": [
    {
      "id": "com.example.my-tool",
      "name": "我的工具",
      "version": "1.0.0",
      "description": "做 X 干 Y",
      "author": "your-name",
      "homepage": "https://...",
      "tags": ["tools"],
      "icon": "https://cdn.example.com/icons/my-tool.png"
    }
  ]
}
```

**字段校验** (客户端严格检查, 失败会报错告诉你哪个字段问题):
- `schemaVersion` 必须 `1`
- `name` 非空
- 每个 plugin 必须有 `id / name / version / pluginJson / mainHtml`
- `pluginJson / mainHtml / logo / icon` 必须是 `http://` 或 `https://` URL

---

## 最简实现: GitHub Pages

```
yourname.github.io/z-biz-market/
├── v1/
│   ├── list                                  ← MarketList JSON 文件
│   ├── plugins/
│   │   └── com.example.my-tool/
│   │       ├── plugin.json
│   │       ├── main.html
│   │       └── logo.png
```

`list` 文件内容:
```json
{
  "schemaVersion": 1,
  "name": "My Plugins",
  "plugins": [
    {
      "id": "com.example.my-tool",
      "name": "我的工具",
      "version": "1.0.0",
      "description": "...",
      "pluginJson": "https://yourname.github.io/z-biz-market/v1/plugins/com.example.my-tool/plugin.json",
      "mainHtml": "https://yourname.github.io/z-biz-market/v1/plugins/com.example.my-tool/main.html",
      "icon": "https://yourname.github.io/z-biz-market/v1/plugins/com.example.my-tool/logo.png"
    }
  ]
}
```

**用户配置**: `https://yourname.github.io/z-biz-market/v1`

---

## 30 行 Node.js 实现 (Express)

```js
const express = require("express");
const app = express();
const BASE = "/market/v1";

const plugins = {
  "com.example.hello": {
    manifest: {
      id: "com.example.hello",
      name: "Hello",
      version: "1.0.0",
      features: [{ code: "say-hi", explain: "打招呼" }],
    },
    html: "<html><body><h1>Hi from " +
          (window?.zBiz?.pluginId ?? "browser") +
          "</h1></body></html>",
  },
};

app.get(`${BASE}/list`, (req, res) =>
  res.json({
    schemaVersion: 1,
    name: "Tiny Market",
    plugins: Object.values(plugins).map(p => p.manifest),
  })
);

app.get(`${BASE}/plugins/:id/plugin.json`, (req, res) => {
  const p = plugins[req.params.id];
  if (!p) return res.status(404).end();
  res.json(p.manifest);
});

app.get(`${BASE}/plugins/:id/main.html`, (req, res) => {
  const p = plugins[req.params.id];
  if (!p) return res.status(404).end();
  res.type("html").send(p.html);
});

app.get(`${BASE}/plugins/:id/logo.png`, (req, res) => res.status(404).end());

app.listen(3000, () => console.log(`http://localhost:3000${BASE}`));
```

**用户配置**: `http://localhost:3000/market/v1`

---

## plugin.json 模板

```json
{
  "id": "com.example.my-tool",
  "name": "我的工具",
  "description": "做 X 干 Y",
  "version": "1.0.0",
  "author": "your-name",
  "main": "main.html",
  "logo": "logo.png",
  "features": [
    {
      "code": "feature-1",
      "explain": "功能 1 的一句话说明",
      "cmds": ["触发词1", "触发词2"]
    }
  ]
}
```

**字段说明**:
- `main` / `logo` 相对于插件目录的文件名 (默认 `main.html` / `logo.png`)
- `features` 至少 1 个, 每个 feature 是独立可触发的入口
- `code` 全插件唯一, ⌘K 输入 code 直接触发
- `explain` 显示在搜索列表
- `cmds` 可选, 空格分隔的触发词

---

## main.html 模板

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>我的工具</title>
  <style>
    body { font-family: system-ui; padding: 16px; }
    button { padding: 6px 12px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>我的工具</h1>
  <p>插件 id: <code id="pid">?</code></p>
  <button id="btn">点我</button>
  <pre id="out"></pre>

  <script>
    // 主应用注入的 zBiz API (见 src/plugins/external/api.ts)
    document.getElementById('pid').textContent = window.zBiz?.pluginId ?? '?';

    document.getElementById('btn').onclick = async () => {
      try {
        await window.zBiz.copyToClipboard('Hello from ' + window.zBiz.pluginId);
        window.zBiz.notify('已复制!');
        document.getElementById('out').textContent = 'OK at ' + new Date().toISOString();
      } catch (e) {
        document.getElementById('out').textContent = 'Error: ' + e;
      }
    };
  </script>
</body>
</html>
```

**注意**:
- 这是**在 iframe 沙箱里跑** (`sandbox="allow-scripts allow-forms allow-same-origin allow-popups"`)
- 不能直接访问主应用的 `window` / `localStorage` / `fetch` (CORS 限制)
- 用 `window.zBiz` API (主应用注入) 做受限操作
- API 列表见 `src/plugins/external/api.ts`

---

## 测试

把 `list` URL 加到 z-biz-tool-box:
- 打开 app → 菜单栏图标 → 市场源管理 → 添加 `{B}/list` 前的 base URL
- 自动 fetch 拉取 list
- 点"安装"测试下载流程

调试技巧: 浏览器开 DevTools 看 `webview console` (主应用按 ⌥⌘I 或 dev 模式自动开), 可以看到:
- `fetchMarketSource` 失败原因
- 字段校验报错
- 安装失败 stack trace
