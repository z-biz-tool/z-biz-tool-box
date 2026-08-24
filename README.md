# z-biz-tool-box

> 插件化桌面工具箱 — 像 uTools / Raycast 一样，核心是壳，能力靠插件

![tech](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri)
![tech](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![tech](https://img.shields.io/badge/AntD-6-0170FE?logo=antdesign)
![tech](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![tech](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust)
![tech](https://img.shields.io/badge/Zustand-5-433931)

---

## 概览

**27 个内置工具**，覆盖**编码 / 文本 / 加密 / 转换 / 网络 / 系统** 6 大类。核心定位是一个**轻量插件化工具箱**：应用本身只是壳，所有能力通过单一注册点动态加载，新增工具只需写一个文件、零代码侵入。

- 绝大部分工具**纯前端实现**（Web Crypto API / 原生 JS），无后端依赖
- Rust 仅承担一个真正有性能优势的命令 —— `http_request`（30s timeout + 强制忽略证书验证，浏览器 fetch 做不到）
- 全部数据走 `localStorage`，无后端、无账号、可离线使用

---

## 特性

- **⌘K 全局命令面板** — 任何位置按下 ⌘K (Windows: Ctrl+K) 召唤
  - 收藏 ★ / 最近 ⏱ / 全量 三段式视图
  - ↑↓ 键盘导航，Enter 直跳
  - 全文模糊搜索（label + description + keywords）
- **持久化工作上下文** — 主题、收藏、最近使用、最近输入全部走 zustand persist + localStorage
- **插件市场** — 一键启用/禁用，侧边栏和命令面板自动过滤
- **真正的插件架构** — 单一注册点 (`src/plugins/_registry.tsx`)，新增插件零修改：

  ```ts
  // src/plugins/{group}/MyTool.tsx
  export default MyComponent
  export const meta: PluginMeta = { key, label, description, icon }
  ```

- **主题切换** — light / dark 主题 + AntD ConfigProvider 联动
- **快捷键面板** — 命令面板 + 自定义 hook（`useKeyboardShortcuts`）

---

## 内置工具（27 个）

| 分组 | 工具 |
|------|------|
| **编码** | Base64 编解码 / URL 编解码 / HTML 实体转换 / Hex 转换 / 哈希（MD5/SHA-1/SHA-256/SHA-512） |
| **文本** | JSON 格式化（压缩/美化/校验）/ Diff 文本对比 / 大小写转换 / 文本去重 / 文本排序 / 字数统计 / 文本翻转 / Lorem Ipsum 生成 |
| **加密** | JWT 解码 / 密码生成（可定制长度/字符集）/ 密码强度评估 / UUID 生成 |
| **转换** | 颜色（HEX/RGB/HSL 互转）/ 进制（2/8/10/16 互转）/ 单位（长度/重量/温度/面积）/ 汇率（实时拉取）/ Cron 解析 / Unix 时间戳 |
| **网络** | HTTP 测试（Rust reqwest，30s timeout + 禁证书校验）/ IP 子网计算 |
| **系统** | 剪贴板（自动监听 + 置顶 + 搜索历史）/ 插件市场（启用/禁用工具） |

---

## 架构

```
src/
├─ App.tsx                  顶层：主题 + 菜单 + 当前激活的 plugin
├─ main.tsx                 React 入口
├─ tools.tsx                薄壳，re-export 自 _registry
├─ _shared/                 通用 UI 组件
│  ├─ AppShell.tsx           Layout（Header + Sider + Content）
│  ├─ ThemeContext.tsx       light/dark + AntD ConfigProvider
│  ├─ States.tsx             Empty/Loading/Error 三态
│  ├─ QuickOpen.tsx          ⌘K 命令面板（~280 行）
│  └─ hooks.ts               useCopyToClipboard / usePluginInput / useClearAll
├─ stores/
│  └─ uiStore.ts             Zustand + persist（theme/starred/recent/inputs/disabled）
└─ plugins/
   ├─ _types.ts              PluginMeta / ToolMeta / ToolGroup 接口
   ├─ _registry.tsx          import.meta.glob 自动注册（单一注册点）
   ├─ encoding/  text/  crypto/  convert/  network/  system/
   │  └─ *.tsx               每个文件 export default + meta
src-tauri/
└─ src/
   ├─ lib.rs                 Tauri 入口（4 个 plugin 装载）
   ├─ commands.rs            greet
   └─ plugin_engine.rs       http_request（Rust 唯一保留的命令）
```

**核心设计**

- `_registry.tsx` 通过 `import.meta.glob('./{group}/*.tsx', { eager: true })` 自动扫描所有插件目录，无需手动注册
- 每个插件是一个独立 React 组件，自带 `meta` 元数据（label、icon、description、keywords）
- `uiStore` 持久化用户偏好（主题、收藏、最近使用、输入历史、启停状态）

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面运行时 | Tauri 2 (Rust + 系统 WebView) |
| 前端框架 | React 19 + TypeScript 5 |
| UI 组件 | Ant Design 6 |
| 状态管理 | Zustand 5 (+ persist 中间件) |
| 加密 | Web Crypto API |
| HTTP (后端) | Rust reqwest（绕过浏览器 CORS / 证书限制） |
| 构建 | Vite 6 |
| Rust | stable |

---

## 开发

```bash
# 装依赖
npm install

# 前端开发（HMR）
npm run dev

# 类型检查
npm run typecheck    # 等价于 npx tsc --noEmit

# 生产构建（前端）
npm run build

# 桌面应用开发（启动 Tauri 原生窗口 + 热重载）
npm run tauri dev

# 桌面应用打包（出 .app + .dmg / .msi / .AppImage）
npm run tauri build
```

---

## 平台支持

- **macOS** — Apple Silicon + Intel
- **Windows** — x86_64
- **Linux** — deb / AppImage / rpm（需自测兼容性）

---

## 添加新工具

最快的方式：

1. 在 `src/plugins/{group}/` 下新建一个 `.tsx` 文件
2. 导出一个 React 组件 + `meta` 元数据
3. 完事 —— `_registry.tsx` 会自动注册，命令面板和侧边栏会自动出现

```tsx
// src/plugins/text/ReverseText.tsx
import { Input } from 'antd'
import type { ToolMeta } from '../_types'

export default function ReverseText() {
  return <Input.TextArea rows={6} placeholder="输入文本" />
}

export const meta: ToolMeta = {
  key: 'reverse-text',
  label: '文本翻转',
  description: '把输入文本按字符翻转',
  keywords: ['reverse', '字符串', '翻转'],
  group: 'text',
  icon: '🔄',
}
```

---

## 路线图

- [ ] 扩展目录机制：从 `~/.config/z-biz-tool-box/extensions/*.json` 加载外部插件元数据
- [ ] ⌘K 面板支持"按 Enter 复制 ID"
- [ ] 设计 token 化：收敛 80+ 处内联 style
- [ ] 26 个未接入 `usePluginInput` 的工具逐个迁移
- [ ] 国际化（i18n）

---

## License

MIT
