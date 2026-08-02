# z-biz-tool-box

> 插件化工具箱 — 截图/剪贴板/密码/代码片段/计时器/JSON/编码/正则...（插件扩展）

## 合并来源

| 原项目 | 插件 |
|--------|------|
| z-biz-tool-doc2md-cos | 文档转Markdown |
| z-biz-tool-password-generator-cos | 密码生成 |
| z-biz-tool-password-manager-cos | 密码管理 |
| z-biz-tool-compass-cos | 指南针 |
| z-biz-tool-exchange-rate-cos | 汇率换算 |
| z-biz-tool-unit-converter-cos | 单位换算 |
| z-biz-tool-qr-scanner-cos | 二维码 |
| (新增) | 截图标注/剪贴板/代码片段/计时器/JSON/编码/正则/UUID/颜色/HTTP/Cron |

## 架构

- 核心：插件引擎 + 插件市场 + 配置管理
- 插件：JS/TS编写，热加载，用户可自定义
- 模式：像uTools/Raycast，核心是壳，能力靠插件

## 技术栈

- Electron
- Mac/Windows 双平台
