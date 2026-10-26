//! 兄弟应用安装器:查 GitHub release → 选 arm64 资产 → 下载 → 校验 → 装到 /Applications
//!
//! 资产选择不按版本号拼 URL —— 实测 tag 与资产名里的版本并不总一致
//! (worker tag v0.2.1 / 资产名 0.2.0,cpu tag v0.1.2 / 资产名 0.1.1),
//! 所以只按 `_aarch64` 后缀匹配,匹配不到就如实报「无可用安装包」。
//!
//! 安装包形态优先 .app.tar.gz(Tauri updater 产物,解包即 .app,不用挂载 dmg),
//! 没有再退回 dmg。

use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const API: &str = "https://api.github.com";
/// 匿名 api.github.com 是 60 次/小时/IP。面板每次打开打 12 个仓,
/// 不缓存的话反复开关几次就把额度耗光、后面全部报限流。
const CACHE_TTL: Duration = Duration::from_secs(600);
/// 手动刷新时传 true,跳过缓存。
const UA: &str = concat!("z-biz-tool-box/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReleaseState {
    Ok,
    /// 有 release 但全是草稿(未发布)—— 资产拿不到
    NoPublishedRelease,
    /// release 已发布但没有 macOS arm64 资产
    NoAsset,
    /// 匿名额度用尽
    RateLimited,
    /// 网络/解析失败
    #[default]
    Unreachable,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrotherRelease {
    pub state: ReleaseState,
    pub tag: Option<String>,
    pub version: Option<String>,
    pub asset_name: Option<String>,
    /// 资产下载直链。取 API 的 browser_download_url,不自己拼 ——
    /// 下载域名是 github.com 而非 api.github.com,拼出来的必 404。
    pub asset_url: Option<String>,
    pub asset_kind: Option<String>,
    pub asset_size: Option<u64>,
    pub note: Option<String>,
}

/// 面板一张卡片 = 清单条目 + 本机状态 + 远端最新 release
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrotherCard {
    pub key: String,
    pub name: String,
    pub display_name: String,
    pub bundle_id: String,
    pub installed: bool,
    pub installed_path: Option<String>,
    pub installed_version: Option<String>,
    pub has_update: bool,
    pub icon_png: Option<String>,
    pub release: BrotherRelease,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallProgress {
    key: String,
    phase: String,
    received: Option<u64>,
    total: Option<u64>,
    message: Option<String>,
}

// ---------------------------------------------------------------- release 查询

struct Cache(Mutex<HashMap<String, (Instant, BrotherRelease)>>);

fn cache() -> &'static Cache {
    static C: OnceLock<Cache> = OnceLock::new();
    C.get_or_init(|| Cache(Mutex::new(HashMap::new())))
}

fn client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .user_agent(UA)
        .timeout(Duration::from_secs(20))
        .build()
        .expect("构建 HTTP client 失败")
}

fn unreachable_state(note: &str) -> BrotherRelease {
    BrotherRelease {
        state: ReleaseState::Unreachable,
        note: Some(note.to_string()),
        ..Default::default()
    }
}

/// 查某仓最新已发布 release,带 10 分钟缓存。force=true 时忽略缓存。
pub fn latest_release(repo: &str, force: bool) -> BrotherRelease {
    if !force {
        if let Ok(guard) = cache().0.lock() {
            if let Some((at, r)) = guard.get(repo) {
                if at.elapsed() < CACHE_TTL {
                    return r.clone();
                }
            }
        }
    }
    let r = fetch_latest(repo);
    if let Ok(mut guard) = cache().0.lock() {
        guard.insert(repo.to_string(), (Instant::now(), r.clone()));
    }
    r
}

