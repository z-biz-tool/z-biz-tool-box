# z-biz-tool-box

> 插件化桌面工具箱 — 像 uTools / Raycast 一样,核心是壳,能力靠插件

![tech](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri)
![tech](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![tech](https://img.shields.io/badge/AntD-6-0170FE?logo=antdesign)
![tech](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![tech](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust)
![tech](https://img.shields.io/badge/Zustand-5-433931)

## 概览

**27 个内置工具**,覆盖编码 / 文本 / 加密 / 转换 / 网络 / 系统 6 大类。
全部前端实现 (Web Crypto API / 原生 JS),Rust 仅承担 HTTP 请求一个真正有性能优势的命令
(30s timeout + 强制忽略证书验证,浏览器 fetch 做不到)。

## 特性

- **⌘K 全局命令面板** — 任何位置按下 ⌘K (Windows: Ctrl+K) 召唤
  - 收藏 ★ / 最近 ⏱ / 全量 三段式
  - ↑↓ 键盘导航,Enter 直跳
  - 全文模糊搜索 (label + description + keywords)
- **持久化工作上下文** — 主题、收藏、最近使用、最近输入全部走 zustand persist + localStorage
- **插件市场** — 一键启用/禁用,侧边栏和命令面板自动过滤
- **真正的插件架构** — 单一注册点 (`src/plugins/_registry.tsx`),新增插件零修改:
  ```
  src/plugins/{group}/MyTool.tsx
    ├─ export default MyComponent
    └─ export const meta: PluginMeta = { key, label, description, icon }
  ```

## 内置工具

| 分组 | 工具 |
|------|------|
| **编码** | Base64 / URL / HTML 实体 / Hex / 哈希 (MD5/SHA) |
| **文本** | JSON 工具 / Diff / 大小写 / 去重 / 排序 / 字数 / 翻转 / Lorem |
| **加密** | JWT 解码 / 密码生成 / 密码强度 / UUID |
| **转换** | 颜色 / 进制 / 单位 / 汇率 / Cron / 时间戳 |
| **网络** | HTTP 测试 (Rust reqwest, 30s timeout + 禁证书) / IP 子网 |
| **系统** | 剪贴板 (自动监听 + 置顶 + 搜索) / 插件市场 |

## 架构

```
src/
├─ App.tsx                  顶层: 主题 + 菜单 + 当前 plugin
├─ main.tsx                 React 入口
├─ tools.tsx                薄壳, re-export 自 _registry
├─ _shared/                 通用 UI
│  ├─ AppShell.tsx           Layout (Header + Sider + Content)
│  ├─ ThemeContext.tsx       light/dark + AntD ConfigProvider
│  ├─ States.tsx             Empty/Loading/Error 三态
│  ├─ QuickOpen.tsx          ⌘K 命令面板 (~280 行)
│  └─ hooks.ts               useCopyToClipboard / usePluginInput / useClearAll
├─ stores/
│  └─ uiStore.ts             Zustand + persist (theme/starred/recent/inputs/disabled)
└─ plugins/
   ├─ _types.ts              PluginMeta / ToolMeta / ToolGroup 接口
   ├─ _registry.tsx          import.meta.glob 自动注册 (单一注册点)
   ├─ encoding/  text/  crypto/  convert/  network/  system/
   │   └─ *.tsx              每个文件 export default + meta
src-tauri/
└─ src/
   ├─ lib.rs                 Tauri 入口 (4 个 plugin 装载)
   ├─ commands.rs            greet
   └─ plugin_engine.rs       http_request (Rust 唯一保留的命令)
```

## 开发

```bash
# 前端开发 (HMR)
npm run dev

# 类型检查
npx tsc --noEmit

# 生产构建 (前端)
npm run build

# 桌面应用开发 (Tauri,会启动原生窗口)
npm run tauri dev

# 桌面应用打包
npm run tauri build
```

## 平台

- **macOS** (Apple Silicon + Intel)
- **Windows** (x86_64)
- **Linux** (deb / AppImage / rpm,需自测)

## 路线图

- [ ] 扩展目录机制: 从 `~/.config/z-biz-tool-box/extensions/*.json` 加载外部插件元数据
- [ ] ⌘K 面板支持"按 Enter 复制 ID"
- [ ] 设计 token 化: 收敛 80+ 处内联 style
- [ ] 26 个未接入 `usePluginInput` 的工具逐个迁移

## License

MIT
