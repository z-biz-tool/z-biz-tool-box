import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installFrontendErrorLogging } from "./_shared/errorLogger";
import "./index.css";

// 台账 T4.6: 前端 window.onerror / unhandledrejection → 写日志到
// ~/.z-biz-tools/logs/(经 Rust 的 write_log command)。
//
// 必须在 render **之前**装: React 渲染期的错误如果发生在装好之前,
// 就只有控制台那一行, 窗口一关就没了。
installFrontendErrorLogging();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