fn fetch_latest(repo: &str) -> BrotherRelease {
    // repo 来自编译期 codegen 的 manifest,不是用户输入;仍过白名单再拼 URL
    if !repo
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
    {
        return unreachable_state("仓库名非法");
    }
    let url = format!("{API}/repos/z-biz-tool/{repo}/releases/latest");
    let resp = match client().get(&url).send() {
        Ok(r) => r,
        Err(e) => return unreachable_state(&format!("请求失败: {e}")),
    };
    let status = resp.status();
    if status.as_u16() == 403 || status.as_u16() == 429 {
        return BrotherRelease {
            state: ReleaseState::RateLimited,
            note: Some("GitHub 匿名额度用尽,过一会儿再刷新".into()),
            ..Default::default()
        };
    }
    if status.as_u16() == 404 {
        return no_published_release(repo);
    }
    if !status.is_success() {
        return unreachable_state(&format!("GitHub 返回 {}", status.as_u16()));
    }
    let v: serde_json::Value = match resp.json() {
        Ok(v) => v,
        Err(e) => return unreachable_state(&format!("解析响应失败: {e}")),
    };

    let tag = v
        .get("tag_name")
        .and_then(|x| x.as_str())
        .map(str::to_string);
    let version = tag.as_deref().map(strip_v);
    let empty = Vec::new();
    let assets = v.get("assets").and_then(|x| x.as_array()).unwrap_or(&empty);

    // 优先 .app.tar.gz:解包即 .app,少一步 hdiutil 挂载
    let picked = assets
        .iter()
        .find(|a| asset_name(a).is_some_and(|n| n.ends_with("_aarch64.app.tar.gz")))
        .or_else(|| {
            assets
                .iter()
                .find(|a| asset_name(a).is_some_and(|n| n.ends_with("_aarch64.dmg")))
        });

    match picked {
        None => BrotherRelease {
            state: ReleaseState::NoAsset,
            tag,
            version,
            note: Some("该 release 没有 macOS arm64 安装包".into()),
            ..Default::default()
        },
        Some(a) => {
            let n = asset_name(a).unwrap_or_default();
            let kind = if n.ends_with(".dmg") {
                "dmg"
            } else {
                "appTarGz"
            };
            BrotherRelease {
                state: ReleaseState::Ok,
                tag,
                version,
                asset_name: Some(n.to_string()),
                asset_url: a
                    .get("browser_download_url")
                    .and_then(|x| x.as_str())
                    .map(str::to_string),
                asset_kind: Some(kind.to_string()),
                asset_size: a.get("size").and_then(|x| x.as_u64()),
                note: None,
            }
        }
    }
}

/// latest 404 有两种含义:完全没有 release,或者有但全是 draft。
/// 再打一次 /releases 列表区分开 —— 前者提示「暂无安装包」,
/// 后者提示「有包但未发布」,是两种要做的运营动作。
fn no_published_release(repo: &str) -> BrotherRelease {
    let url = format!("{API}/repos/z-biz-tool/{repo}/releases?per_page=5");
    let drafts: Vec<String> = match client().get(&url).send() {
        Ok(r) if r.status().is_success() => r
            .json::<serde_json::Value>()
            .ok()
            .and_then(|v| v.as_array().cloned())
            .map(|arr| {
                arr.iter()
                    .filter(|x| x.get("draft").and_then(|d| d.as_bool()) == Some(true))
                    .filter_map(|x| {
                        x.get("tag_name")
                            .and_then(|t| t.as_str())
                            .map(str::to_string)
                    })
                    .collect()
            })
            .unwrap_or_default(),
        _ => Vec::new(),
    };
    if !drafts.is_empty() {
        BrotherRelease {
            state: ReleaseState::NoPublishedRelease,
            tag: Some(drafts[0].clone()),
            version: Some(strip_v(&drafts[0])),
            note: Some(format!(
                "已有 {} 的草稿 release,尚未发布 —— 面板拿不到安装包",
                drafts.join(" / ")
            )),
            ..Default::default()
        }
    } else {
        BrotherRelease {
            state: ReleaseState::NoAsset,
            note: Some("该仓还没有任何 release".into()),
            ..Default::default()
        }
    }
}

fn asset_name(a: &serde_json::Value) -> Option<&str> {
    a.get("name").and_then(|x| x.as_str())
}

fn strip_v(tag: &str) -> String {
    tag.strip_prefix('v').unwrap_or(tag).to_string()
}

// ---------------------------------------------------------------- 版本比较

