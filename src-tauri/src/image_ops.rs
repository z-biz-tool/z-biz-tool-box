//! 图片能力的 Tauri 薄壳。
//!
//! 这一层只做三件事：
//!   1. **参数校验与形状转换**（前端 camelCase → Rust snake_case）
//!   2. **路径安全**：读写路径必须落在允许的目录内（白名单），不接受任意路径
//!   3. 调用能力层（cap-img 的像素/EXIF 原语、cap-screen 的截屏），把结果透传前端
//!
//! **不在这一层做的事**：任何像素级计算。滤镜、缩放、裁剪、编码全部在 cap-img 内，
//! 前端只做预览与交互。这条边界不能糊 —— 一旦在前端 canvas 里也做一份，
//! 同一个仓里就会出现两条缩放/编码路径（file 仓已经踩过这个坑）。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

/// 允许读写图片的目录白名单。
///
/// 为什么要有白名单：这个命令面能**写文件**，无限制等于给前端一个任意写入口。
/// 允许：用户通过文件对话框显式选定的路径、box 自己的工作目录、用户主目录。
pub struct ImagePathScope {
    roots: Vec<PathBuf>,
}

impl ImagePathScope {
    /// 构造作用域：`allowed` 是额外放行的目录。
    pub fn new(allowed: Vec<PathBuf>) -> Self {
        Self { roots: allowed }
    }

    /// 校验路径是否在作用域内，返回规范化后的路径。
    pub fn resolve(&self, path: &str) -> Result<PathBuf, String> {
        let requested = PathBuf::from(path);
        if !requested.is_absolute() {
            return Err(format!("路径必须是绝对路径: {path}"));
        }
        if requested
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err(format!("路径不能包含 ..: {path}"));
        }
        // 规范化一次（不要求存在 —— 目标文件可能还没建）
        let canon = canonicalize_lenient(&requested);

        for root in &self.roots {
            // **root 也要用同一套规范化** —— 两边规则不一致会误判。
            // macOS 上 `/tmp` 是指向 `/private/tmp` 的符号链接：
            // root 走 canonicalize 得到 `/private/tmp`，
            // 而请求路径 `/tmp/sub/img.png` 因 `/tmp/sub` 不存在而回落到
            // 词法规范化（仍是 `/tmp/...`）⇒ starts_with 比对失败 ⇒
            // **合法路径被误拒**。实测就是这个坑。
            let root_canon = canonicalize_lenient(root);
            if canon.starts_with(&root_canon) {
                return Ok(canon);
            }
        }
        Err(format!("路径不在允许的目录内: {path}"))
    }
}

/// 宽容的规范化：路径存在就 `canonicalize`（解引用符号链接），
/// 不存在就**逐级向上找到第一个存在的祖先**再 canonicalize，然后接回剩余部分。
///
/// 为什么不能直接用 `canonicalize`：它要求路径存在，而输出目标文件常常还没建。
/// 为什么不能直接用词法规范化：那样 `/tmp/x` 与 `/private/tmp/x` 会被当成两个地方。
///
/// 逐级向上找祖先是关键 —— 它让「存在的部分」解引用符号链接，
/// 「不存在的部分」保持字面，两边就落在同一个命名空间里了。
fn canonicalize_lenient(path: &Path) -> PathBuf {
    // 先试整体 canonicalize
    if let Ok(c) = path.canonicalize() {
        return c;
    }
    // 逐级向上：找到第一个存在的祖先
    let mut suffix: Vec<std::ffi::OsString> = Vec::new();
    let mut cur = path.to_path_buf();
    loop {
        let parent = match cur.parent() {
            Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
            // 到根了（或已无父目录）：整条路径都不存在 ⇒ 词法规范化兜底
            _ => break,
        };
        let name = match cur.file_name() {
            Some(n) => n.to_os_string(),
            None => break,
        };
        suffix.push(name);
        cur = parent;
        if let Ok(c) = cur.canonicalize() {
            let mut out = c;
            for part in suffix.iter().rev() {
                out.push(part);
            }
            return out;
        }
    }
    // 兜底：词法规范化
    normalize_lexically(path)
}

