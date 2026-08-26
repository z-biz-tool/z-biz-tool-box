# _SKILL/插件开发

让 AI / 第三方作者**造一个能直接被 z-biz-tool-box 加载的插件**所需的一切。

## 文件清单

| 文件 | 给谁看 | 用途 |
| ---- | ------ | ---- |
| [SKILL.md](./SKILL.md) | **AI** 主入口 | 5 步造一个内置插件, 契约 + 复用 hooks + icon 选 + 常见坑 |
| [plugin-template.tsx](./plugin-template.tsx) | 人类 / AI | 复制粘贴即用的插件骨架, 含 3 个 hooks 演示 |
| [example-json-formatter.tsx](./example-json-formatter.tsx) | 人类 / AI | 完整可跑示例, 展示 AntD 多组件 + 统计 + 校验 |
| [market-format.md](./market-format.md) | 市场源运营者 | 怎么部署一个远程市场源 (GitHub Pages / 30 行 Express) |
| [external-plugin.md](./external-plugin.md) | 外部插件作者 | 怎么发 `main.html` 走 iframe + `window.zBiz` API, 零重启安装 |

## 推荐阅读路径

### 我是 AI, 第一次做这个项目的插件
1. **[SKILL.md](./SKILL.md)** — 5 分钟读完整, 5 步做出来
2. **[plugin-template.tsx](./plugin-template.tsx)** — 复制改名
3. (可选) **[example-json-formatter.tsx](./example-json-formatter.tsx)** — 看到更复杂场景怎么写

### 我要部署一个市场源让别人装
→ **[market-format.md](./market-format.md)** + 项目根 [docs/market-spec.md](../../docs/market-spec.md)

### 我要发第三方插件 (不 PR 主项目)
→ **[external-plugin.md](./external-plugin.md)**

### 我只是想看懂这个项目怎么扩展
→ **[SKILL.md §1-2](./SKILL.md#1-30-秒理解体系)** + 项目根 [README.md](../../README.md)

## 体系结构 (速查)

```
z-biz-tool-box
├── src/plugins/<group>/           ← 内置插件放这里 (AI 主要做这个)
│   ├── encoding/  text/  crypto/
│   ├── convert/  network/  system/
│   └── _registry.tsx              ← 自动收集, 别动
│
├── src/plugins/external/          ← 外部插件运行时支持
│   ├── scanner.ts                 ← 扫 ~/.z-biz-tools/plugins/
│   ├── installer.ts               ← 从市场源下载安装
│   ├── market.ts                  ← 市场源 fetch + 校验
│   └── api.ts                     ← window.zBiz API 定义
│
├── docs/market-spec.md            ← 市场源规范 v1.0
└── _SKILL/插件开发/                ← 你正在看
```

## 提交 PR 自查清单

- [ ] `npx tsc --noEmit` 无错
- [ ] `npm run tauri dev` 能跑, ⌥Space 搜得到
- [ ] `meta.key` 在 6 个 group 之一, 全局唯一
- [ ] `meta.icon` 在 SKILL §4 表里
- [ ] 输入用 `usePluginInput` 持久化
- [ ] 复制用 `useCopyToClipboard`
- [ ] 错误用 `message.error` 提示
- [ ] 改完了, 提个 commit 描述功能, 不用 PR 也可以直接 push
