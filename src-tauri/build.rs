use std::fs;
use std::path::Path;

// 显示名推导与运行时/测试共用同一份源码，避免 build.rs 里的规则无人可测。
#[path = "src/brother_label.rs"]
mod brother_label;
use brother_label::display_label;

fn main() {
    // 图标不在 tauri-build 的重跑指纹里，不挂这两条就会把旧 resource.lib 链进新 exe
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    tauri_build::build();

    // 兄弟应用清单 codegen（manifest.json → $OUT_DIR/generated_brothers.rs）
    let entries = codegen_brothers();

    // 兄弟图标内嵌（各兄弟仓 src-tauri/icons/32x32.png → OUT_DIR → include_bytes!）
    stage_brother_icons(&entries);
    codegen_brother_icons(&entries);
}

/// 生成 $OUT_DIR/generated_brothers.rs：
///   - 从 SSoT ../../z-biz-tool-lead/003_辅助能力/bootstrap/manifest.json 读兄弟清单
///   - 过滤: type=product + bundle_id 非空 + name != z-biz-tool-box 自己
///   - 输出 const GENERATED_BROTHERS: &[BrotherSeed] = &[BrotherSeed{..}, ..];
///   - manifest 缺失时输出空数组 + cargo:warning（不阻断 build）
///
/// 显示名取 purpose 的首段（"—" 或 "-" 之前的中文短名），便于菜单紧凑展示。
fn codegen_brothers() -> Vec<BrotherSeed> {
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
    entries
}

#[derive(Debug)]
struct BrotherSeed {
    key: String,          // "worker" — tray id 后缀 + GitHub repo 后缀共用
    name: String,         // 仓名 "z-biz-tool-worker"
    bundle_id: String,    // "com.zifang.z-biz-tool-worker"
    display_name: String, // "AI 任务看板"
    /// 该产品是否接受 zbiz:// 深链。
    ///
    /// 真值来自**产品自己的仓**（仓根 product.json）——
    /// 「每条记录都有主人」：只有那个 app 知道自己接没接协议。
    /// box 只是读方，不替谁声明。
    accepts_deep_link: bool,
    /// 该产品支持的动作。空 = 只能被唤起，不能接收参数。
    deep_link_actions: Vec<String>,
}

/// 参与「兄弟应用召唤」的 type 白名单。
/// - `product`          主力 Tauri 产品
/// - `product-local`    本地计算类(cpu/math)，装机后同样是带 bundle_id 的桌面 .app
/// - `product-electron` Electron 产品(pet)，同理可探测可拉起
///
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
        let purpose = r.get("purpose").and_then(|x| x.as_str()).unwrap_or(&name);
        let display_name = display_label(purpose, &name);
        let key = name
            .strip_prefix("z-biz-tool-")
            .unwrap_or(&name)
            .to_string();
        // 深链能力读**产品自己的仓**（仓根 product.json），不读 lead 转抄的副本 ——
        // 「每条记录都有主人」：只有那个 app 知道自己接没接协议、支持哪些动作。
        // 自报缺失时按「不接深链」处理：宁可不显示，也不能显示一个假的。
        let (accepts_deep_link, deep_link_actions) = read_product_self_report(&name);
        out.push(BrotherSeed {
            key,
            name,
            bundle_id,
            display_name,
            accepts_deep_link,
            deep_link_actions,
        });
    }
    Ok(out)
}

/// 读某个产品仓仓根的 `product.json`，取它的深链自报。
///
/// 返回 `(accepts_deep_link, actions)`。
///
/// 缺失或不合规时返回 `(false, vec![])` 并打一条 `cargo:warning`：
/// 不阻断 build —— 兄弟仓不在盘上（如只 clone 了 box）是常态，
/// 但要让 build 输出里**看得见**这件事，而不是静默当成「不支持」。
fn read_product_self_report(repo: &str) -> (bool, Vec<String>) {
    let path = Path::new("../../").join(repo).join("product.json");
    println!("cargo:rerun-if-changed={}", path.display());
    if !path.is_file() {
        println!(
            "cargo:warning={} 没有 product.json，该产品在面板上不显示深链能力",
            repo
        );
        return (false, Vec::new());
    }
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            println!("cargo:warning=读 {} 失败: {e}", path.display());
            return (false, Vec::new());
        }
    };
    let v: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            println!("cargo:warning=解析 {} 失败: {e}", path.display());
            return (false, Vec::new());
        }
    };
    let accepts = v
        .get("acceptsDeepLink")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
    let actions: Vec<String> = v
        .get("actions")
        .and_then(|x| x.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    // 自相矛盾的自报（声明了动作却说自己不接深链）按「不接」处理 ——
    // 协议层的产品自报校验（shared/src/types/productManifest.ts）会独立报红。
    if !accepts {
        return (false, Vec::new());
    }
    (true, actions)
}