/// 三段数字比较。缺失段与非数字段一律当 0 —— 方向是安全的:
/// 读不懂就不报「可更新」,总比对着预发布号误报或漏报强。
fn version_gt(a: &str, b: &str) -> bool {
    let pa: Vec<&str> = a.split('.').collect();
    let pb: Vec<&str> = b.split('.').collect();
    for i in 0..pa.len().max(pb.len()) {
        let x = pa.get(i).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
        let y = pb.get(i).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

// ---------------------------------------------------------------- 命令

#[tauri::command]
pub fn brother_overview(force: Option<bool>) -> Result<Vec<BrotherCard>, String> {
    let brothers = crate::brother_tools::all_brothers_with_state();
    let force = force.unwrap_or(false);

    // 一仓一线程,12 个仓并发打 GitHub;串行会等 12 × RTT
    let cards: Vec<BrotherCard> = std::thread::scope(|s| {
        let handles: Vec<_> = brothers
            .iter()
            .map(|b| {
                let name = b.name.clone();
                s.spawn(move || latest_release(&name, force))
            })
            .collect();
        brothers
            .iter()
            .zip(handles)
            .map(|(b, h)| {
                let release = h
                    .join()
                    .unwrap_or_else(|_| unreachable_state("查询线程崩溃"));
                let installed = b.installed_path.is_some();
                let has_update = match (&b.installed_version, &release.version) {
                    (Some(iv), Some(rv)) => version_gt(rv, iv),
                    _ => false,
                };
                BrotherCard {
                    key: b.key.clone(),
                    name: b.name.clone(),
                    display_name: b.display_name.clone(),
                    bundle_id: b.bundle_id.clone(),
                    installed,
                    installed_path: b.installed_path.as_ref().map(|p| p.display().to_string()),
                    installed_version: b.installed_version.clone(),
                    has_update,
                    icon_png: crate::brother_tools::icon_png(&b.key).map(base64_encode),
                    release,
                }
            })
            .collect()
    });
    Ok(cards)
}

/// 面板上「安装/更新」按钮的落点。阻塞动作丢到后台线程,免得冻住窗口。
#[tauri::command]
pub fn install_brother(app: AppHandle, key: String) -> Result<(), String> {
    let seed = crate::brother_tools::all_brothers_with_state()
        .into_iter()
        .find(|b| b.key == key)
        .ok_or_else(|| format!("未知兄弟应用: {key}"))?;

    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = install_inner(&app, &seed) {
            emit_progress(&app, &seed.key, "error", None, None, Some(e.clone()));
            eprintln!("[z-biz] install {} 失败: {e}", seed.key);
        }
    });
    Ok(())
}

/// 「启动」按钮要带上的上下文。缺省启动不传（`target` 为 null），
/// 传了就会构造一条 `zbiz://<key>/<action>?file=…&from=box` 递过去。
#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchTarget {
    /// 缺省 `open`
    pub action: Option<String>,
    /// 交接的主体文件。存在性在这里先校验一次：不校验的话目标应用收到一条
    /// 指向不存在文件的深链，只能静默失败，用户无从知道是路径错了还是那应用不支持。
    pub file: Option<String>,
    /// 其余透传参数（如 `line`、`mode`），不做白名单——协议本身已校验字符集。
    #[serde(default)]
    pub params: std::collections::BTreeMap<String, String>,
}

#[tauri::command]
pub fn launch_brother(key: String, target: Option<LaunchTarget>) -> Result<(), String> {
    let b = crate::brother_tools::all_brothers_with_state()
        .into_iter()
        .find(|b| b.key == key)
        .ok_or_else(|| format!("未知兄弟应用: {key}"))?;
    let path = b
        .installed_path
        .ok_or_else(|| format!("{} 未安装", b.display_name))?;

    // 裸启动保持原样：走 `open <app>`，会激活已在跑的实例，不额外起进程。
    let Some(target) = target else {
        return crate::brother_tools::launch(&path);
    };

    let mut params = target.params;
    if let Some(file) = target.file {
        if !std::path::Path::new(&file).exists() {
            return Err(format!("文件不存在: {file}"));
        }
        params.insert("file".to_string(), file);
    }
    // from 由发送方强制填写，不接受调用方伪造——否则目标应用无法区分是 box 召唤
    // 还是别的产品转手过来的，回传结果时就会找错人。
    params.insert("from".to_string(), "box".to_string());

    let action = target.action.as_deref().unwrap_or("open");
    let uri = crate::handoff::build(&b.key, action, &params)?;
    crate::brother_tools::launch_uri(&path, &uri)
}

