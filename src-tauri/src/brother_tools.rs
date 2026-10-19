//! 兄弟应用清单 + 安装检测/启动
//!
//! 数据来源: build.rs codegen 出来的 `GENERATED_BROTHERS`(从
//! `../../z-biz-tool-lead/003_辅助能力/bootstrap/manifest.json` 读)。
//! 检测/启动按平台分支: macOS mdfind / Windows %LOCALAPPDATA%\Programs / Linux .desktop。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 运行时兄弟应用条目: codegen 出的种子 + 检测后填 installed_path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrotherEntry {
    pub key: String,          // "worker"  — tray id & GitHub repo 短名
    pub name: String,         // "z-biz-tool-worker"
    pub bundle_id: String,    // "com.zifang.z-biz-tool-worker"
    pub display_name: String, // "AI 任务看板"
    pub installed_path: Option<PathBuf>,
    pub installed_version: Option<String>, // 本机 CFBundleShortVersionString
}

/// 由 build.rs 注入。BrotherSeed struct 与 const GENERATED_BROTHERS 都来自
/// 生成文件,这里只转发 — 不能在本文件再定义同名 struct,会触发 "defined multiple times"。
mod generated {
    include!(concat!(env!("OUT_DIR"), "/generated_brothers.rs"));
}

/// 兄弟图标 PNG(编译期从各兄弟仓内嵌,见 build.rs codegen_brother_icons)
mod generated_icons {
    include!(concat!(env!("OUT_DIR"), "/generated_brother_icons.rs"));
}

use generated::BrotherSeed;

impl BrotherEntry {
    fn from_seed(seed: &BrotherSeed) -> Self {
        Self {
            key: seed.key.to_string(),
            name: seed.name.to_string(),
            bundle_id: seed.bundle_id.to_string(),
            display_name: seed.display_name.to_string(),
            installed_path: None,
            installed_version: None,
        }
    }
}

/// 面板卡片用的图标字节。缺图(兄弟仓未 clone)时返回 None,前端退回首字母色块。
pub fn icon_png(key: &str) -> Option<&'static [u8]> {
    generated_icons::GENERATED_BROTHER_ICONS
        .iter()
        .find(|i| i.key == key)
        .and_then(|i| i.png)
}

pub fn all_brothers_with_state() -> Vec<BrotherEntry> {
    let mut out: Vec<BrotherEntry> = generated::GENERATED_BROTHERS
        .iter()
        .map(BrotherEntry::from_seed)
        .collect();
    for b in out.iter_mut() {
        b.installed_path = detect_one(&b.bundle_id, &b.name);
        b.installed_version = b.installed_path.as_deref().and_then(read_bundle_version);
    }
    out
}

/// 从 <app>/Contents/Info.plist 读 CFBundleShortVersionString。
/// 不引 plist crate:只按 <key>…</key><string>…</string> 的成对结构取值,
/// 兄弟仓的 Info.plist 都是 tauri-build 生成的规整单层 plist。
pub fn read_bundle_version(app_path: &Path) -> Option<String> {
    let plist = app_path.join("Contents/Info.plist");
    let text = fs::read_to_string(plist).ok()?;
    plist_string_value(&text, "CFBundleShortVersionString")
}

/// 取 plist 里某个 <key>K</key> 后面紧跟的 <string> 值。
pub fn plist_string_value(text: &str, key: &str) -> Option<String> {
    let after = text.split_once(&format!("<key>{key}</key>"))?.1;
    let start = after.find("<string>")? + "<string>".len();
    let end = after[start..].find("</string>")? + start;
    let v = after[start..end].trim();
    if v.is_empty() {
        None
    } else {
        Some(v.to_string())
    }
}

/// 取 plist 里的 CFBundleIdentifier,用于校验下载下来的 .app 是不是清单里那个。
pub fn read_bundle_id(app_path: &Path) -> Option<String> {
    let plist = app_path.join("Contents/Info.plist");
    let text = fs::read_to_string(plist).ok()?;
    plist_string_value(&text, "CFBundleIdentifier")
}

