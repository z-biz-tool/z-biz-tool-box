mod brother_tools;
// 只在测试构建里编译：生产路径由 build.rs 直接包含同一份源码（见该文件头注释）
#[cfg(test)]
mod brother_label;
mod image_ops;
mod installer;
mod logging;
mod plugin_engine;
mod tray;

use std::path::PathBuf;
use tauri::{Manager, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tray::{create_tray, refresh_menu, show_main_window, toggle_main_window, GroupEntry};

/// 用户主目录（图片能力的路径白名单锚点）。
fn app_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // panic hook 要最先装: 后面任何一步 panic, 现场都还来得及落盘(台账 T4.7)
    logging::install_panic_hook();

    // 深链队列。Arc 是必须的：既要 manage 出去给命令用，又要在下面的 setup 闭包里
    // 拿去 seed 冷启动那一条 —— 两处必须指向同一份队列。
    let handoff_pending = cap_hub::receiver::SharedPending::default();

    tauri::Builder::default()
        // 单实例（2026-10-26 分发底座）：第二次启动聚焦已有窗口，不再开新进程。
        // 必须作为第一个注册的插件（tauri-plugin-single-instance 官方要求）。
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            // 别的产品/脚本用 `zbiz://box/...` 唤起时，argv 就落在这里。
            // 这是「已运行实例」这一半，冷启动那一半在 setup 里 seed。
            cap_hub::receiver::handle_second_instance(app, &argv);
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        // 自动更新：前端 UpdaterGate 延时 check()，endpoint/pubkey 见 tauri.conf.json
        .plugin(tauri_plugin_updater::Builder::new().build())
        // 更新安装完成后的「立即重启」
        .plugin(tauri_plugin_process::init())
        // 深链队列：冷启动 seed 与 second-instance 转发都写它
        .manage(handoff_pending.clone())
        // 图片能力的路径白名单：只有主目录与 box 自己的工作目录能被读写。
        // 这条命令面能写文件，无限制等于给前端一个任意写入口。
        .manage({
            let mut roots = Vec::new();
            if let Some(home) = app_home() {
                // box 自己的工作目录在主目录里，但显式列出更清楚
                roots.push(home.join(".z-biz-tools"));
                roots.push(home);
            }
            image_ops::ImagePathScope::new(roots)
        })
        .invoke_handler(tauri::generate_handler![
            register_tools,
            plugin_engine::http_request,
            get_state,
            apply_window_prefs,
            uninstall_plugin,
            open_local_path,
            installer::brother_overview,
            installer::install_brother,
            installer::update_all_brothers,
            installer::launch_brother,
            zbiz_take_pending,
            logging::write_log,
            logging::open_log_dir,
            image_ops::list_displays,
            image_ops::list_windows,
            image_ops::capture_display,
            image_ops::capture_primary_display,
            image_ops::capture_region,
            image_ops::capture_window,
            image_ops::get_image_info,
            image_ops::read_exif,
            image_ops::write_exif,
            image_ops::strip_exif,
            image_ops::resize_image,
            image_ops::rotate_image,
            image_ops::flip_image,
            image_ops::crop_image,
            image_ops::apply_filter,
            image_ops::export_image,
            image_ops::get_image_thumbnail,
        ])
        .setup(move |app| {
            // macOS: 设为 Accessory — 出现在菜单栏,不显示 Dock 图标
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // 深链队列必须早于下面的 tray 构建：冷启动的 argv 要在任何 UI 之前收进来，
            // 否则前端挂载后 take 一次会拿到空。
            cap_hub::receiver::seed_cold_start(app.handle(), &handoff_pending);

            // 启动时先建 tray:内置工具占位"加载中…"+ 兄弟应用清单(用兄弟全量初检一次,
            // 让菜单第一次弹出就显示真实可用状态,避免闪烁)
            let initial_brothers = brother_tools::all_brothers_with_state();
            eprintln!(
                "[z-biz] brother tools scanned: {} total, {} installed",
                initial_brothers.len(),
                initial_brothers
                    .iter()
                    .filter(|b| b.installed_path.is_some())
                    .count()
            );
            // 打出每个命中项解析到的实际路径: 召唤功能一旦"打开了错的 app",
            // 这行日志就是判断依据(macOS 上尤其要看清是 /Applications 还是构建产物)
            for b in initial_brothers
                .iter()
                .filter(|b| b.installed_path.is_some())
            {
                eprintln!(
                    "[z-biz]   ✓ {} → {}",
                    b.display_name,
                    b.installed_path.as_deref().unwrap().display()
                );
            }
            create_tray(app.handle(), vec![], &initial_brothers)?;

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
            let shortcut2 = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SUPER), Code::KeyK);
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
///
/// **2026-10-25 接线**：这个命令以前**前端一次都没调过** ⇒ tray 菜单里
/// 永远是 Rust 侧的占位组「加载中…」（`create_tray` 在 groups 为空时就建那个占位），
/// 而且前端也**没监听** Rust 发的 `select-tool` ⇒ 点菜单项连窗口都不会切工具。
/// ⇒ box 的菜单栏入口整条链是断的。现在前端 mount 时推分组、并监听 `select-tool`。
#[tauri::command]
fn register_tools(app: tauri::AppHandle, groups: Vec<GroupEntry>) -> Result<(), String> {
    // 每次都重检兄弟状态:用户可能刚装/卸了另一个 app,
    // 我们的检测便宜(macOS mdfind 命中 Spotlight 索引,毫秒级)
    let brothers = brother_tools::all_brothers_with_state();
    refresh_menu(&app, &groups, &brothers).map_err(|e| e.to_string())
}

/// 测试命令: 只读, 返回主窗口当前状态
#[tauri::command]
fn get_state(app: tauri::AppHandle) -> Result<String, String> {
    if let Some(w) = app.get_webview_window("main") {
        let visible = w.is_visible().unwrap_or(false);
        let focused = w.is_focused().unwrap_or(false);
        let minimized = w.is_minimized().unwrap_or(false);
        return Ok(format!(
            "visible={} focused={} minimized={}",
            visible, focused, minimized
        ));
    }
    Ok("(no main window)".into())
}

/// 应用窗口相关偏好(支持热生效,不用重启)
/// 设计: 用 Tauri command 而不是 file watcher,理由
///  1. localStorage 才是 prefs 唯一真源;直接同步调用,无 race
///  2. 不用引入 notify crate 也不需要二次序列化
///  3. 未来加更多 live pref(透明度/缩放/主题色)只需扩 struct
///  4. 如果用户从外部文件改 prefs,需求用 file watcher 时再加
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowPrefs {
    #[serde(default)]
    always_on_top: bool,
}

#[tauri::command]
fn apply_window_prefs(app: tauri::AppHandle, prefs: WindowPrefs) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.set_always_on_top(prefs.always_on_top)
            .map_err(|e| format!("set_always_on_top 失败: {e}"))?;
        eprintln!(
            "[z-biz] applied window prefs: always_on_top={}",
            prefs.always_on_top
        );
    }
    Ok(())
}

