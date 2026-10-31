//! 兄弟应用在菜单/面板里的显示名推导。
//!
//! 这份逻辑在 **build 期**跑（build.rs 通过 `#[path]` 包含本文件，把
//! manifest.json 的 purpose 编译成 display_name），所以生产构建里不会再编译它；
//! lib.rs 只在 `cfg(test)` 下声明，唯一目的是让下面这些边界用例能被 `cargo test` 守住。
//!
//! 两个真实踩过的坑（别再退回）：
//! - mind 的 purpose 是 "…）— .xmind"，em dash 前面没有空格 → 只找 " — " 会切不动；
//! - kb 的 purpose 开头是 "【已并入 note，维护冻结】…" → 公告会原样进菜单。

/// 菜单里显示的名字：取 purpose 首段，再做两处清理。
///
/// 清理一：剥掉开头的 【…】。那是仓的**状态标注**不是名字。
/// 清理二：剥掉结尾的 （…）/ (…)。那是补充说明。
/// 若剥完为空或还像 slug（全小写带连字符），退回仓名短形式。
pub fn display_label(purpose: &str, repo_name: &str) -> String {
    let mut head = first_segment(purpose);

    if head.starts_with('【') {
        if let Some(end) = head.find('】') {
            head = head[end + '】'.len_utf8()..].trim_start().to_string();
        }
    }

    // 只剥最后一组、且紧挨结尾的括号
    for (open, close) in [('（', '）'), ('(', ')')] {
        if head.ends_with(close) {
            if let Some(start) = head.rfind(open) {
                let inner = &head[start + open.len_utf8()..head.len() - close.len_utf8()];
                if !inner.contains(open) {
                    head = head[..start].trim_end().to_string();
                    break;
                }
            }
        }
    }

    if head.is_empty() || looks_like_slug(&head) {
        return repo_name
            .strip_prefix("z-biz-tool-")
            .unwrap_or(repo_name)
            .to_string();
    }
    head
}

pub fn looks_like_slug(s: &str) -> bool {
    (s.contains('-') || s.contains('_')) && !s.chars().any(|c| c.is_ascii_uppercase())
}

/// 从 purpose 里切出首段（分隔符之前）。涵盖 em dash "—" 前后空格任意组合
/// （含两侧都无空格）、en dash "–" 同上、ASCII hyphen "-" 三种空格组合、英文冒号 ":"。
pub fn first_segment(p: &str) -> String {
    let mut candidates: Vec<(usize, &str)> = Vec::new();
    for sep in [
        " — ", " —", "— ", "—", " – ", " –", "– ", "–", " - ", " -", "- ", ":",
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

#[cfg(test)]
mod tests {
    use super::*;

    fn label(purpose: &str) -> String {
        display_label(purpose, "z-biz-tool-xxx")
    }

    #[test]
    fn splits_on_every_separator_variant() {
        for p in [
            "AI 任务看板 — 多代理编排",
            "AI 任务看板 —多代理编排",
            "AI 任务看板— 多代理编排",
            "AI 任务看板—多代理编排",
            "AI 任务看板 – 多代理编排",
            "AI 任务看板 –多代理编排",
            "AI 任务看板–多代理编排",
            "AI 任务看板 - 多代理编排",
            "AI 任务看板 -多代理编排",
            "AI 任务看板- 多代理编排",
            "AI 任务看板:多代理编排",
        ] {
            assert_eq!(label(p), "AI 任务看板", "分隔符没切干净: {p}");
        }
    }

    #[test]
    fn takes_earliest_separator_not_earliest_pattern() {
        // "…）— .xmind"（mind 的真实形状）：em dash 无前导空格，
        // 但后面还有 " - "，必须取最靠前的那个。
        assert_eq!(label("思维导图桌面工具 - 对标 - 亿图"), "思维导图桌面工具");
        assert_eq!(label("思维导图（.xmind）— .xmind"), "思维导图");
    }

    #[test]
    fn strips_status_banner_and_trailing_note() {
        // kb 的真实形状
        assert_eq!(
            label("【已并入 note，维护冻结】知识管理 + RAG 问答（向量检索）"),
            "知识管理 + RAG 问答"
        );
        // 半角括号同样要剥
        assert_eq!(label("文件管理器 (SFTP)"), "文件管理器");
        // 中间括号不能连带后面一起剥
        assert_eq!(label("工具（A）与（B）说明"), "工具（A）与（B）说明");
    }

    #[test]
    fn falls_back_to_repo_short_name() {
        // pet 的真实形状：purpose 首段就是 slug
        assert_eq!(
            display_label("z-biz-companion-pet-cos — 桌面宠物", "z-biz-tool-pet"),
            "pet"
        );
        // 剥空了也要回退，不能给菜单一个空标题
        assert_eq!(display_label("【冻结】", "z-biz-tool-kb"), "kb");
        assert_eq!(display_label("", "z-biz-tool-note"), "note");
    }

    #[test]
    fn keeps_display_names_with_uppercase_or_spaces() {
        // ZenNote 没有连字符；GeoLab 数学实验室有大写 —— 都不该被判成 slug
        assert_eq!(label("ZenNote — 卡片笔记"), "ZenNote");
        assert_eq!(label("GeoLab 数学实验室"), "GeoLab 数学实验室");
    }
}
