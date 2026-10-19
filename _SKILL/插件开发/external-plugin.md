# 外部插件开发 (iframe 沙箱)

> **目标**: 你做的插件**不需要 app 重启**就能装 / 卸, 通过市场源一键安装到本地 `~/.z-biz-tools/plugins/<id>/`, 主应用通过 `<iframe>` 加载你的 `main.html` 并注入 `window.zBiz` 受限 API。

适合: 第三方作者独立发布插件, 不需要 PR 到主项目; 你想试新功能但不想等下个 release。

---

## vs 内置插件

| 维度 | 内置插件 | 外部插件 |
| ---- | -------- | -------- |
| 文件位置 | `src/plugins/<group>/<Name>.tsx` | `~/.z-biz-tools/plugins/<id>/` |
| 加载方式 | 编译时打包 | 运行时 `<iframe>` |
| 安装 | 改代码 → 重新 build | 一键下载 |
| 性能 | 极快 (同 bundle) | 稍慢 (iframe + IPC) |
| 能用的 API | React 全套 + Tauri 全套 | 受限 `window.zBiz` API |
| 适合 | 核心功能 / 性能敏感 | 第三方 / 独立发布 / 快速实验 |

---

## 目录结构 (你写的)

```
~/.z-biz-tools/plugins/com.example.my-tool/
├── plugin.json     # 必需, 描述插件
├── main.html       # 必需, 入口 HTML
├── logo.png        # 可选, 图标
└── preload.js      # 可选, 沙箱加载前执行 (高级)
```

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
  "zbizApi": "1",
  "permissions": ["log", "notify", "storage"],
  "features": [
    {
      "code": "feature-1",
      "explain": "功能 1 的一句话说明",
      "cmds": ["触发词1", "触发词2"]
    },
    {
      "code": "feature-2",
      "explain": "功能 2 的一句话说明"
    }
  ]
}
```

**字段** (详细 schema 见 `src/plugins/external/types.ts`):
- `id`: 唯一, 匹配 `[a-zA-Z0-9._-]+` (建议反向域名)
- `main`: 入口 HTML 文件名, 相对插件目录
- `logo`: 图标文件名, 相对插件目录
- `features`: 至少 1 个
  - `code`: feature 唯一 code
  - `explain`: 搜索列表显示
  - `cmds`: 触发关键词 (可选)
- `zbizApi`: **可选**。你用的 zBiz 桥接协议版本(见「协议握手与版本协商」)。不写按 `"1"` 处理
- `permissions`: **可选但关键**。你申请的权限(见下一节)。不写 = 只拿到隐式档

---

## 权限模型（**必读**）

宿主**默认拒绝**。你的 `plugin.json` 没写 `permissions` 时，插件只能拿到三个**隐式**权限:

| 权限 | 含义 | 是否隐式 |
| --- | --- | --- |
| `log` | 写宿主 console | ✅ 隐式 |
| `notify` | 弹宿主 toast | ✅ 隐式 |
| `storage` | 读写**自己的**私有 KV | ✅ 隐式 |
| `clipboard.write` | 写系统剪贴板 | ❌ 需声明 |
| `clipboard.read` | **读**系统剪贴板（会读到验证码/密码） | ❌ 需声明 |
| `window.control` | 隐藏/显示/聚焦主窗口 | ❌ 需声明 |
| `http` | 经 `http_request` 发起网络请求（可访问内网） | ❌ 需声明 |
| `invoke` | 调用宿主后端命令 | ❌ 需声明 |

**规则**:

1. **默认拒绝**。没声明的能力调用时会被拒, 拿到的错误文本里带 `PermissionDenied`
   并点名要补哪一条 —— 照着补就行。
2. **`invoke` 是两层权限**。声明了 `invoke` 只代表"可以调后端命令";
   `http_request` 还要额外的 `http`。两个都声明才能发网络请求。
3. **用户会看到你的权限清单**。装插件前会弹一个确认框, 列出你申请的每一条权限。
   申请得越多, 用户越可能拒绝 —— 只申请你真用得上的。
4. **拼错的权限名不会生效**, 宿主会在界面上报出来（多半是 `clipboard.read` 写成了
   `clipboard.reads`）。`permissions` 里非字符串的项会被忽略, 不会让插件整个加载失败。

示例（要读剪贴板 + 发网络请求 + 调后端）:

```json
{
  "permissions": ["clipboard.read", "invoke", "http"]
}
```

> ⚠️ **敏感能力首次调用会被用户确认**（见下节）。即使你声明了权限,
> 用户在**第一次**调用时仍会被问一次。

---

## 协议握手与版本协商

宿主与插件之间有一套明确的握手, 插件的 `bootstrap` 必须遵守:

```
插件 → 宿主: { __zbiz_hello: 1, apiVersion: "1" }
宿主 → 插件: { __zbiz_ready: 1, pluginId, hostApiVersion: "1", granted: ["log", "notify", ...] }
```

- `apiVersion` 是**你**声明的协议版本(取自 `plugin.json` 的 `zbizApi`, 缺省 `"1"`)
- `hostApiVersion` 是**宿主**支持的协议版本
- `granted` 是宿主**实际授予你**的权限名列表 —— 可以拿它自查, 别靠猜

**版本不兼容时插件不会被加载**。若你声明的 `zbizApi` 主版本比宿主新,
宿主会在插件列表里标出「请升级宿主」, 而不是让你在运行到一半时炸掉。

`hostApiVersion` 与 `granted` 是本轮新增的字段。老宿主不返回它们时,
你的代码要能容错（当成 `undefined`）。

---

## main.html 模板 (完整可用)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>我的工具</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 16px; margin: 0; }
    h1 { font-size: 18px; margin-top: 0; }
    button { padding: 6px 14px; border-radius: 4px; border: 1px solid #d9d9d9;
             background: white; cursor: pointer; }
    button:hover { border-color: #1677ff; color: #1677ff; }
    button.primary { background: #1677ff; color: white; border-color: #1677ff; }
    textarea { width: 100%; box-sizing: border-box; min-height: 100px;
                font-family: monospace; padding: 8px; border: 1px solid #d9d9d9;
                border-radius: 4px; }
    pre { background: #f5f5f5; padding: 8px; border-radius: 4px;
          font-family: monospace; font-size: 12px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>我的工具 <small id="ver" style="font-size: 12px; color: #999;"></small></h1>
  <p>来自: <code id="pid">?</code></p>

  <textarea id="input" placeholder="输入内容..."></textarea>
  <div style="margin: 12px 0; display: flex; gap: 8px;">
    <button class="primary" id="run">执行</button>
    <button id="copy">复制结果</button>
    <button id="clear">清空</button>
  </div>
  <pre id="output"></pre>

  <script>
    // ====== 必备: 等待 zBiz 注入 (主应用异步注入) ======
    function whenReady() {
      return new Promise(resolve => {
        if (window.zBiz) return resolve(window.zBiz);
        const timer = setInterval(() => {
          if (window.zBiz) { clearInterval(timer); resolve(window.zBiz); }
        }, 30);
        setTimeout(() => { clearInterval(timer); resolve(null); }, 3000);
      });
    }

    // ====== 你的逻辑 ======
    function myTransform(text) {
      return text.toUpperCase();
    }

    whenReady().then(zb => {
      // 显示 pluginId
      document.getElementById('pid').textContent = zb?.pluginId ?? '(no zBiz)';
      // 读 manifest 拿版本 (preload.js 里挂的)
      document.getElementById('ver').textContent = 'v' + (window.__pluginVersion ?? '?');

      // 绑定按钮
      const $in = document.getElementById('input');
      const $out = document.getElementById('output');

      document.getElementById('run').onclick = () => {
        try {
          $out.textContent = myTransform($in.value);
          zb?.notify('完成');
        } catch (e) {
          $out.textContent = 'Error: ' + e;
        }
      };

      document.getElementById('copy').onclick = async () => {
        const r = await zb?.copyToClipboard($out.textContent);
        if (r?.ok) zb.notify('已复制');
      };

      document.getElementById('clear').onclick = () => {
        $in.value = '';
        $out.textContent = '';
      };
    });
  </script>
</body>
</html>
```