/// 卸载外部插件: 递归删除 ~/.z-biz-tools/plugins/{id}/
/// - id 严格校验 (防路径穿越: 只允许 [a-zA-Z0-9._-]+)
/// - 用 std::fs::remove_dir_all 走 Rust 端, 避免 shell 权限问题
/// - 目录不存在视为幂等成功(不抛错), 让前端 scanner 重新扫描清掉缓存条目
#[tauri::command]
fn uninstall_plugin(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err(format!("非法 plugin id: {id:?}"));
    }
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("home_dir 失败: {e}"))?;
    let dir = home.join(".z-biz-tools").join("plugins").join(&id);
    if !dir.exists() {
        // 目录已不在 → 幂等: 不报错, 让前端 scanner 重新加载清掉 ext store 里的缓存条目
        eprintln!(
            "[z-biz] uninstall: dir already gone: {id} (path={})",
            dir.display()
        );
        return Ok(());
    }
    std::fs::remove_dir_all(&dir).map_err(|e| format!("删除失败: {e}"))?;
    eprintln!("[z-biz] uninstalled plugin: {id} (path={})", dir.display());
    Ok(())
}

/// 用系统文件管理器打开一个本机目录（不存在就建出来）。
///
/// 前端原来用 `@tauri-apps/plugin-shell` 的 `open(dir)`，但那个命令的参数校验
/// 只认 mailto:/tel:/http(s):// —— 传本地路径会被 scoped-command 校验拒掉，
/// 用户看到的是「Scoped command argument at position 0 ... failed regex validation」。
/// 打开目录本来就是本地动作，走系统命令最直接，也不用再给前端加一个插件依赖。
///
/// 限制在主目录内：这个命令不该变成任意路径的通用执行口。
#[tauri::command]
fn open_local_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("home_dir 失败: {e}"))?;
    let canon = resolve_open_path(&home, &path)?;

    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("explorer");
    #[cfg(target_os = "linux")]
    let mut cmd = std::process::Command::new("xdg-open");
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return Err("当前平台不支持打开目录".into());

    #[allow(unreachable_code)]
    cmd.arg(&canon)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("打开目录失败: {e}"))
}

