# SKILL: z-biz-tool-box 插件开发

> **目标**: AI 读这份 SKILL 后, 能直接产出一个**兼容本项目**的插件, 放进 `src/plugins/<group>/<Name>.tsx` 就能自动注册, 出现在 Spotlight 浮层 / QuickOpen / 菜单栏下拉里。

---

## 0. 30 秒理解体系

```
z-biz-tool-box = Tauri 2 桌面浮层 (菜单栏 Spotlight 风格)
├── src/plugins/<group>/<Name>.tsx   ← 内置插件 (你来造的就是这个)
│   ├── export default <Component>   ← 必填
│   └── export const meta: PluginMeta ← 必填
├── src/plugins/_registry.tsx        ← 自动收集所有 .tsx, 你不用改
├── src/_shared/                     ← hooks 复用 (usePluginInput, useCopyToClipboard...)
├── docs/market-spec.md              ← 怎么发到远程市场源
├── src/plugins/external/            ← 外部插件目录 (~/.z-biz-tools/plugins/<id>/)
└── _SKILL/插件开发/                  ← 你正在看
```

**核心契约**:
- 一个文件 = 一个插件
- 文件名 = `<Name>Tool.tsx` 或 `<Name>.tsx`
- `default export` 一个 React 组件
- `export const meta: PluginMeta` 元数据

**自动注册**:
`src/plugins/_registry.tsx` 用 `import.meta.glob("./{group}/*.tsx", { eager: true })` 收集所有插件文件 — **你不需要修改任何 registry 代码**, 放下文件就走。

---

## 1. 5 步造一个插件

### Step 1: 选 group

`src/plugins/` 下 6 个组, 选一个最契合的:

| group     | 用途               | 已有示例                |
| --------- | ------------------ | ----------------------- |
| encoding  | 编解码 / 哈希      | Base64 / Hex / Hash     |
| text      | 文本处理           | JSON / Diff / Case      |
| crypto    | 密码 / 加密        | JWT / Password          |
| convert   | 格式 / 单位转换    | Color / Timestamp       |
| network   | HTTP / IP          | HTTP Tester / IP        |
| system    | 系统集成           | Clipboard / Market      |

> 觉得都不合适? 改 `_registry.tsx` 第 52 行的 glob pattern 加一个新 group, 但**不推荐**, 先看看现有 6 个能不能 cover。

### Step 2: 起名 + 选 key

- **文件名**: `<Name>Tool.tsx` (例: `HashTool.tsx`, `JwtDecoder.tsx`, `MyTool.tsx`)
- **meta.key**: 小写反向域名风格, 与文件名去 Tool 后缀一致
  - ✅ `key: "hash"`, `key: "jwt"`, `key: "image-base64"`
  - ❌ `key: "HashTool"`, `key: "JWT"`, `key: "我的工具"`
- **必须唯一**: 在 `src/plugins/` 全部 .tsx 里搜一遍别撞名

### Step 3: 写 meta

```ts
import type { PluginMeta } from "../_types";

export const meta: PluginMeta = {
  key: "my-tool",              // 必填, 唯一
  label: "我的工具",            // 必填, 显示名 (中文友好)
  description: "一句话功能说明", // 必填, 用在搜索/侧边栏
  keywords: "keyword1 keyword2",  // 可选, 空格分隔, ⌘K 模糊搜索用
  order: 100,                   // 可选, 数字越小越靠前 (默认 999)
  icon: "tool",                 // 可选, 见 _SKILL/插件开发/icon-catalog.md
};
```

⚠️ **不要**用 `cmds` 字段 (历史遗留, 跟 keywords 重复且 schema 实际用的是 `keywords`)

### Step 4: 写组件

最小骨架:
```tsx
import { useState } from "react";
import { Card, Input, Button, Space } from "antd";
import { usePluginInput, useCopyToClipboard, useClearAll } from "../../_shared";

export default function MyTool() {
  const [input, setInput] = usePluginInput("my-tool");   // 自动持久化
  const [output, setOutput] = useState("");
  const copy = useCopyToClipboard();
  const clear = useClearAll([() => setInput(""), () => setOutput("")]);

  return (
    <Card title="我的工具" bordered={false}>
      <Input.TextArea rows={6} value={input} onChange={(e) => setInput(e.target.value)} />
      <Space style={{ marginTop: 12 }}>
        <Button type="primary" onClick={() => setOutput(input.toUpperCase())}>转换</Button>
        <Button onClick={clear}>清空</Button>
        <Button onClick={() => copy(output)} disabled={!output}>复制</Button>
      </Space>
      <Input.TextArea rows={6} value={output} readOnly style={{ marginTop: 12 }} />
    </Card>
  );
}
```

