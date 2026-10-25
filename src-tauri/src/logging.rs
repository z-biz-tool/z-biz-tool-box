//! 运行期日志落盘 + panic hook(台账 T4.6 / T4.7)。
//!
//! ## 为什么要有
//!
//! Tauri 应用是"菜单栏常驻 + 窗口按需弹出"的形态: 用户遇到问题时,
//! 窗口早就关了, 控制台输出早就滚走了, **没有任何可看的东西**。
//! 没有日志就只能靠猜。
//!
//! 两处写入:
//!  - `install_panic_hook` — Rust 侧 panic(台账 T4.7)
//!  - `write_log` command — 前端 window.onerror / unhandledrejection(台账 T4.6)
//!
//! ## 落盘位置
//!
//! `~/.z-biz-tools/logs/z-biz-YYYY-MM-DD.log` — 按天分文件, 一天一个文件。
//! 与插件目录同级(`~/.z-biz-tools/`), 用户找得到。
//!
//! ## 写日志失败怎么办
//!
//! **静默**。写日志失败(磁盘满 / 权限不对 / 目录建不出来)绝不能把应用带崩 ——
//! 一个"记录故障"的机制自己引发故障, 比没有还糟。所以所有 IO 错误都吞掉,
//! 只在 stderr 上留一行。
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{Manager, Runtime};

/// 一次调用最多写多少行日志(防止插件疯狂报错把磁盘写满)
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

/// 日志目录: ~/.z-biz-tools/logs
pub fn log_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join(".z-biz-tools").join("logs"))
}

/// unix 秒 → 公历 (年, 月, 日)。
///
/// 用的是 Howard Hinnant 的 civil_from_days 算法(纯整数, 无依赖)。
/// 单独抽出来是因为**它可以被直接断言**: 日期算错会让日志文件名错一天,
/// 而这种错在肉眼扫目录时根本看不出来。
pub fn civil_from_epoch(secs: i64) -> (i64, u32, u32) {
    let days = secs.div_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// 当前时刻对应的日志文件名
pub fn log_file_name(now_epoch_secs: i64) -> String {
    let (y, m, d) = civil_from_epoch(now_epoch_secs);
    format!("z-biz-{y:04}-{m:02}-{d:02}.log")
}

/// 当前 unix 秒
fn now_epoch_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 往日志文件追加一行。返回是否写成功。
///
/// 失败一律**不抛**: 调用方不该因为写日志失败而出错。
pub fn append_log(dir: &Path, file_name: &str, line: &str) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        eprintln!("[z-biz] 日志目录创建失败: {}", dir.display());
        return false;
    }
    let path = dir.join(file_name);
    // 单文件上限: 超了就不再写(避免磁盘被写爆)。不截断, 只是停止追加。
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > MAX_LOG_BYTES {
            return false;
        }
    }
    let mut f = match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        Ok(f) => f,
        Err(e) => {
            eprintln!("[z-biz] 日志文件打开失败: {e}");
            return false;
        }
    };
    match writeln!(f, "{line}") {
        Ok(_) => true,
        Err(e) => {
            eprintln!("[z-biz] 日志写入失败: {e}");
            false
        }
    }
}

/// 装 panic hook: panic 时把现场写进日志文件。
///
/// ⚠️ hook 里**绝不能 panic**, 也不能做可能失败的事 —— panic hook 本身
/// 出问题会导致进程 abort, 连原始错误信息都看不到。所以这里全程忽略错误。
pub fn install_panic_hook() {
    static ONCE: OnceLock<()> = OnceLock::new();
    ONCE.get_or_init(|| {
        let prev = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            let now = now_epoch_secs();
            let file_name = log_file_name(now);
            let loc = info
                .location()
                .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
                .unwrap_or_else(|| "(unknown)".to_string());
            let msg = info
                .payload()
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| info.payload().downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "(non-string payload)".to_string());
            let line = format!("[panic] {now} {loc} {msg}");
            if let Some(dir) = log_dir() {
                let _ = append_log(&dir, &file_name, &line);
            }
            // 仍然交给上一个 hook(默认那个会把 panic 打到 stderr)
            prev(info);
        }));
    });
}

/// 往日志写一条(供 command 与 panic hook 共用)
pub fn write_line(level: &str, message: &str) -> bool {
    let now = now_epoch_secs();
    let file_name = log_file_name(now);
    let line = format!("[{level}] {now} {message}");
    match log_dir() {
        Some(dir) => append_log(&dir, &file_name, &line),
        None => false,
    }
}

