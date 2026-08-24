use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

/// 前端发来的工具项(从 _registry 序列化)
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolEntry {
    pub key: String,
    pub label: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GroupEntry {
    pub key: String,
    pub label: String,
    pub tools: Vec<ToolEntry>,
}

/// 工具菜单项 id 前缀 — 用于 on_menu_event 区分来源
const TOOL_ID_PREFIX: &str = "tool:";

/// 把分组列表构造成 menu
/// Tauri 2 的 Submenu::with_items / Menu::with_items 接收 `&[&dyn IsMenuItem]`,
/// 而 Box<dyn> 不能直接 coerce,所以这里用 "new + append" 模式构造。
fn build_menu<R: Runtime>(app: &AppHandle<R>, groups: &[GroupEntry]) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;

    // 顶部快捷项: 显示/隐藏主窗口
    let show_item = MenuItem::with_id(app, "show-main", "🔍 唤起主窗口 (⌥Space)", true, None::<&str>)?;
    menu.append(&show_item)?;
    let hide_item = MenuItem::with_id(app, "hide-main", "👋 隐藏主窗口", true, None::<&str>)?;
    menu.append(&hide_item)?;

    let sep0 = PredefinedMenuItem::separator(app)?;
    menu.append(&sep0)?;

    for g in groups {
        let sub = Submenu::new(app, &g.label, true)?;
        for t in &g.tools {
            let id = format!("{TOOL_ID_PREFIX}{}", t.key);
            let item = MenuItem::with_id(app, &id, &t.label, true, None::<&str>)?;
            sub.append(&item)?;
        }
        menu.append(&sub)?;
    }

    let sep = PredefinedMenuItem::separator(app)?;
    menu.append(&sep)?;

    let quit = MenuItem::with_id(app, "quit", "退出 z-biz-tool-box", true, None::<&str>)?;
    menu.append(&quit)?;

    Ok(menu)
}

/// 唤起主窗口并聚焦
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// 切换主窗口显示/隐藏(toggle)
pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        match w.is_visible() {
            Ok(true) => {
                let _ = w.hide();
            }
            _ => {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    }
}

/// 构建并启动 tray。groups: 初始工具列表(可为空,前端注册后重建)
pub fn create_tray<R: Runtime>(app: &AppHandle<R>, groups: Vec<GroupEntry>) -> tauri::Result<()> {
    let initial: Vec<GroupEntry> = if groups.is_empty() {
        vec![GroupEntry {
            key: "_loading".into(),
            label: "加载中…".into(),
            tools: vec![],
        }]
    } else {
        groups
    };
    let menu = build_menu(app, &initial)?;

    // 32x32.png — include_bytes! 编译期嵌入,运行时无 IO。
    let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true) // macOS 单色,跟随系统亮/暗模式
        .tooltip("z-biz-tool-box")
        .menu(&menu)
        .show_menu_on_left_click(true) // 左键点击直接展开工具列表
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            if id == "quit" {
                app.exit(0);
                return;
            }
            if id == "show-main" {
                show_main_window(app);
                return;
            }
            if id == "hide-main" {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
                return;
            }
            if let Some(tool_key) = id.strip_prefix(TOOL_ID_PREFIX) {
                // 1) 通知前端切到对应工具
                let _ = app.emit("select-tool", tool_key.to_string());
                // 2) 唤起主窗口
                show_main_window(app);
            }
        })
        .on_tray_icon_event(|_tray, event| {
            // 扩展点: 中键 / 双击 等。当前 show_menu_on_left_click(true) 已覆盖左键出菜单。
            if let TrayIconEvent::Click {
                button: MouseButton::Right,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // 右键: 不做事,菜单由 show_menu_on_left_click 触发
            }
        })
        .build(app)?;

    Ok(())
}

/// 用最新工具列表重建 menu。TrayIcon 不直接暴露 menu setter,所以用 app
/// 拿到已建好的 tray 重新 set_menu。
pub fn refresh_menu<R: Runtime>(app: &AppHandle<R>, groups: &[GroupEntry]) -> tauri::Result<()> {
    let menu = build_menu(app, groups)?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}
