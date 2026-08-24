mod commands;
mod plugin_engine;
mod tray;

use tauri::{Manager, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tray::{create_tray, refresh_menu, GroupEntry, show_main_window, toggle_main_window};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            register_tools,
            plugin_engine::http_request,
            get_state,
        ])
        .setup(|app| {
            // macOS: 设为 Accessory — 出现在菜单栏,不显示 Dock 图标
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // 启动时先建一个空 tray
            create_tray(app.handle(), vec![])?;

            // 注册全局快捷键 ⌥Space 唤起/隐藏主窗口(Spotlight 风格)
            // macOS 默认 ⌘Space 是系统 Spotlight, 我们用 Alt+Space (即 ⌥Space)
            // 注意: 如果装了 Alfred/Raycast, 可能被抢; 用户可在系统设置里关掉对应快捷键
            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
            let app_handle = app.handle().clone();
            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _scut, event| {
                    if event.state == ShortcutState::Pressed {
                        eprintln!("[z-biz] ⌥Space pressed → toggle_main_window");
                        toggle_main_window(&app_handle);
                    }
                })?;
            eprintln!("[z-biz] registered ⌥Space global shortcut");

            // 备用快捷键 ⌃⌘K (Ctrl+Cmd+K) — 不冲突,作为 alt+space 被抢的 fallback
            let shortcut2 = Shortcut::new(
                Some(Modifiers::CONTROL | Modifiers::SUPER),
                Code::KeyK,
            );
            let app_handle2 = app.handle().clone();
            app.global_shortcut()
                .on_shortcut(shortcut2, move |_app, _scut, event| {
                    if event.state == ShortcutState::Pressed {
                        eprintln!("[z-biz] ⌃⌘K pressed → toggle_main_window");
                        toggle_main_window(&app_handle2);
                    }
                })?;
            eprintln!("[z-biz] registered ⌃⌘K fallback shortcut");

            // 主窗口: 关掉时隐藏(不退出进程),保持菜单栏常驻
            if let Some(win) = app.get_webview_window("main") {
                let win_clone = win.clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        // 阻止默认关闭,改为隐藏 — 用户通过 ⌥Space 或菜单栏图标再次唤起
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

/// 测试命令: 只读, 返回主窗口当前状态
#[tauri::command]
fn get_state(app: tauri::AppHandle) -> Result<String, String> {
    if let Some(w) = app.get_webview_window("main") {
        let visible = w.is_visible().unwrap_or(false);
        let focused = w.is_focused().unwrap_or(false);
        let minimized = w.is_minimized().unwrap_or(false);
        return Ok(format!("visible={} focused={} minimized={}", visible, focused, minimized));
    }
    Ok("(no main window)".into())
}

// 抑制 show_main_window 未使用警告(它由快捷键 handler 引用)
#[allow(dead_code)]
fn _unused() {
    let _ = show_main_window::<tauri::Wry>;
}