/// 各平台分别用 bundle_id（macOS 查 Spotlight）或 name（拼安装路径）定位已安装产物。
/// `_name` 只是为了让 macOS 分支以外的编译目标不报 unused。
fn detect_one(bundle_id: &str, _name: &str) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        detect_macos(bundle_id, _name)
    }
    #[cfg(target_os = "windows")]
    {
        let _ = bundle_id;
        return detect_windows(_name);
    }
    #[cfg(target_os = "linux")]
    {
        let _ = bundle_id;
        return detect_linux(_name);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = (bundle_id, _name);
        None
    }
}

/// macOS 探测。顺序刻意是「先标准装机目录，再全盘索引」：
///
/// Spotlight(mdfind) 索引整盘，会把开发仓 `src-tauri/target/release/bundle/macos/*.app`
/// 里的**构建产物**也当成已安装（2026-10-11 实测：db/file/note/kb/cpu/aigen 六个
/// 命中的全是 target 下的构建副本，/Applications 里根本没装）。直接信 mdfind 会让
/// 「召唤」拉起一份 target 里的僵尸副本，而不是用户真正在用的那个。
///
/// 所以：① 先按 name 直接探 /Applications 与 ~/Applications（无子进程、命中即准）；
/// ② 再退回 mdfind，但显式排除构建目录。
#[cfg(target_os = "macos")]
fn detect_macos(bundle_id: &str, name: &str) -> Option<PathBuf> {
    if !is_safe_filename(name) {
        return None;
    }
    let app_name = format!("{name}.app");

    // ① 标准装机目录：路径由白名单校验过的 name 拼出，不涉及用户输入
    let mut roots: Vec<PathBuf> = vec![PathBuf::from("/Applications")];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    for root in roots {
        let p = root.join(&app_name);
        if p.is_dir() {
            return Some(p);
        }
    }

    // ② 退回全盘索引。注意这里传 bundle_id，仍要先过字符白名单再拼进 mdfind 查询串
    if !bundle_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
    {
        return None;
    }
    let out = std::process::Command::new("mdfind")
        .arg(format!("kMDItemCFBundleIdentifier == '{bundle_id}'"))
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .map(str::trim)
        .filter(|l| l.ends_with(".app"))
        .map(PathBuf::from)
        .find(|p| p.is_dir() && !is_build_artifact(p))
}

/// 判断路径是否落在构建产物目录里。cargo 的 target/ 与前端 node_modules/ 下的
/// .app 都是构建副本，不是装机。
#[cfg(target_os = "macos")]
fn is_build_artifact(path: &Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s == "target" || s == "node_modules" || s == "dist"
    })
}

/// Windows 安装探测。候选路径按「命中率高、成本低」排序。
///
/// ⚠️ 推断，未在 Windows 实测：本机只有 macOS，CI 也不跑 Windows 产物。
/// 依据是 Tauri 2 NSIS/MSI 的默认安装布局 + 各兄弟仓 install.sh 的口径。
/// 真装机后应按 008_组织规范 的实测口径回填注释里的日期与复跑命令。
#[cfg(target_os = "windows")]
fn detect_windows(name: &str) -> Option<PathBuf> {
    if !is_safe_filename(name) {
        return None;
    }
    let exe_name = format!("{name}.exe");

    // ① Tauri NSIS 默认：%LOCALAPPDATA%\Programs\<productName>\<productName>.exe
    //   MSI 装到 Program Files，走 ②③ 兜。
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let p = Path::new(&local)
            .join("Programs")
            .join(name)
            .join(&exe_name);
        if p.exists() {
            return Some(p);
        }
    }

    // ②③ Program Files / Program Files (x86)：MSI 与手工放置的常见落点
    if let Ok(pf) = std::env::var("ProgramFiles") {
        let p = Path::new(&pf).join(name).join(&exe_name);
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        let p = Path::new(&pf86).join(name).join(&exe_name);
        if p.exists() {
            return Some(p);
        }
    }

    // ④ 卸载注册表 InstallLocation：NSIS/MSI 都写这里，能兜住自定义安装目录。
    //    reg.exe 是系统自带，无需新增 crate；输出是 reg query 默认的制表符分隔。
    if let Some(dir) = query_windows_install_location(name) {
        let p = dir.join(&exe_name);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// 查 Uninstall 注册表下该 productName 的 InstallLocation。
/// 只对两处 hive 各查一次 HKCU / HKLM，命中即返回目录。
#[cfg(target_os = "windows")]
fn query_windows_install_location(name: &str) -> Option<PathBuf> {
    use std::process::Command;
    // name 已过 is_safe_filename 白名单，但仍不把它拼进 reg 的键路径字符串以外的地方；
    // reg query 的键路径不含用户输入（只含固定前缀 + name），白名单已足够。
    for hive in ["HKCU", "HKLM"] {
        let key = format!(r"{hive}\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{name}");
        let Ok(out) = Command::new("reg").args(["query", &key, "/ve"]).output() else {
            continue;
        };
        if !out.status.success() {
            continue;
        }
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            let Some((_, rest)) = line.split_once("InstallLocation") else {
                continue;
            };
            // reg query 输出形如:
            //   InstallLocation<空白>REG_SZ<空白>C:\Program Files\z-biz-tool-note
            // 值里常有空格，所以用 splitn(3) 只切前两刀（类型名 + 分隔空白），
            // 第三段整体就是路径，不会被拆散。
            let mut parts = rest.trim_start().splitn(3, char::is_whitespace);
            let _type = parts.next(); // REG_SZ / REG_EXPAND_SZ
            let _gap = parts.next(); // 类型名与值之间的空白
            let value = parts.next().unwrap_or("").trim().trim_matches('"');
            if value.len() > 3 {
                return Some(PathBuf::from(value));
            }
        }
    }
    None
}