### Step 5: 验证

```bash
# 类型检查
npx tsc --noEmit

# 跑起来
npm run tauri dev
# 按 ⌥Space 唤起 Spotlight 浮层
# 搜你的 key (如 "my-tool") 或 label ("我的工具")
# 选中打开 → 检查 UI
```

构建: `npm run tauri build` (产物在 `src-tauri/target/release/bundle/`)

---

## 2. 契约 (强制)

| 必须 | 字段 | 约束 |
| ---- | ---- | ---- |
| ✅    | `default export` 组件 | React 函数组件 |
| ✅    | `export const meta`  | 对象字面量, 直接赋值给 `PluginMeta` 类型 |
| ✅    | `meta.key`           | 唯一, 小写, 匹配 `[a-z0-9-]+` |
| ✅    | `meta.label`         | 非空字符串 |
| ✅    | `meta.description`   | 非空字符串 |

| 推荐 | 字段 | 何时 |
| ---- | ---- | ---- |
| ⭐    | `meta.icon` | 总是, 提升菜单/侧边栏辨识度 |
| ⭐    | `usePluginInput(key)` | 当用户会输入文本, 跨会话保留 |
| ⭐    | `useCopyToClipboard()` | 几乎所有工具有输出 |
| ⭐    | `message.error()` | 操作失败时给提示 |
| ⭐    | 复用 `_shared` hooks | 不要自己重写 clear/copy/input 持久化 |

| 不要 | 原因 |
| ---- | ---- |
| ❌ `useState` 直接保存输入 | 切工具再回来会丢; 用 `usePluginInput` |
| ❌ 写自己的 copy 逻辑 | 统一在 `useCopyToClipboard` 处理降级 |
| ❌ 直接 `fetch(url)` | Tauri 2 webview 受 CORS 限制, 用 `tauri-plugin-http` |
| ❌ 改 `_registry.tsx` | 自动收集, 不用手动注册 |
| ❌ 跨 group 互相 import | 注册按目录分, 跨目录耦合会乱 |
| ❌ 写中文 key / 含空格 key | QuickOpen 搜索按 key 拼 url, 不友好 |

---

## 3. 复用 Hooks (`src/_shared/hooks.ts`)

| Hook | 用途 |
| ---- | ---- |
| `usePluginInput(key: string): [string, (v: string) => void]` | 跨会话持久化输入 |
| `useCopyToClipboard(): (text: string, label?: string) => Promise<void>` | 复制 + antd message 提示, 自动降级 |
| `useClearAll(setters: Array<() => void>): () => void` | 批量清空 state |
| `useCommonStyles()` | AntD 配置 / 通用样式 |
| `useTheme()` | 主题切换 (light/dark) |

---

## 4. Icon 选用 (`_registry.tsx` ICON_MAP)

`meta.icon` 是字符串 key, 客户端解析成 `<Icon />` 组件。**只能从下表选**, 否则 fallback 到 `ToolOutlined`。

