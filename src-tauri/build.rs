use std::fs;
use std::path::Path;

fn main() {
    // 图标不在 tauri-build 的重跑指纹里，不挂这两条就会把旧 resource.lib 链进新 exe
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    tauri_build::build();

    // 兄弟应用清单 codegen（manifest.json → $OUT_DIR/generated_brothers.rs）
    codegen_brothers();
}

/// 生成 $OUT_DIR/generated_brothers.rs：
///   - 从 SSoT ../../z-biz-tool-lead/003_辅助能力/bootstrap/manifest.json 读兄弟清单
///   - 过滤: type=product + bundle_id 非空 + name != z-biz-tool-box 自己
///   - 输出 const GENERATED_BROTHERS: &[BrotherSeed] = &[BrotherSeed{..}, ..];
///   - manifest 缺失时输出空数组 + cargo:warning（不阻断 build）
///
/// 显示名取 purpose 的首段（"—" 或 "-" 之前的中文短名），便于菜单紧凑展示。
fn codegen_brothers() {
    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR 由 cargo 设置");
    let out_path = Path::new(&out_dir).join("generated_brothers.rs");

    let manifest = Path::new("../../z-biz-tool-lead/003_辅助能力/bootstrap/manifest.json");
    println!("cargo:rerun-if-changed={}", manifest.display());

    let entries: Vec<BrotherSeed> = if manifest.exists() {
        match parse_manifest(manifest) {
            Ok(v) => v,
            Err(e) => {
                println!("cargo:warning=解析 manifest.json 失败: {e}；输出空清单");
                Vec::new()
            }
        }
    } else {
        println!(
            "cargo:warning=manifest.json 不存在 ({})，兄弟清单为空。常见原因: 不在 /Users/zifang/workplace/ceo_workplace/z-biz-tool/ 一把 clone，或 lead 仓未拉取。补齐后下次 build 自动重生。",
            manifest.display()
        );
        Vec::new()
    };

    let rendered = render_rs(&entries);
    fs::write(&out_path, rendered).expect("写 OUT_DIR/generated_brothers.rs 失败");
}

#[derive(Debug)]
struct BrotherSeed {
    key: String,        // "worker" — tray id 后缀 + GitHub repo 后缀共用
    name: String,       // 仓名 "z-biz-tool-worker"
    bundle_id: String,  // "com.zifang.z-biz-tool-worker"
    display_name: String, // "AI 任务看板"
}

/// 参与「兄弟应用召唤」的 type 白名单。
/// - `product`          主力 Tauri 产品
/// - `product-local`    本地计算类(cpu/math)，装机后同样是带 bundle_id 的桌面 .app
/// - `product-electron` Electron 产品(pet)，同理可探测可拉起
/// 刻意排除 `library` / `capability` / `meta`：它们没有可启动的桌面产物。
const SUMMONABLE_TYPES: [&str; 3] = ["product", "product-local", "product-electron"];

fn parse_manifest(path: &Path) -> Result<Vec<BrotherSeed>, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("read: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("json parse: {e}"))?;
    let arr = v
        .get("repositories")
        .and_then(|x| x.as_array())
        .ok_or("缺少 repositories[]")?;
    let mut out = Vec::new();
    for r in arr {
        let rtype = r.get("type").and_then(|x| x.as_str()).unwrap_or("");
        if !SUMMONABLE_TYPES.contains(&rtype) {
            continue;
        }
        let name = match r.get("name").and_then(|x| x.as_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        if name == "z-biz-tool-box" {
            continue; // 不召唤自己
        }
        let bundle_id = match r.get("bundle_id").and_then(|x| x.as_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue, // 没 bundle_id 召唤无意义
        };
        let purpose = r
            .get("purpose")
            .and_then(|x| x.as_str())
            .unwrap_or(&name);
        let display_name = display_label(purpose, &name);
        let key = name.strip_prefix("z-biz-tool-").unwrap_or(&name).to_string();
        out.push(BrotherSeed {
            key,
            name,
            bundle_id,
            display_name,
        });
    }
    Ok(out)
}

/// 菜单里显示的名字：取 purpose 首段；但若首段是「slug 形态」就退回仓名短形式。
/// slug 形态 = 含 - 或 _ 且没有大写字母，用来识别 pet 那种
/// "z-biz-companion-pet-cos — 桌面宠物 + ..." 的英文连字符前缀。
/// 不能拿「有没有中文」当判据 —— ZenNote / GeoLab 这类正经产品名不含中文，
/// 那样会被误伤成 "note" / "math"。
fn display_label(purpose: &str, repo_name: &str) -> String {
    let head = first_segment(purpose);
    if looks_like_slug(&head) {
        return repo_name
            .strip_prefix("z-biz-tool-")
            .unwrap_or(repo_name)
            .to_string();
    }
    head
}

fn looks_like_slug(s: &str) -> bool {
    (s.contains('-') || s.contains('_')) && !s.chars().any(|c| c.is_ascii_uppercase())
}

/// 从 purpose 里切出首段（分隔符之前）。涵盖:
///   em dash "—" 前/后空格任意组合、en dash "–" 同上、
///   ASCII hyphen "-" 三种空格组合、英文冒号 ":"
fn first_segment(p: &str) -> String {
    let mut candidates: Vec<(usize, &str)> = Vec::new();
    for sep in [
        " — ", " —", "— ",
        " – ", " –",
        " - ", " -", "- ",
        ":",
    ] {
        if let Some(idx) = p.find(sep) {
            candidates.push((idx, sep));
        }
    }
    if candidates.is_empty() {
        return p.trim().to_string();
    }
    candidates.sort_by_key(|(idx, _)| *idx);
    let idx = candidates[0].0;
    p[..idx].trim().to_string()
}

fn render_rs(entries: &[BrotherSeed]) -> String {
    let mut s = String::new();
    s.push_str("// Auto-generated by build.rs codegen_brothers()。\n");
    s.push_str("// 数据源: ../../z-biz-tool-lead/003_辅助能力/bootstrap/manifest.json (SSoT)\n");
    s.push_str("// 不要手改；组织清单变动先改 manifest.json，build 时自动重生。\n\n");
    s.push_str("#[derive(Debug, Clone)]\n");
    s.push_str("pub struct BrotherSeed {\n");
    s.push_str("    pub key: &'static str,\n");
    s.push_str("    pub name: &'static str,\n");
    s.push_str("    pub bundle_id: &'static str,\n");
    s.push_str("    pub display_name: &'static str,\n");
    s.push_str("}\n\n");
    s.push_str("pub const GENERATED_BROTHERS: &[BrotherSeed] = &[\n");
    for e in entries {
        s.push_str(&format!(
            "    BrotherSeed {{ key: {:?}, name: {:?}, bundle_id: {:?}, display_name: {:?} }},\n",
            e.key, e.name, e.bundle_id, e.display_name
        ));
    }
    s.push_str("];\n");
    s
}