/// Linux: 找 `<dir>/applications/<name>.desktop`; ~/.local/ 优先于 /usr/。
#[cfg(target_os = "linux")]
fn detect_linux(name: &str) -> Option<PathBuf> {
    if !is_safe_filename(name) {
        return None;
    }
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(PathBuf::from(home).join(".local/share/applications"));
    }
    dirs.push(PathBuf::from("/usr/local/share/applications"));
    dirs.push(PathBuf::from("/usr/share/applications"));
    for dir in dirs.iter() {
        let candidate = dir.join(format!("{name}.desktop"));
        if candidate.exists() {
            return Some(candidate);
        }
    }
    // 也试一下 key: 有些发行版 desktop 文件名跟 exe 名不完全一致
    None
}

fn is_safe_filename(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

/// 启动已安装的兄弟应用
pub fn launch(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("路径不存在: {}", path.display()));
    }
    spawn(path).map_err(|e| format!("spawn 失败: {e}"))
}

#[cfg(target_os = "macos")]
fn spawn(path: &Path) -> std::io::Result<()> {
    use std::process::Command;
    Command::new("open").arg(path).spawn()?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn spawn(path: &Path) -> std::io::Result<()> {
    use std::process::Command;
    Command::new(path).spawn()?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn spawn(path: &Path) -> std::io::Result<()> {
    use std::process::Command;
    // .desktop 文件交给 xdg-open,由它读 Exec= 行并启动。
    // 直接解析 .desktop 内部 Exec 也行,但需要 ini parser;xdg-open 已覆盖 99% 场景
    Command::new("xdg-open").arg(path).spawn()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PLIST: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.zifang.z-biz-tool-note</string>
  <key>CFBundleShortVersionString</key><string>0.2.1</string>
</dict></plist>"#;

    #[test]
    fn plist_reads_version() {
        assert_eq!(
            plist_string_value(PLIST, "CFBundleShortVersionString").as_deref(),
            Some("0.2.1")
        );
        assert_eq!(
            plist_string_value(PLIST, "CFBundleIdentifier").as_deref(),
            Some("com.zifang.z-biz-tool-note")
        );
        assert_eq!(plist_string_value(PLIST, "CFBundleVersion"), None);
    }

    /// 版本号是更新检测的比对基准,读错会让面板一直报「可更新」或永远不报。
    #[test]
    fn installed_version_from_real_app() {
        let app = Path::new("/Applications/z-biz-tool-note.app");
        if !app.is_dir() {
            return; // 本机没装就跳过,不编造断言
        }
        assert_eq!(read_bundle_version(app).as_deref(), Some("0.2.1"));
        assert_eq!(
            read_bundle_id(app).as_deref(),
            Some("com.zifang.z-biz-tool-note")
        );
    }
}
