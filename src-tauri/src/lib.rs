mod commands;
mod plugin_engine;
mod tray;

use tauri::{Manager, WindowEvent};
use tray::{create_tray, refresh_menu, GroupEntry};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            register_tools,
            plugin_engine::http_request,
        ])
        .setup(|app| {
            // macOS: 设为 Accessory — 出现在菜单栏,不显示 Dock 图标
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // 启动时先建一个空 tray,前端 mount 后会调 register_tools 注入真实工具列表
            create_tray(app.handle(), vec![])?;

            // 主窗口: 关掉时隐藏(不退出进程),保持菜单栏常驻
            if let Some(win) = app.get_webview_window("main") {
                let win_clone = win.clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        // 阻止默认关闭,改为隐藏 — 用户通过菜单栏图标再次唤起
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 前端 mount 时调用,把当前启用的工具分组推给 Rust 构建 tray 菜单
#[tauri::command]
fn register_tools(app: tauri::AppHandle, groups: Vec<GroupEntry>) -> Result<(), String> {
    refresh_menu(&app, &groups).map_err(|e| e.to_string())
}
