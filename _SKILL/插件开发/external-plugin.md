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

### 禁止的事

| ❌ | 原因 |
| -- | ---- |
| `fetch('http://other-domain')` | webview CORS 限制, 用 `invoke('http_request')` |
| `localStorage` 跨 plugin 共享 | 用 `window.zBiz.storage` (plugin-scoped) |
| `window.parent.xxx` | iframe 沙箱隔离 |
| `<script src="https://evil">` 注入外部 | 沙箱化但仍建议自己打包 |
| `eval()` / `Function()` | 沙箱允许但污染全局, 慎用 |

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
  "features": [{ "code": "demo", "explain": "演示按钮" }]
}
```

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