/// 校验并落成待打开路径：绝对路径 + 无 `..` + 规范化后仍在主目录内。
/// 建目录放在校验中间是有意的：不存在的新目录 canonicalize 不出来。
fn resolve_open_path(home: &std::path::Path, path: &str) -> Result<std::path::PathBuf, String> {
    let home = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());
    let requested = std::path::PathBuf::from(path);
    if !requested.is_absolute() {
        return Err(format!("路径必须是绝对路径: {path}"));
    }
    // 建目录之前先挡 `..`：create_dir_all 不认「主目录之外」，
    // 先建后查等于让调用方在主目录外留目录。
    if requested
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(format!("路径不能包含 ..: {path}"));
    }
    // 词法上就必须在主目录里，这样 create_dir_all 没有机会在外面留目录
    if !requested.starts_with(&home) {
        return Err(format!("只允许打开主目录下的路径: {}", requested.display()));
    }
    std::fs::create_dir_all(&requested).map_err(|e| format!("建目录失败: {e}"))?;
    // 建完再规范化一次：符号链接指向主目录之外的情况只有 canonicalize 看得出来
    let canon = requested
        .canonicalize()
        .map_err(|e| format!("解析路径失败: {e}"))?;
    if !canon.starts_with(home) {
        return Err(format!("只允许打开主目录下的路径: {}", canon.display()));
    }
    Ok(canon)
}

#[cfg(test)]
mod open_path_tests {
    use super::resolve_open_path;

    #[test]
    fn 相对路径与父目录跳转一律拒绝() {
        let home = std::env::temp_dir().canonicalize().unwrap();
        assert!(resolve_open_path(&home, "relative/dir").is_err());
        assert!(resolve_open_path(&home, "/tmp/../etc").is_err());
    }

    #[test]
    fn 主目录之外的路径拒绝() {
        let home = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join("zbiz-home-outside");
        std::fs::create_dir_all(&home).unwrap();
        assert!(resolve_open_path(&home, "/etc").is_err());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn 主目录内缺失目录会被建出来() {
        let home = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join("zbiz-open-home");
        std::fs::create_dir_all(&home).unwrap();
        let target = home.join("plugins");
        let got = resolve_open_path(&home, target.to_str().unwrap()).unwrap();
        assert!(got.ends_with("plugins"));
        assert!(target.is_dir());
        let _ = std::fs::remove_dir_all(&home);
    }
}

// 抑制 show_main_window 未使用警告(它由快捷键 handler 引用)
#[allow(dead_code)]
fn _unused() {
    let _ = show_main_window::<tauri::Wry>;
}

// ── zbiz:// 深链接线 ──────────────────────────────────────────────────────
//
// 2026-10-30 起整条线由 cap-hub 提供：
//   · 协议编解码 / 待处理队列  → cap_hub（纯函数，零 tauri 依赖）
//   · Tauri 胶水层（事件 / 命令）→ cap_hub::receiver
// 本仓只保留「box 特有」的部分：前端按 params.key 路由到对应工具。
//
// 队列是「取走即清空」的，所以「收到信号」和「启动时主动取」不会重复执行。

/// 前端把队列取空。取走即清空。
///
/// 命令名家族统一为 `zbiz_take_pending`（各仓同名）。
#[tauri::command]
fn zbiz_take_pending(
    state: tauri::State<cap_hub::receiver::SharedPending>,
) -> Vec<cap_hub::Handoff> {
    cap_hub::receiver::take_pending_from(state.inner())
}