fn emit_progress(
    app: &AppHandle,
    key: &str,
    phase: &str,
    received: Option<u64>,
    total: Option<u64>,
    message: Option<String>,
) {
    let _ = app.emit(
        "brother-install-progress",
        InstallProgress {
            key: key.to_string(),
            phase: phase.to_string(),
            received,
            total,
            message,
        },
    );
}

// ---------------------------------------------------------------- 安装流程

/// 安装进度回调: (phase, 已下载字节, 总字节)
type Progress<'a> = &'a mut dyn FnMut(&str, Option<u64>, Option<u64>);

fn install_inner(app: &AppHandle, seed: &crate::brother_tools::BrotherEntry) -> Result<(), String> {
    let cache_dir = app
        .path()
        .cache_dir()
        .map_err(|e| format!("取缓存目录失败: {e}"))?
        .join("brother-install");
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("建缓存目录失败: {e}"))?;
    let key = seed.key.clone();
    install_core(seed, &cache_dir, &mut |phase, received, total| {
        emit_progress(app, &key, phase, received, total, None)
    })
}

/// 下载 → 解包 → 校验 → 落盘。
/// 拆成不依赖 AppHandle 的形式,是为了能不经窗口直接跑完整链路
/// (见 tests 里 #[ignore] 的实装测试)。
pub fn install_core(
    seed: &crate::brother_tools::BrotherEntry,
    cache_dir: &Path,
    progress: Progress,
) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("自动安装目前只实现了 macOS 路径".into());
    }
    let release = latest_release(&seed.name, true);
    if !matches!(release.state, ReleaseState::Ok) {
        return Err(release
            .note
            .unwrap_or_else(|| "该仓当前没有可安装的 release".into()));
    }
    let asset_name = release.asset_name.clone().unwrap();
    let asset_kind = release.asset_kind.clone().unwrap_or_default();
    let download_url = release
        .asset_url
        .clone()
        .ok_or_else(|| "release 里没给出资产下载链接".to_string())?;

    std::fs::create_dir_all(cache_dir).map_err(|e| format!("建缓存目录失败: {e}"))?;
    let archive = cache_dir.join(&asset_name);

    progress("download", Some(0), release.asset_size);
    download(&download_url, &archive, release.asset_size, progress)?;

    progress("verify", None, None);
    let staging = cache_dir.join(format!("staging-{}", seed.key));
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|e| format!("建暂存目录失败: {e}"))?;

    let extracted = if asset_kind == "dmg" {
        extract_from_dmg(&archive, &staging)?
    } else {
        extract_from_targz(&archive, &staging)?
    };

    // 身份绑定:包里的 CFBundleIdentifier 必须等于清单里那个。
    // 这里刻意不做 codesign 校验 —— 2026-10-16 实测:家族 12 个仓的 CI 产物全是
    // ad-hoc linker-signed(TeamIdentifier 未设、Sealed Resources 为空),
    // `codesign --verify` 连最宽松形式都退出 1,连用户天天在用的已装机
    // /Applications/z-biz-tool-note.app 都一样。当硬门槛等于 100% 装不上。
    // 真正能挡损坏/替换的是:字节数 == GitHub asset size(见 download),加这道 bundle_id 比对。
    let got_id = crate::brother_tools::read_bundle_id(&extracted)
        .ok_or_else(|| "安装包读不到 CFBundleIdentifier".to_string())?;
    if got_id != seed.bundle_id {
        return Err(format!(
            "安装包身份不符: 期望 {}, 实际 {}",
            seed.bundle_id, got_id
        ));
    }

    progress("install", None, None);
    let dest_root = install_root()?;
    install_app(&extracted, &dest_root.join(format!("{}.app", seed.name)))?;

    let _ = std::fs::remove_dir_all(&staging);
    let _ = std::fs::remove_file(&archive);
    eprintln!(
        "[z-biz] 已安装 {} → {}/{}.app",
        seed.name,
        dest_root.display(),
        seed.name
    );
    progress("done", None, None);
    Ok(())
}