/// 前端报错写日志的 command(台账 T4.6)。
///
/// 前端 window.onerror / unhandledrejection 经 invoke 调它。
/// 写失败**不返回错误**: 前端正在报错处理中, 再给它一个错误只会雪上加霜。
#[tauri::command]
pub fn write_log(app: tauri::AppHandle, level: String, message: String) {
    let lvl = if level.is_empty() { "error" } else { &level };
    let _ = write_line(lvl, &message);
    // 让窗口在后台时也不至于完全静默: 至少在 stderr 留一行
    eprintln!("[z-biz][{lvl}] {message}");
    let _ = &app;
}

/// 打开日志目录(系统文件管理器),返回目录路径供 UI 展示
///
/// **2026-10-25**：原来这里只有 `log_dir_path`(只返回路径)⇒ 前端**一次都没调过**
/// ⇒ 用户看得见「前端在写日志」却找不到日志在哪。现在打开目录并把路径一并返回。
///
/// 用的是本仓**已经装好的** `tauri-plugin-opener`（不自己 spawn 系统命令 ⇒ 跨平台一致）。
#[tauri::command]
pub fn open_log_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("home_dir 失败: {e}"))?;
    let dir = home.join(".z-biz-tools").join("logs");
    // 还没写过日志时目录可能不存在 ⇒ 先建出来,免得点了没反应
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.to_string_lossy().to_string();
    app.opener()
        .open_path(path.clone(), None::<&str>)
        .map_err(|e| format!("打开日志目录失败: {e}"))?;
    Ok(path)
}

/// 泛型包装: 让 `write_log` 在测试里也能被 `R: Runtime` 调用
#[allow(dead_code)]
fn _assert_runtime_bounds<R: Runtime>(_app: &tauri::AppHandle<R>) {}

#[cfg(test)]
mod tests {
    use super::*;

    /// 日期换算必须准确 —— 算错会让日志文件名落到隔壁那天,
    /// 而这种错肉眼看目录根本发现不了。
    ///
    /// 下面的 epoch 常数是**用 `date -u -j -f ...` 之类工具实算出来的**,
    /// 不是手推的 —— 第一版就是手推, 三个断言全红(把 2026-10-19 写成了
    /// 2026-10-05 那天的秒数)。常数错了不是实现错, 改常数。
    #[test]
    fn civil_from_epoch_对已知日期正确() {
        // 1970-01-01T00:00:00Z
        assert_eq!(civil_from_epoch(0), (1970, 1, 1));
        // 2000-01-01T00:00:00Z
        assert_eq!(civil_from_epoch(946_684_800), (2000, 1, 1));
        // 2026-10-19T00:00:00Z
        assert_eq!(civil_from_epoch(1_792_368_000), (2026, 10, 19));
    }

    #[test]
    fn civil_from_epoch_闰日与年末正确() {
        // 2024-02-29T00:00:00Z(闰年)
        assert_eq!(civil_from_epoch(1_709_164_800), (2024, 2, 29));
        // 2023-03-01T00:00:00Z(平年 2/28 之后)
        assert_eq!(civil_from_epoch(1_677_628_800), (2023, 3, 1));
        // 2020-12-31T23:59:59Z
        assert_eq!(civil_from_epoch(1_609_459_199), (2020, 12, 31));
    }

    #[test]
    fn civil_from_epoch_负时间戳不被截断() {
        // 1969-12-31T23:59:59Z —— div_euclid 语义(向零截断会算成 1970-01-01)
        assert_eq!(civil_from_epoch(-1), (1969, 12, 31));
    }

    #[test]
    fn 日志文件名格式固定() {
        assert_eq!(log_file_name(1_792_368_000), "z-biz-2026-10-19.log");
        assert_eq!(log_file_name(0), "z-biz-1970-01-01.log");
    }

    #[test]
    fn 写日志_目录不存在时自动建目录_且内容可读回() {
        let dir = std::env::temp_dir().join(format!("z-biz-log-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert!(!dir.exists());
        assert!(append_log(&dir, "t.log", "hello"));
        let content = std::fs::read_to_string(dir.join("t.log")).unwrap();
        assert!(
            content.contains("hello"),
            "写进去的内容要能读回来: {content}"
        );
        // 追加而不是覆盖
        assert!(append_log(&dir, "t.log", "world"));
        let content2 = std::fs::read_to_string(dir.join("t.log")).unwrap();
        assert!(content2.contains("hello") && content2.contains("world"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 写日志到非法路径时返回失败而不抛错() {
        // 关键性质: 写日志失败**不能**把调用方带崩。
        let bad = std::env::temp_dir().join("z-biz-log-test-file");
        std::fs::write(&bad, b"not a dir").unwrap();
        let result = append_log(&bad, "t.log", "x");
        assert!(!result, "写到非法路径应当返回 false");
        let _ = std::fs::remove_file(&bad);
    }
}
