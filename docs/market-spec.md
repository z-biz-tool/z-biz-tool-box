# ZBIZ Market Spec v1.0

> 一个**市场源**(market source)是一个 HTTP(S) endpoint，提供一组可被 [z-biz-tool-box](https://github.com/z-biz/z-biz-tool-box) 安装的外部插件。本规范定义了客户端与市场源之间必须遵守的契约。

---

## 1. 端点约定

用户在 z-biz-tool-box 里**只配置一个 base URL** `B`(完整的 `https://...` 形式, 末尾可有路径前缀)。客户端按下面的规则拼接子路径:

| 用途                | 方法 | 路径                                | 必填 | 返回                           |
| ------------------- | ---- | ----------------------------------- | ---- | ------------------------------ |
| 市场索引            | GET  | `{B}/list`                          | ✅   | `MarketList` JSON              |
| 插件 manifest       | GET  | `{B}/plugins/{id}/plugin.json`      | ✅   | `plugin.json` (见 §3)          |
| 入口 HTML           | GET  | `{B}/plugins/{id}/main.html`        | ✅   | `text/html`                    |
| 插件 logo           | GET  | `{B}/plugins/{id}/logo.png`         | ❌   | `image/png` (404 = 静默忽略)   |

**`B` 的形式**:
- 完整 URL: `https://api.example.com/market` → 客户端 GET `https://api.example.com/market/list`
- 带路径前缀: `https://example.com/api/markets/community` → 客户端 GET `https://example.com/api/markets/community/list`
- **`{id}` 必须匹配 `[a-zA-Z0-9._-]+`, 且是 URL 安全字符**(客户端会做这层校验, 不合规的 plugin 不会出现在列表里)

---

## 2. `MarketList` Schema

请求 `GET {B}/list` 返回:

```json
{
  "schemaVersion": 1,
  "name": "zifang 社区市场",
  "description": "个人 + 团队贡献的 z-biz 插件集合",
  "homepage": "https://github.com/z-biz/market",
  "updatedAt": "2026-08-25T12:00:00Z",
  "plugins": [
    {
      "id": "com.zifang.color-picker",
      "name": "屏幕取色",
      "version": "1.2.0",
      "description": "屏幕任意位置取色, RGB/HEX/HSL 互转",
      "author": "zifang",
      "homepage": "https://github.com/z-biz/color-picker",
      "tags": ["color", "ui", "design"],
      "size": 12453,
      "updatedAt": "2026-08-20T00:00:00Z",
      "icon": "https://cdn.example.com/icons/color-picker.png"
    },
    {
      "id": "com.zifang.regex-tester",
      "name": "正则测试",
      "version": "0.3.1",
      "description": "实时高亮匹配, 支持命名捕获组",
      "author": "alice",
      "tags": ["regex", "text"]
    }
  ]
}
```

### 2.1 顶层字段

| 字段            | 类型   | 必填 | 说明                                                |
| --------------- | ------ | ---- | --------------------------------------------------- |
| `schemaVersion` | int    | ✅   | 必须 `1`。客户端拒绝其他值并明确报错                |
| `name`          | string | ✅   | 市场显示名, 显示在 z-biz-tool-box 卡片标题          |
| `description`   | string | ❌   | 一句话描述                                          |
| `homepage`      | string | ❌   | 市场主页 URL, 客户端可点开                          |
| `updatedAt`     | string | ❌   | ISO 8601 时间, 客户端用排序/显示"上次更新"          |
| `plugins`       | array  | ✅   | 插件列表, 可为空数组                                |

### 2.2 `plugins[]` 元素字段

| 字段          | 类型       | 必填 | 说明                                                  |
| ------------- | ---------- | ---- | ----------------------------------------------------- |
| `id`          | string     | ✅   | 全市场唯一, 匹配 `[a-zA-Z0-9._-]+`, 反向域名风格     |
| `name`        | string     | ✅   | 显示名                                                |
| `version`     | string     | ✅   | 自由格式, 通常 semver                                |
| `description` | string     | ❌   | 一句话描述                                            |
| `author`      | string     | ❌   | 作者                                                  |
| `homepage`    | string     | ❌   | 插件主页                                              |
| `tags`        | string[]   | ❌   | 标签, 用于搜索/筛选                                   |
| `size`        | int        | ❌   | 完整包字节数, 客户端可显示                            |
| `updatedAt`   | string     | ❌   | ISO 8601                                              |
| `icon`        | string     | ❌   | 远程 icon URL(http/https), 客户端用 `<img src>` 直加载; 加载失败 fallback 到首字母 + 渐变 |

> **重要**: `MarketList` 里**不包含**任何下载 URL。客户端按 §1 的规则从 `B` 自动拼接。
> 这避免了"市场数据里写死 URL, 源迁移时全部失效"的问题。

---

## 3. `plugin.json` Schema

请求 `GET {B}/plugins/{id}/plugin.json` 返回 (字段定义见源码 `src/plugins/external/types.ts:ExternalPluginManifest`):

```json
{
  "id": "com.zifang.color-picker",
  "name": "屏幕取色",
  "description": "屏幕任意位置取色",
  "version": "1.2.0",
  "author": "zifang",
  "main": "main.html",
  "logo": "logo.png",
  "features": [
    {
      "code": "pick",
      "explain": "拾色",
      "cmds": ["取色", "color picker", "pick color"]
    },
    {
      "code": "convert",
      "explain": "RGB/HEX 互转",
      "cmds": ["rgb hex"]
    }
  ]
}
```

### 3.1 字段

| 字段          | 类型   | 必填 | 说明                                                              |
| ------------- | ------ | ---- | ----------------------------------------------------------------- |
| `id`          | string | ✅   | **必须**与 `MarketList.plugins[].id` 一致, 客户端会校验           |
| `name`        | string | ✅   | 必填                                                              |
| `description` | string | ✅   | 必填                                                              |
| `version`     | string | ✅   | 必填                                                              |
| `author`      | string | ❌   |                                                                   |
| `main`        | string | ❌   | 入口文件名, 默认 `main.html`。**相对插件目录**                    |
| `logo`        | string | ❌   | 图标文件名, 默认 `logo.png`。**相对插件目录**                     |
| `features`    | array  | ✅   | 至少 1 个, 每个 feature 独立可被搜索/唤起                         |

### 3.2 `features[]` 元素

| 字段      | 类型     | 必填 | 说明                                                  |
| --------- | -------- | ---- | ----------------------------------------------------- |
| `code`    | string   | ✅   | feature 唯一 code, 主搜索框输入此 code 直接触发       |
| `explain` | string   | ✅   | 一句话说明, 显示在搜索列表                            |
| `cmds`    | string[] | ❌   | 触发关键字, 任一命中都触发                            |
| `icon`    | string   | ❌   | feature 内部 icon, 缺省用 plugin 的 logo              |

### 3.3 安装时文件落盘

客户端把下载的 3 个文件写到本地:
- `plugin.json` → `~/.z-biz-tools/plugins/{id}/plugin.json`
- `main.html` (内容来自 `{B}/plugins/{id}/{main}`) → 同目录下的 `{main}` 文件
- `logo.png` (内容来自 `{B}/plugins/{id}/{logo}`, 可选) → 同目录下的 `{logo}` 文件

之后 scanner 跟本地插件一视同仁, 经 asset:// 协议 iframe 加载 + 桥接注入 `window.zBiz` API (见 4.4)。

---

## 4. 安全 & 传输

### 4.1 协议

| 场景       | 允许                                       | 拒绝                |
| ---------- | ------------------------------------------ | ------------------- |
| 任意       | `https://`, `http://`                      | —                   |
| 其他       | —                                          | `file://`, `data:`, `blob:`, `ftp://`, `javascript:` 等 |

> 说明: 客户端走 Rust 原生 HTTP (非浏览器 webview), 内网/本地联调允许明文 `http://`。

客户端会在用户输入 base URL 时校验协议, 不合规直接拒。

### 4.2 CORS

**z-biz-tool-box 用 Tauri 的原生 HTTP 插件 (`@tauri-apps/plugin-http`) 发起请求, 走 Rust 端的 reqwest, 不受浏览器 CORS 限制。**

因此市场源服务器**不需要**配置 CORS headers (但配置了也无害)。

### 4.3 TLS

建议:
- 启用 HTTPS (Let's Encrypt 等)
- 支持 HTTP/2 (性能)
- 推荐 `Content-Type: application/json; charset=utf-8`

### 4.4 沙箱执行

市场源提供的 `main.html` **不直接在 webview 主域执行**, 而是被加载到 `<iframe sandbox="allow-scripts allow-forms allow-same-origin allow-popups">`。

iframe 经 Tauri asset 协议 (`asset://localhost/<路径>`) 加载本地落盘文件, **与宿主跨源**, 宿主无法直接改写 `iframe.contentWindow`。受限 API (剪贴板、HTTP 转发、KV 存储、窗口控制、日志) 通过 **postMessage 桥接**注入 (宿主实现见 `src/plugins/external/PluginIframe.tsx` / `api.ts`):

| 方向       | 消息                                      | 说明                                          |
| ---------- | ----------------------------------------- | --------------------------------------------- |
| 插件 → 宿主 | `{__zbiz_hello: 1}`                       | bootstrap 启动即发                            |
| 宿主 → 插件 | `{__zbiz_ready: 1, pluginId}`             | 插件收到后安装 `window.zBiz`                  |
| 插件 → 宿主 | `{__zbiz: 1, id, method, args}`           | method 如 `invoke` / `copyToClipboard` / `storage.get` |
| 宿主 → 插件 | `{__zbiz_rsp: 1, id, result, error}`      | 与请求 id 配对, error 为字符串                |

**插件 main.html 需内置上述 bootstrap** (安装 `window.zBiz`, 方法签名同 `api.ts` 的 `ZBizApi`, 单次调用超时 10s)。浏览器直开时无宿主应答, `window.zBiz` 保持 undefined, 插件应自行兜底 (原生 fetch / clipboard / localStorage)。

> 宿主侧前置条件: `src-tauri/Cargo.toml` 开 `protocol-asset` feature, 且 `tauri.conf.json` 的 `app.security.assetProtocol` 配置 `enable: true` + `scope: ["$HOME/.z-biz-tools/**"]`。

---

## 5. 错误处理

| 客户端场景             | 服务端应返回         | 客户端展示                                |
| ---------------------- | -------------------- | ----------------------------------------- |
| `/list` 4xx/5xx        | 任意                 | 市场源卡片显示 ⚠ + 错误信息 + 保留旧缓存  |
| `/list` 返回非 JSON    | 任意                 | 显示 "响应不是合法 JSON"                  |
| `/list` schemaVersion != 1 | —                | 显示 "schemaVersion 必须是 1 (收到 N)"    |
| 单个 plugin 文件 4xx   | 任意                 | 安装按钮报错, 提示重试                    |
| `logo.png` 404         | 404                  | 静默忽略, 插件卡片用占位图                |
| `main.html` 缺失       | 404                  | 安装失败, "缺少 main 文件"                |

---

## 6. 完整示例

### 6.1 极简实现 (Node.js + Express, ~30 行)

```js
// npm i express
const express = require("express");
const path = require("path");
const app = express();

// 插件元数据(实际可来自数据库 / 文件系统)
const PLUGINS = {
  "com.example.hello": {
    manifest: {
      id: "com.example.hello",
      name: "Hello World",
      description: "打印 hello",
      version: "1.0.0",
      features: [{ code: "say-hi", explain: "打招呼", cmds: ["hi", "hello"] }],
    },
    html: `<!doctype html><meta charset=utf-8>
           <title>Hello</title>
           <body><h1 id=out>...</h1>
           <script>
             document.getElementById('out').textContent =
               'Hi from ' + (window.zBiz?.pluginId ?? 'unknown');
             window.zBiz?.notify('plugin loaded');
           </script>`,
  },
};

const BASE = "/market/v1";

// 1. 市场列表
app.get(`${BASE}/list`, (req, res) =>
  res.json({
    schemaVersion: 1,
    name: "My Tiny Market",
    updatedAt: new Date().toISOString(),
    plugins: Object.values(PLUGINS).map((p) => p.manifest),
  })
);

// 2. 三个文件
app.get(`${BASE}/plugins/:id/plugin.json`, (req, res) => {
  const p = PLUGINS[req.params.id];
  if (!p) return res.status(404).end();
  res.json(p.manifest);
});
app.get(`${BASE}/plugins/:id/main.html`, (req, res) => {
  const p = PLUGINS[req.params.id];
  if (!p) return res.status(404).end();
  res.type("html").send(p.html);
});
app.get(`${BASE}/plugins/:id/logo.png`, (req, res) => res.status(404).end());

app.listen(3000, () =>
  console.log(`market at http://localhost:3000${BASE}`)
);
```

**客户端配置**: 在 z-biz-tool-box 的"插件市场"→"管理市场源"里输入 `http://localhost:3000/market/v1`, 点"添加并连接"。

### 6.2 用对象存储当源 (零代码)

把以下文件放 S3 / R2 / 任意静态 host 的 `market/v1/` 前缀下:
```
market/v1/list
market/v1/plugins/com.example.hello/plugin.json
market/v1/plugins/com.example.hello/main.html
market/v1/plugins/com.example.hello/logo.png   (可选)
```
`list` 是个 JSON 文件, 内容参考 §2。

**客户端配置**: `https://your-bucket.s3.amazonaws.com/market/v1` (或 CDN URL)。

### 6.3 GitHub Pages 公开市场

```
https://username.github.io/z-biz-market/v1/list
https://username.github.io/z-biz-market/v1/plugins/<id>/plugin.json
...
```

---

## 7. 版本演进

- 当前 `schemaVersion: 1`
- 未来增加字段时: 客户端忽略未知字段, 旧客户端继续工作
- 未来破坏性变更: 升级到 `schemaVersion: 2`, 旧客户端明确报错 (不静默兼容, 避免歧义)

---

## 8. 一致性测试

`MarketList` 校验清单 (客户端实现侧):

- [ ] 顶层是 object
- [ ] `schemaVersion === 1` (数字)
- [ ] `name` 非空字符串
- [ ] `plugins` 是数组
- [ ] 每个 plugin:
  - [ ] `id` 匹配 `/^[a-zA-Z0-9._-]+$/`
  - [ ] `name` 非空字符串
  - [ ] `version` 非空字符串
  - [ ] `id` 在数组内唯一

`plugin.json` 校验清单:

- [ ] `id` 非空字符串
- [ ] `id` 与 `MarketList` 中的 `id` 一致
- [ ] `features` 是非空数组
- [ ] 每个 feature: `code` + `explain` 非空

---

## 9. 许可

本文档与 z-biz-tool-box 同许可 (MIT)。