/// 逐块下载并推进度。reqwest blocking 的 chunk 读法,不用整包进内存。
fn download(
    url: &str,
    dest: &Path,
    expected: Option<u64>,
    progress: Progress,
) -> Result<(), String> {
    let mut resp = client()
        .get(url)
        .send()
        .map_err(|e| format!("下载请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载返回 {}", resp.status()));
    }
    let total = expected.or_else(|| resp.content_length());
    let mut file = std::fs::File::create(dest).map_err(|e| format!("建临时文件失败: {e}"))?;
    let mut buf = vec![0u8; 256 * 1024];
    let mut received = 0u64;
    let mut last_emit = Instant::now();
    loop {
        let n = resp
            .read(&mut buf)
            .map_err(|e| format!("读取下载流失败: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("写盘失败: {e}"))?;
        received += n as u64;
        if last_emit.elapsed() > Duration::from_millis(150) {
            progress("download", Some(received), total);
            last_emit = Instant::now();
        }
    }
    file.flush().map_err(|e| format!("落盘失败: {e}"))?;
    if let Some(t) = total {
        if received != t {
            return Err(format!("下载不完整: {received}/{t} 字节"));
        }
    }
    Ok(())
}

/// Tauri 的 updater 产物:tar.gz 里就是 <Product>.app
fn extract_from_targz(archive: &Path, staging: &Path) -> Result<PathBuf, String> {
    let out = std::process::Command::new("tar")
        .arg("-xzf")
        .arg(archive)
        .arg("-C")
        .arg(staging)
        .output()
        .map_err(|e| format!("调用 tar 失败: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "解包失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    find_app(staging)
}

fn extract_from_dmg(dmg: &Path, staging: &Path) -> Result<PathBuf, String> {
    let mount = staging.join("mnt");
    std::fs::create_dir_all(&mount).map_err(|e| format!("建挂载点失败: {e}"))?;
    let out = std::process::Command::new("hdiutil")
        .args(["attach", "-nobrowse", "-readonly", "-quiet"])
        .arg(dmg)
        .arg("-mountpoint")
        .arg(&mount)
        .output()
        .map_err(|e| format!("调用 hdiutil 失败: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "挂载 dmg 失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let found = find_app(&mount);
    let _ = std::process::Command::new("hdiutil")
        .args(["detach", "-quiet", "-force"])
        .arg(&mount)
        .output();
    found
}

fn find_app(dir: &Path) -> Result<PathBuf, String> {
    let rd = std::fs::read_dir(dir).map_err(|e| format!("读暂存目录失败: {e}"))?;
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().and_then(|s| s.to_str()) == Some("app") && p.is_dir() {
            return Ok(p);
        }
    }
    Err("安装包里没找到 .app".into())
}

/// 装机根目录。/Applications 不可写时退到 ~/Applications,而不是直接失败。
fn install_root() -> Result<PathBuf, String> {
    let apps = PathBuf::from("/Applications");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(md) = std::fs::metadata(&apps) {
            if md.permissions().mode() & 0o222 != 0 {
                return Ok(apps);
            }
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        let user_apps = PathBuf::from(home).join("Applications");
        std::fs::create_dir_all(&user_apps).ok();
        return Ok(user_apps);
    }
    Err("找不到可写的安装目录".into())
}

/// 覆盖式安装:先备份旧的,新app落位成功才删备份;失败回滚。
/// 用 ditto 而不是 cp —— cp 会丢 xattr,把 code signature 搞坏。
fn install_app(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("建安装目录失败: {e}"))?;
    }
    let backup = dest.with_extension(format!("app.backup-{}", unix_ts()));
    let had_old = dest.exists();
    if had_old {
        std::fs::rename(dest, &backup).map_err(|e| format!("备份旧版本失败: {e}"))?;
    }
    let copied = std::process::Command::new("ditto")
        .arg(src)
        .arg(dest)
        .output()
        .map_err(|e| format!("调用 ditto 失败: {e}"));
    match copied {
        Ok(o) if o.status.success() => {
            if had_old {
                let _ = std::fs::remove_dir_all(&backup);
            }
            Ok(())
        }
        Ok(o) => {
            let _ = std::fs::remove_dir_all(dest);
            if had_old {
                let _ = std::fs::rename(&backup, dest);
            }
            Err(format!(
                "拷贝失败,已回滚: {}",
                String::from_utf8_lossy(&o.stderr).trim()
            ))
        }
        Err(e) => {
            if had_old {
                let _ = std::fs::rename(&backup, dest);
            }
            Err(format!("拷贝失败,已回滚: {e}"))
        }
    }
}

fn unix_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            B64[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            B64[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_cmp_numeric() {
        assert!(version_gt("0.2.1", "0.2.0"));
        assert!(version_gt("1.0.0", "0.9.9"));
        assert!(version_gt("0.10.0", "0.9.0"));
        assert!(!version_gt("0.2.1", "0.2.1"));
        assert!(!version_gt("0.2.0", "0.2.1"));
        // 缺段按 0 补:0.3 vs 0.3.0 应判为相等
        assert!(!version_gt("0.3", "0.3.0"));
    }

    #[test]
    fn version_cmp_nonnumeric() {
        assert!(!version_gt("0.2.1-beta", "0.2.0"));
    }

    #[test]
    fn strip_v_prefix() {
        assert_eq!(strip_v("v0.2.1"), "0.2.1");
        assert_eq!(strip_v("0.2.1"), "0.2.1");
    }

    /// 资产选择只认 `_aarch64` 后缀 —— tag 与资产名版本不一致是实测事实
    /// (worker tag v0.2.1 / 资产名 0.2.0),按版本拼 URL 会 404。
    #[test]
    fn asset_pick_prefers_targz_arm64_only() {
        let assets = serde_json::json!([
            {"name": "z-biz-tool-worker_0.2.0_aarch64.dmg", "size": 1},
            {"name": "z-biz-tool-worker_0.2.0_x64.dmg", "size": 2},
            {"name": "z-biz-tool-worker_aarch64.app.tar.gz", "size": 3},
        ]);
        let arr = assets.as_array().unwrap();
        let picked = arr
            .iter()
            .find(|a| asset_name(a).is_some_and(|n| n.ends_with("_aarch64.app.tar.gz")))
            .or_else(|| {
                arr.iter()
                    .find(|a| asset_name(a).is_some_and(|n| n.ends_with("_aarch64.dmg")))
            })
            .unwrap();
        assert_eq!(
            asset_name(picked).unwrap(),
            "z-biz-tool-worker_aarch64.app.tar.gz"
        );

        let x64_only = serde_json::json!([{"name": "x_0.1.0_x64.dmg", "size": 1}]);
        let arr = x64_only.as_array().unwrap();
        assert!(arr
            .iter()
            .find(|a| asset_name(a).is_some_and(|n| n.ends_with("_aarch64.app.tar.gz")))
            .is_none());
    }

    #[test]
    fn base64_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"a"), "YQ==");
        assert_eq!(base64_encode(b"ab"), "YWI=");
        assert_eq!(base64_encode(b"abc"), "YWJj");
    }

    /// 端到端实装:真下载 → 解包 → 校验 → 落 /Applications。
    /// 会写系统目录,所以 #[ignore];跑法:
    ///   cargo test --lib -- --ignored live_install
    #[test]
    #[ignore = "会往 /Applications 装真 app"]
    fn live_install_math() {
        use crate::brother_tools::{read_bundle_id, read_bundle_version, BrotherEntry};
        let seed = BrotherEntry {
            key: "math".into(),
            name: "z-biz-tool-math".into(),
            bundle_id: "com.zifang.z-biz-tool-math".into(),
            display_name: "GeoLab 数学实验室".into(),
            installed_path: None,
            installed_version: None,
        };
        let cache = std::env::temp_dir().join("zbt-live-install");
        let mut phases: Vec<String> = Vec::new();
        install_core(&seed, &cache, &mut |p, _, _| phases.push(p.to_string()))
            .expect("install_core 失败");

        let dest = PathBuf::from("/Applications/z-biz-tool-math.app");
        assert!(dest.is_dir(), "没装到 /Applications");
        assert_eq!(
            read_bundle_id(&dest).as_deref(),
            Some("com.zifang.z-biz-tool-math")
        );
        assert!(read_bundle_version(&dest).is_some(), "读不到版本号");
        assert_eq!(phases.last().map(String::as_str), Some("done"));
        let _ = std::fs::remove_dir_all(&cache);
    }
}