---

## 完整的 zBiz API (window.zBiz)

主应用注入, 详见 `src/plugins/external/api.ts`:

```ts
interface ZBizApi {
  pluginId: string;                              // 你的插件 id
  copyToClipboard(text: string) => Promise<{ ok, error? }>;
  readClipboard() => Promise<{ ok, text?, error? }>;
  notify(msg: string) => void;                    // 主应用级别 toast
  invoke(cmd: "http_request", args) => Promise;   // HTTP 白名单
  storage: {                                      // plugin-scoped KV
    get(key) => Promise<string | null>;
    set(key, value) => Promise<void>;
    remove(key) => Promise<void>;
  };
  hideMainWindow() => Promise<void>;
  showMainWindow() => Promise<void>;
  log(...args) => void;                           // 主应用 console + toast
}
```

### 调用示例

```js
// 复制
const r = await window.zBiz.copyToClipboard('Hello');
if (!r.ok) console.error('复制失败:', r.error);

// 通知
window.zBiz.notify('操作完成!');

// 存 KV (跨会话)
await window.zBiz.storage.set('lastInput', 'abc');
const v = await window.zBiz.storage.get('lastInput');

// HTTP 请求 (通过 Rust 端, 绕开 CORS)
const r = await window.zBiz.invoke('http_request', {
  url: 'https://api.github.com/repos/foo/bar',
  method: 'GET',
});
console.log(r); // { ok, status, body }

// 日志
window.zBiz.log('clicked at', Date.now());
```