| key | 视觉 | 适合 |
| --- | --- | --- |
| `code` | `<CodeOutlined />` | 编码/解码 |
| `text` | `<FileTextOutlined />` | 文本工具 |
| `lock` | `<LockOutlined />` | 密码/加密 |
| `swap` | `<SwapOutlined />` | 转换/换算 |
| `globe` | `<GlobalOutlined />` | 网络/HTTP |
| `desktop` | `<DesktopOutlined />` | 系统/剪贴板 |
| `appstore` | `<AppstoreOutlined />` | 应用/市场 |
| `link` | `<LinkOutlined />` | URL |
| `html` | `<Html5Outlined />` | HTML 实体 |
| `hex` | `<FieldNumberOutlined />` | 十六进制 |
| `key` | `<KeyOutlined />` | 哈希/密钥 |
| `database` | `<DatabaseOutlined />` | 数据库 |
| `diff` | `<DiffOutlined />` | 对比/差异 |
| `font` | `<FontSizeOutlined />` | 字体/字符 |
| `fontcolors` | `<FontColorsOutlined />` | 颜色相关 |
| `filter` | `<FilterOutlined />` | 过滤/去重 |
| `sort` | `<SortAscendingOutlined />` | 排序 |
| `chart` | `<BarChartOutlined />` | 统计 |
| `retweet` | `<RetweetOutlined />` | 翻转 |
| `file` | `<FileOutlined />` | 文件 |
| `api` | `<ApiOutlined />` | API |
| `shield` | `<SafetyCertificateOutlined />` | 安全 |
| `id` | `<IdcardOutlined />` | ID/UUID |
| `color` | `<BgColorsOutlined />` | 颜色 |
| `number` | `<NumberOutlined />` | 数字 |
| `scale` | `<ColumnHeightOutlined />` | 单位/尺寸 |
| `dollar` | `<DollarOutlined />` | 汇率/金额 |
| `clock` | `<ClockCircleOutlined />` | 时间 |
| `thunder` | `<ThunderboltOutlined />` | 速度/性能 |
| `snippets` | `<SnippetsOutlined />` | 片段/模板 |
| `tags` | `<TagsOutlined />` | 标签 |
| `history` | `<HistoryOutlined />` | 历史/时间 |
| `tool` | `<ToolOutlined />` | 通用 fallback |

> 没合适的? 改 `src/plugins/_registry.tsx` 第 69-103 行的 `ICON_MAP` 加一行 (不太常见)。

---

## 5. 可选: 发到市场源

如果你想让其他人通过 URL 自动发现这个插件, 见 [`market-format.md`](./market-format.md) — 你需要:
1. 部署一个静态 HTTP 服务 (GitHub Pages / S3 / 任何)
2. 提供 `index.json` (`GET {base}/list`)
3. 插件文件放 `plugin.json` + `main.html` + `logo.png` (按规范)

---

## 6. 可选: 发为外部插件 (iframe 沙箱)

如果想不重启 app 就能装/卸插件, 见 [`external-plugin.md`](./external-plugin.md) — 用户从市场装到本地 `~/.z-biz-tools/plugins/<id>/`, app 通过 `<iframe src=…>` 加载, 主应用注入 `window.zBiz` 受限 API。

---

## 7. 常见坑

| 现象 | 原因 | 解决 |
| ---- | ---- | ---- |
| Spotlight 搜不到插件 | key 写错 / 重复 / 缓存 | `rm -rf $HOME/Library/Caches/com.zifang.z-biz-tool-box` 重启 |
| 菜单栏下拉没新插件 | tray 缓存了旧 group 列表 | 重新 `npm run tauri build` |
| 切换工具后输入丢失 | 用了 `useState` 不用 `usePluginInput` | 换成 `usePluginInput(key)` |
| TypeScript 报 `cmds` 字段不存 | schema 用 `keywords` 不是 `cmds` | 改名 `keywords` |
| 颜色主题变了 UI 难看 | 用了硬编码颜色 | 改用 `var(--ant-color-primary-bg)` 等 |
| 拖动失效 | 用了 `data-no-drag` 但想要拖 | 去掉 `data-no-drag`, 父级是 drag region |

---

## 8. 验证清单 (提交前自查)

- [ ] `npx tsc --noEmit` 无错
- [ ] `npm run tauri dev` 能跑, ⌥Space 唤起 Spotlight 搜得到
- [ ] `meta.key` 在 `_registry.tsx` 自动收集范围内 (默认 6 个 group 之一)
- [ ] `meta.icon` 在 ICON_MAP 表里 (没写也会 fallback)
- [ ] 输入框用了 `usePluginInput` 持久化
- [ ] 复制按钮用了 `useCopyToClipboard`
- [ ] 错误路径有 `message.error` 提示
- [ ] `useEffect` 里 `setInput` 不会循环触发 (持久化 hook 已做处理)

完成所有 ✅ 之后, 提 PR 描述功能即可。