/// 词法规范化：消掉 `.` 与可解的 `..`，不解引用符号链接。
fn normalize_lexically(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// 截屏
// ---------------------------------------------------------------------------

/// 一块显示器（前端 camelCase 化）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    pub id: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
    pub x: i32,
    pub y: i32,
}

/// 一个窗口（前端 camelCase 化）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub id: u32,
    pub pid: u32,
    pub app_name: String,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_minimized: bool,
    pub is_focused: bool,
}

/// 截屏结果：base64 的 PNG + 尺寸。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotData {
    /// base64 编码的 PNG（**无损**，截图要能看清文字）
    pub data: String,
    pub width: u32,
    pub height: u32,
}

/// 枚举显示器。
#[tauri::command]
pub fn list_displays() -> Result<Vec<DisplayInfo>, String> {
    Ok(cap_screen::list_displays()?
        .into_iter()
        .map(|d| DisplayInfo {
            id: d.id,
            name: d.name,
            width: d.width,
            height: d.height,
            is_primary: d.is_primary,
            x: d.x,
            y: d.y,
        })
        .collect())
}

/// 枚举窗口（最小化的已过滤）。
#[tauri::command]
pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    Ok(cap_screen::list_windows()?
        .into_iter()
        .map(|w| WindowInfo {
            id: w.id,
            pid: w.pid,
            app_name: w.app_name,
            title: w.title,
            x: w.x,
            y: w.y,
            width: w.width,
            height: w.height,
            is_minimized: w.is_minimized,
            is_focused: w.is_focused,
        })
        .collect())
}

/// 截取整块显示器（返回 base64 PNG）。
#[tauri::command]
pub fn capture_display(display_id: u32) -> Result<ScreenshotData, String> {
    let frame = cap_screen::capture_display(display_id)?;
    frame_to_png_base64(&frame)
}

/// 截取主显示器。
#[tauri::command]
pub fn capture_primary_display() -> Result<ScreenshotData, String> {
    let frame = cap_screen::capture_primary()?;
    frame_to_png_base64(&frame)
}

/// 截取显示器的某个区域（坐标相对该显示器左上角）。
#[tauri::command]
pub fn capture_region(
    display_id: u32,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<ScreenshotData, String> {
    let frame = cap_screen::capture_region(display_id, x, y, width, height)?;
    frame_to_png_base64(&frame)
}

/// 截取某个窗口。
#[tauri::command]
pub fn capture_window(window_id: u32) -> Result<ScreenshotData, String> {
    let frame = cap_screen::capture_window(window_id)?;
    frame_to_png_base64(&frame)
}

/// 截屏帧 → base64 PNG。
///
/// 截图用 **PNG 无损**而不是 JPEG：截图的主体常常是文字与代码，
/// JPEG 的有损压缩会让小字糊掉 —— 而这恰恰是截图工具的主要用途。
fn frame_to_png_base64(frame: &cap_screen::CapturedFrame) -> Result<ScreenshotData, String> {
    use base64::Engine;
    let expected = (frame.width as usize)
        .checked_mul(frame.height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| format!("尺寸溢出: {}x{}", frame.width, frame.height))?;
    if frame.rgba.len() != expected {
        return Err(format!(
            "RGBA 数据长度不符: 期望 {} 字节, 实得 {} 字节 ({}x{})",
            expected,
            frame.rgba.len(),
            frame.width,
            frame.height
        ));
    }
    let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.rgba.clone())
        .ok_or_else(|| format!("无法构造 RGBA 图像: {}x{}", frame.width, frame.height))?;

    let mut buf: Vec<u8> = Vec::new();
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| format!("编码 PNG 失败: {}", e))?;

    Ok(ScreenshotData {
        data: base64::engine::general_purpose::STANDARD.encode(&buf),
        width: frame.width,
        height: frame.height,
    })
}

// ---------------------------------------------------------------------------
// 图片信息与编辑
// ---------------------------------------------------------------------------