### 权限不足时是什么样

被拒的方法**不会消失**, 而是返回一个带 `PermissionDenied` 前缀的错误。
这样你不用猜"是不是 API 变了":

```js
const r = await window.zBiz.readClipboard();
if (!r.ok) {
  // r.error 形如:
  // "PermissionDenied: zBiz 权限不足：该插件的 plugin.json 未声明 "clipboard.read"，已拒绝 readClipboard。"
  showTip(r.error);
}
```

`invoke` 这类没有 `{ ok, error }` 信封的方法则直接抛 `Error`, 消息里同样带
`PermissionDenied` 前缀。

---

## 敏感能力首次调用会被用户确认

以下两个能力**即使你声明了权限**, 用户在**第一次**调用时仍会被问一次:

| 能力 | 风险 |
| --- | --- |
| `readClipboard` | 会读走剪贴板里的验证码 / 密码 / 地址 |
| `invoke("http_request", …)` | 以用户名义发请求, 可访问内网服务 |

用户看到的是「允许 / 拒绝 / 始终允许」三选一:

- **允许** / **拒绝**: 只在本次运行内生效, 之后再调用不再问
- **始终允许**: 记住这个决定, 跨会话生效

所以**不要在页面加载时就去读剪贴板**——那会立刻弹窗, 体验很差。
正确做法是让用户**先点一个按钮**:

```js
// ❌ 加载即读剪贴板 —— 会立刻弹确认框
whenReady().then(zb => zb.readClipboard().then(r => fill(r.text)));

// ✅ 用户点了才读
document.getElementById('paste').onclick = async () => {
  const r = await window.zBiz.readClipboard();
  if (!r.ok) { showTip(r.error); return; }   // 用户选了"拒绝"
  fill(r.text);
};
```

被拒绝时你会收到 `PermissionDenied` 提示, 记得给用户一句可读的话, 别静默失败。

---

### 禁止的事

