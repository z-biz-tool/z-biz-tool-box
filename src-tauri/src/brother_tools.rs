//! 兄弟应用清单 + 安装检测/启动
//!
//! 数据来源: build.rs codegen 出来的 `GENERATED_BROTHERS`(从
//! `../../z-biz-tool-lead/003_辅助能力/bootstrap/manifest.json` 读)。
//! 检测/启动按平台分支: macOS mdfind / Windows %LOCALAPPDATA%\Programs / Linux .desktop。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// 运行时兄弟应用条目: codegen 出的种子 + 检测后填 installed_path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrotherEntry {
    pub key: String,         // "worker"  — tray id & GitHub repo 短名
    pub name: String,        // "z-biz-tool-worker"
    pub bundle_id: String,   // "com.zifang.z-biz-tool-worker"
    pub display_name: String,// "AI 任务看板"
    pub installed_path: Option<PathBuf>,
}

/// 由 build.rs 注入。BrotherSeed struct 与 const GENERATED_BROTHERS 都来自
/// 生成文件,这里只转发 — 不能在本文件再定义同名 struct,会触发 "defined multiple times"。
mod generated {
    include!(concat!(env!("OUT_DIR"), "/generated_brothers.rs"));
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
        }
    }
}

pub fn all_brothers_with_state() -> Vec<BrotherEntry> {
    let mut out: Vec<BrotherEntry> = generated::GENERATED_BROTHERS
        .iter()
        .map(|s| BrotherEntry::from_seed(s))
        .collect();
    for b in out.iter_mut() {
        b.installed_path = detect_one(&b.bundle_id, &b.name);
    }
    out
}

/// bundle_id 给 macOS 查 Spotlight;name 给 Win/Linux 拼路径。
/// 其它平台 `_name` 不读,下划线压 unused 警告。
fn detect_one(bundle_id: &str, _name: &str) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    { return detect_macos(bundle_id); }
    #[cfg(target_os = "windows")]
    { let _ = bundle_id; return detect_windows(_name); }
    #[cfg(target_os = "linux")]
    { let _ = bundle_id; return detect_linux(_name); }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    { let _ = (bundle_id, _name); None }
}

/// macOS: `mdfind` 查 Spotlight 索引,拿 CFBundleIdentifier 匹配的 .app 路径。
/// mdfind 不可用/索引未建时返回 None，不报错（用户可能没开 Spotlight），
/// 这时菜单里该兄弟会全部进"未安装"，可以接受 — 功能降级而非崩溃。
#[cfg(target_os = "macos")]
fn detect_macos(bundle_id: &str) -> Option<PathBuf> {
    use std::process::Command;
    // mdfind 使用 Spotlight 索引, 比 ls /Applications + 解析 Info.plist 快得多。
    // ⚠️ bundle_id 来自代码生成,不来自用户输入,但仍然做一次字符白名单:
    //   - Apple bundle_id 限定 [a-zA-Z0-9.-]
    //   - 我们 shell 拼接字面量, 这里转义单引号防御
    if !bundle_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return None;
    }
    let query = format!("kMDItemCFBundleIdentifier == '{bundle_id}'");
    let out = Command::new("mdfind").arg(&query).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout);
    let first = s
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && l.ends_with(".app"))?;
    let p = PathBuf::from(first);
    if p.exists() { Some(p) } else { None }
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
        let p = Path::new(&local).join("Programs").join(name).join(&exe_name);
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
        let key = format!(
            r"{hive}\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{name}"
        );
        let Ok(out) = Command::new("reg")
            .args(["query", &key, "/ve"])
            .output()
        else {
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
            let _gap = parts.next();  // 类型名与值之间的空白
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