/// 图片信息（cap-img 的 ImageInfo，序列化成 camelCase）。
#[tauri::command]
pub fn get_image_info(
    scope: State<'_, ImagePathScope>,
    path: String,
) -> Result<serde_json::Value, String> {
    let p = scope.resolve(&path)?;
    let info = cap_img::info(&p)?;
    serde_json::to_value(info).map_err(|e| format!("序列化失败: {}", e))
}

/// EXIF 完整快照。
#[tauri::command]
pub fn read_exif(
    scope: State<'_, ImagePathScope>,
    path: String,
) -> Result<serde_json::Value, String> {
    let p = scope.resolve(&path)?;
    let data = cap_img::exif::read(&p)?;
    serde_json::to_value(data).map_err(|e| format!("序列化失败: {}", e))
}

/// 写入 EXIF（在原有基础上改，不丢未知标签）。
#[tauri::command]
pub fn write_exif(
    scope: State<'_, ImagePathScope>,
    path: String,
    dest_path: String,
    edit: cap_img::exif::ExifEdit,
) -> Result<(), String> {
    let src = scope.resolve(&path)?;
    let dest = scope.resolve(&dest_path)?;
    cap_img::exif::write(&src, &dest, &edit)
}

/// 清除全部 EXIF。
#[tauri::command]
pub fn strip_exif(
    scope: State<'_, ImagePathScope>,
    path: String,
    dest_path: String,
) -> Result<(), String> {
    let src = scope.resolve(&path)?;
    let dest = scope.resolve(&dest_path)?;
    cap_img::exif::strip(&src, &dest)
}

/// 缩放参数。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizeArgs {
    pub path: String,
    pub dest_path: String,
    pub width: u32,
    pub height: u32,
}

/// 裁剪参数。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropArgs {
    pub path: String,
    pub dest_path: String,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// 导出参数。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportArgs {
    pub path: String,
    pub dest_path: String,
    pub format: String,
    pub quality: u8,
}

/// 滤镜参数。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterArgs {
    pub path: String,
    pub dest_path: String,
    pub filter_name: String,
}

/// 缩放图片。
#[tauri::command]
pub fn resize_image(scope: State<'_, ImagePathScope>, args: ResizeArgs) -> Result<(), String> {
    let src = scope.resolve(&args.path)?;
    let dest = scope.resolve(&args.dest_path)?;
    cap_img::resize(&src, &dest, args.width, args.height)
}

/// 旋转图片（90/180/270）。
#[tauri::command]
pub fn rotate_image(
    scope: State<'_, ImagePathScope>,
    path: String,
    dest_path: String,
    degrees: u32,
) -> Result<(), String> {
    let src = scope.resolve(&path)?;
    let dest = scope.resolve(&dest_path)?;
    cap_img::rotate(&src, &dest, degrees)
}

/// 翻转图片。
#[tauri::command]
pub fn flip_image(
    scope: State<'_, ImagePathScope>,
    path: String,
    dest_path: String,
    horizontal: bool,
) -> Result<(), String> {
    let src = scope.resolve(&path)?;
    let dest = scope.resolve(&dest_path)?;
    cap_img::flip(&src, &dest, horizontal)
}

/// 裁剪图片。
#[tauri::command]
pub fn crop_image(scope: State<'_, ImagePathScope>, args: CropArgs) -> Result<(), String> {
    let src = scope.resolve(&args.path)?;
    let dest = scope.resolve(&args.dest_path)?;
    cap_img::crop(&src, &dest, args.x, args.y, args.w, args.h)
}

/// 应用滤镜。
#[tauri::command]
pub fn apply_filter(scope: State<'_, ImagePathScope>, args: FilterArgs) -> Result<(), String> {
    let src = scope.resolve(&args.path)?;
    let dest = scope.resolve(&args.dest_path)?;
    cap_img::apply_filter(&src, &dest, &args.filter_name)
}

/// 导出为指定格式。
#[tauri::command]
pub fn export_image(scope: State<'_, ImagePathScope>, args: ExportArgs) -> Result<(), String> {
    let src = scope.resolve(&args.path)?;
    let dest = scope.resolve(&args.dest_path)?;
    cap_img::export(&src, &dest, &args.format, args.quality)
}