| ❌ | 原因 |
| -- | ---- |
| `fetch('http://other-domain')` | webview CORS 限制, 用 `invoke('http_request')` |
| `localStorage` 跨 plugin 共享 | 沙箱是**不透明源**（不含 `allow-same-origin`），`localStorage` 根本不可用；用 `window.zBiz.storage` (plugin-scoped) |
| `window.parent.xxx` | iframe 沙箱隔离 |
| `window.top` / `window.opener` | 沙箱隔离 |
| `<script src="https://evil">` 注入外部 | 沙箱化但仍建议自己打包 |
| `eval()` / `Function()` | 沙箱允许但污染全局, 慎用 |
| 加载时就读剪贴板 / 发请求 | 会立刻触发用户的敏感能力确认框, 改成用户点击后再做 |

> 沙箱属性是 `allow-scripts allow-forms allow-modals allow-popups` ——
> **刻意不含 `allow-same-origin`**。所以你的文档处于不透明源:
> 拿不到宿主的 cookie / localStorage / `asset://` 私有文件域, 也摘不掉自身 sandbox。
> 需要跨会话存东西, 用 `window.zBiz.storage`。

---

## preload.js (高级, 可选)

`preload.js` 在主应用注入 `zBiz` **之前**执行, 可以挂自己的全局变量:

```js
// preload.js
window.__pluginVersion = '1.2.3';
window.__debug = true;
console.log('plugin preload ok');
```

在 `main.html` 引用: `window.__pluginVersion`

> 注意: preload.js 也能拿 `window.zBiz` 之前的时机, 别在里面调 `zBiz.xxx` (还没注入)

---

## 调试

```bash
# 1. 手动放到本地, 重启 app, 看是否加载
mkdir -p ~/.z-biz-tools/plugins/com.example.test
cp -r ./my-plugin/* ~/.z-biz-tools/plugins/com.example.test/
# 打开 app → ⌥Space → 搜 com.example.test → 打开

# 2. 看主应用 console
# macOS: 在 Spotlight 浮层按 ⌥⌘I (或菜单 → View → Toggle Developer Tools)
# 看到 plugin.json 解析失败 / main.html 404 之类

# 3. 看 main.html 自身的 console
# 你的 main.html 里 console.log() 会打到主应用的 DevTools
# iframe.contentWindow.console 也走主应用
```

---

## 发布流程

最简 (GitHub Pages, 零运维):
1. 写好 plugin.json + main.html + (可选) logo.png
2. push 到 `yourname.github.io/z-biz-plugins/<id>/`
3. 部署一个 `index.json` (MarketList) 在你仓库根或子目录
4. 写 README 告诉用户 base URL

高级: 在 [`market-format.md`](./market-format.md) 提到的市场源里发 list.json, 用户加你的源就能看到你的插件。

---

## 端到端示例

完整可跑的 30 行 demo 插件 (没有 logo, 没有 icon, 没有 preload):

```
my-plugin/
├── plugin.json
└── main.html
```

`plugin.json`:
```json
{
  "id": "com.example.demo",
  "name": "Demo 插件",
  "description": "测试 zBiz API",
  "version": "1.0.0",
  "zbizApi": "1",
  "permissions": ["log", "notify", "storage", "clipboard.write"],
  "features": [{ "code": "demo", "explain": "演示按钮" }]
}
```

> `clipboard.write` 要声明才能用; `log` / `notify` / `storage` 是隐式档, 写了也不多余。
> **不写** `permissions` 的话, 复制按钮会拿到 `PermissionDenied`。

`main.html`:
```html
<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:16px">
  <h1>Demo 插件</h1>
  <p>pluginId: <code id="p">?</code></p>
  <button id="b">点我 → 通知 + 复制</button>
  <script>
    new Promise(r => { if (window.zBiz) return r(); const t = setInterval(() => { if (window.zBiz) { clearInterval(t); r(); } }, 30); })
      .then(() => {
        document.getElementById('p').textContent = window.zBiz.pluginId;
        document.getElementById('b').onclick = async () => {
          await window.zBiz.copyToClipboard('Hi from ' + window.zBiz.pluginId);
          window.zBiz.notify('OK!');
        };
      });
  </script>
</body></html>
```

放 `~/.z-biz-tools/plugins/com.example.demo/`, 重启 app, ⌥Space 搜 "demo" 打开。