fn render_rs(entries: &[BrotherSeed]) -> String {
    let mut s = String::new();
    s.push_str("// Auto-generated by build.rs codegen_brothers()。\n");
    s.push_str("// 数据源: ../../z-biz-tool-lead/003_辅助能力/bootstrap/manifest.json (SSoT)\n");
    s.push_str("// 深链能力: 各兄弟仓仓根 product.json（每条记录都有主人）\n");
    s.push_str("// 不要手改；组织清单变动先改 manifest.json，build 时自动重生。\n\n");
    s.push_str("#[derive(Debug, Clone)]\n");
    s.push_str("pub struct BrotherSeed {\n");
    s.push_str("    pub key: &'static str,\n");
    s.push_str("    pub name: &'static str,\n");
    s.push_str("    pub bundle_id: &'static str,\n");
    s.push_str("    pub display_name: &'static str,\n");
    s.push_str("    pub accepts_deep_link: bool,\n");
    s.push_str("    pub deep_link_actions: &'static [&'static str],\n");
    s.push_str("}\n\n");
    s.push_str("pub const GENERATED_BROTHERS: &[BrotherSeed] = &[\n");
    for e in entries {
        let actions = e
            .deep_link_actions
            .iter()
            .map(|a| format!("{:?}", a))
            .collect::<Vec<_>>()
            .join(", ");
        s.push_str(&format!(
            "    BrotherSeed {{ key: {:?}, name: {:?}, bundle_id: {:?}, display_name: {:?}, accepts_deep_link: {}, deep_link_actions: &[{}] }},\n",
            e.key, e.name, e.bundle_id, e.display_name, e.accepts_deep_link, actions
        ));
    }
    s.push_str("];\n");
    s
}

/// 把各兄弟仓的 32x32.png 拷进 $OUT_DIR/brother_icons/{key}.png。
/// 兄弟仓不在盘上（如未 clone 的 private 仓）时跳过 —— 缺图的前端退回首字母色块。
fn stage_brother_icons(entries: &[BrotherSeed]) {
    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR 由 cargo 设置");
    let dir = Path::new(&out_dir).join("brother_icons");
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    for e in entries {
        let repo = Path::new("../../").join(&e.name);
        let direct = repo.join("src-tauri/icons/32x32.png");
        println!("cargo:rerun-if-changed={}", direct.display());
        let Some(src) = icon_source(&repo) else {
            println!(
                "cargo:warning=兄弟 {} 无 32x32.png（{}），面板用首字母色块",
                e.name,
                direct.display()
            );
            continue;
        };
        println!("cargo:rerun-if-changed={}", src.display());
        if fs::copy(&src, dir.join(format!("{}.png", e.key))).is_err() {
            println!("cargo:warning=复制 {} 图标失败", src.display());
        }
    }
}

/// 兄弟仓的 32x32 图标。优先仓根，找不到再往下看一层子目录 ——
/// remote 是 monorepo，桌面壳在 `z-biz-tool-remote-client/src-tauri/`。
fn icon_source(repo: &Path) -> Option<std::path::PathBuf> {
    let direct = repo.join("src-tauri/icons/32x32.png");
    if direct.is_file() {
        return Some(direct);
    }
    let mut dirs: Vec<std::path::PathBuf> = fs::read_dir(repo)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|p| p.is_dir())
        .filter(|p| {
            !p.file_name()
                .is_some_and(|n| n.to_string_lossy().starts_with('.'))
        })
        .collect();
    dirs.sort(); // 多个子 crate 都有图标时取稳定的第一个
    dirs.into_iter()
        .map(|d| d.join("src-tauri/icons/32x32.png"))
        .find(|p| p.is_file())
}

/// 生成 $OUT_DIR/generated_brother_icons.rs：key → 内嵌 PNG 字节。
/// 与 generated_brothers.rs 同机制，数据源仍是兄弟仓工作区（不是网络）。
fn codegen_brother_icons(entries: &[BrotherSeed]) {
    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR 由 cargo 设置");
    let dir = Path::new(&out_dir).join("brother_icons");

    let mut s = String::new();
    s.push_str("// Auto-generated by build.rs codegen_brother_icons()。\n");
    s.push_str("// 数据源: 各兄弟仓 src-tauri/icons/32x32.png（工作区相对路径）\n");
    s.push_str("// 不要手改；兄弟仓图标变动后重新 build 自动重生。\n\n");
    s.push_str("#[derive(Debug, Clone)]\n");
    s.push_str("pub struct BrotherIcon {\n");
    s.push_str("    pub key: &'static str,\n");
    s.push_str("    pub png: Option<&'static [u8]>,\n");
    s.push_str("}\n\n");
    s.push_str("pub const GENERATED_BROTHER_ICONS: &[BrotherIcon] = &[\n");
    for e in entries {
        let staged = dir.join(format!("{}.png", e.key));
        if staged.is_file() {
            s.push_str(&format!(
                "    BrotherIcon {{ key: {:?}, png: Some(include_bytes!(concat!(env!(\"OUT_DIR\"), \"/brother_icons/{}.png\"))) }},\n",
                e.key, e.key
            ));
        } else {
            s.push_str(&format!(
                "    BrotherIcon {{ key: {:?}, png: None }},\n",
                e.key
            ));
        }
    }
    s.push_str("];\n");
    fs::write(Path::new(&out_dir).join("generated_brother_icons.rs"), s)
        .expect("写 OUT_DIR/generated_brother_icons.rs 失败");
}