/// 生成缩略图（base64 PNG）。
#[tauri::command]
pub fn get_image_thumbnail(
    scope: State<'_, ImagePathScope>,
    path: String,
    max_size: u32,
) -> Result<cap_img::ImageThumbnail, String> {
    let p = scope.resolve(&path)?;
    cap_img::thumbnail(&p, max_size)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_rejects_relative_paths() {
        let scope = ImagePathScope::new(vec![PathBuf::from("/tmp")]);
        let err = scope.resolve("relative/path.png").unwrap_err();
        assert!(err.contains("绝对路径"), "实得 {}", err);
    }

    #[test]
    fn scope_rejects_parent_dir_escapes() {
        let scope = ImagePathScope::new(vec![PathBuf::from("/tmp")]);
        let err = scope.resolve("/tmp/../etc/passwd").unwrap_err();
        assert!(err.contains(".."), "实得 {}", err);
    }

    #[test]
    fn scope_rejects_paths_outside_roots() {
        let scope = ImagePathScope::new(vec![PathBuf::from("/tmp")]);
        let err = scope.resolve("/etc/passwd").unwrap_err();
        assert!(err.contains("不在允许的目录内"), "实得 {}", err);
    }

    #[test]
    fn scope_accepts_paths_inside_roots() {
        let scope = ImagePathScope::new(vec![PathBuf::from("/tmp")]);
        let ok = scope.resolve("/tmp/sub/img.png").unwrap();
        assert!(ok.ends_with("img.png"), "实得 {:?}", ok);
    }

    /// 回归锚点：macOS 上 `/tmp` 是指向 `/private/tmp` 的符号链接。
    ///
    /// 若 root 走 `canonicalize`（得到 `/private/tmp`）、而请求路径因目标
    /// 尚不存在回落到词法规范化（仍是 `/tmp/...`），两边不在同一命名空间，
    /// `starts_with` 失败 ⇒ **合法路径被误拒**。
    ///
    /// 这条测试在 Linux 上也必须过（/tmp 不是符号链接，两边一致），
    /// 但它守的是「规范化规则必须两侧对称」这条判据。
    #[test]
    fn scope_accepts_nonexistent_paths_under_symlinked_roots() {
        // 用一个真符号链接做根，指向一个真实存在的目录
        let base = std::env::temp_dir().join("zbox-scope-test");
        let _ = std::fs::remove_dir_all(&base);
        let real = base.join("real");
        std::fs::create_dir_all(&real).unwrap();
        let link = base.join("link");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real, &link).unwrap();
        #[cfg(not(unix))]
        std::fs::create_dir_all(&link).unwrap();

        let scope = ImagePathScope::new(vec![link.clone()]);
        // 目标文件不存在（正是输出文件的常态）
        let target = link.join("sub").join("img.png");
        let ok = scope
            .resolve(target.to_str().unwrap())
            .expect("符号链接根下的不存在路径必须被接受");
        assert!(ok.ends_with("img.png"), "实得 {:?}", ok);

        let _ = std::fs::remove_dir_all(&base);
    }

    /// 白名单外的路径必须被拒 —— 即便它是通过符号链接绕进来的。
    #[test]
    fn scope_rejects_symlink_escapes() {
        let base = std::env::temp_dir().join("zbox-scope-escape");
        let _ = std::fs::remove_dir_all(&base);
        let inside = base.join("inside");
        let outside = base.join("outside");
        std::fs::create_dir_all(&inside).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let escape = inside.join("escape");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &escape).unwrap();
        #[cfg(not(unix))]
        std::fs::create_dir_all(&escape).unwrap();

        let scope = ImagePathScope::new(vec![inside]);
        let err = scope
            .resolve(escape.join("secret.png").to_str().unwrap())
            .expect_err("指向白名单外的符号链接必须被拒");
        assert!(err.contains("不在允许的目录内"), "实得 {}", err);

        let _ = std::fs::remove_dir_all(&base);
    }
}
