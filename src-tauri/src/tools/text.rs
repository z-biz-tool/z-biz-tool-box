use serde::{Deserialize, Serialize};

// ============ Tauri Commands ============

#[derive(Serialize, Deserialize, Clone)]
pub struct DiffResult {
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub unchanged: usize,
    pub summary: String,
    pub formatted: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TextStats {
    pub characters: usize,
    pub characters_no_spaces: usize,
    pub words: usize,
    pub lines: usize,
    pub sentences: usize,
    pub paragraphs: usize,
}

#[tauri::command]
pub fn text_diff(text1: String, text2: String) -> DiffResult {
    let lines1: Vec<&str> = text1.lines().collect();
    let lines2: Vec<&str> = text2.lines().collect();

    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut unchanged = 0;

    let max_len = lines1.len().max(lines2.len());
    let mut formatted = String::new();

    for i in 0..max_len {
        let l1 = lines1.get(i).copied();
        let l2 = lines2.get(i).copied();
        match (l1, l2) {
            (Some(a), Some(b)) => {
                if a == b {
                    unchanged += 1;
                    formatted.push_str(&format!("  {}\n", a));
                } else {
                    removed.push(format!("Line {}: {}", i + 1, a));
                    added.push(format!("Line {}: {}", i + 1, b));
                    formatted.push_str(&format!("- {}\n+ {}\n", a, b));
                }
            }
            (Some(a), None) => {
                removed.push(format!("Line {}: {}", i + 1, a));
                formatted.push_str(&format!("- {}\n", a));
            }
            (None, Some(b)) => {
                added.push(format!("Line {}: {}", i + 1, b));
                formatted.push_str(&format!("+ {}\n", b));
            }
            (None, None) => break,
        }
    }

    let summary = format!(
        "Added: {} lines, Removed: {} lines, Unchanged: {} lines",
        added.len(),
        removed.len(),
        unchanged
    );

    DiffResult {
        added,
        removed,
        unchanged,
        summary,
        formatted,
    }
}

#[tauri::command]
pub fn text_case(input: String, mode: String) -> String {
    match mode.as_str() {
        "upper" => input.to_uppercase(),
        "lower" => input.to_lowercase(),
        "title" => to_title_case(&input),
        "capitalize" => capitalize_first(&input),
        "camel" => to_camel_case(&input),
        "pascal" => to_pascal_case(&input),
        "snake" => to_snake_case(&input),
        "kebab" => to_kebab_case(&input),
        _ => format!("Unknown case mode: {}. Available: upper, lower, title, capitalize, camel, pascal, snake, kebab", mode),
    }
}

#[tauri::command]
pub fn text_deduplicate(input: String) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for line in input.lines() {
        if seen.insert(line.to_string()) {
            result.push(line.to_string());
        }
    }
    result.join("\n")
}

#[tauri::command]
pub fn text_sort(input: String, order: Option<String>) -> String {
    let descending = matches!(order.as_deref(), Some("desc") | Some("descending") | Some("reverse"));
    let mut lines: Vec<String> = input.lines().map(|s| s.to_string()).collect();
    if descending {
        lines.sort_by(|a, b| b.cmp(a));
    } else {
        lines.sort();
    }
    lines.join("\n")
}

#[tauri::command]
pub fn text_stats(input: String) -> TextStats {
    let characters = input.chars().count();
    let characters_no_spaces = input.chars().filter(|&c| !c.is_whitespace()).count();
    let words = input.split_whitespace().count();
    let lines = input.lines().count();
    let sentences = input.split('.').filter(|s| !s.trim().is_empty()).count()
        + input.split('!').filter(|s| !s.trim().is_empty()).count().saturating_sub(1)
        + input.split('?').filter(|s| !s.trim().is_empty()).count().saturating_sub(1);
    let sentences = sentences.max(0);
    let paragraphs = input.split("\n\n").filter(|s| !s.trim().is_empty()).count();

    TextStats {
        characters,
        characters_no_spaces,
        words,
        lines,
        sentences,
        paragraphs,
    }
}

#[tauri::command]
pub fn text_reverse(input: String) -> String {
    input.chars().rev().collect()
}

#[tauri::command]
pub fn lorem_ipsum(count: Option<usize>) -> String {
    let n = count.unwrap_or(5);
    generate_lorem_ipsum(n)
}

// ============ Helpers ============

fn to_title_case(input: &str) -> String {
    input
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str().to_lowercase().as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn capitalize_first(input: &str) -> String {
    let mut chars = input.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn split_words(input: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    for c in input.chars() {
        if c.is_alphanumeric() {
            current.push(c.to_ascii_lowercase());
        } else if !current.is_empty() {
            words.push(current.clone());
            current.clear();
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

fn to_camel_case(input: &str) -> String {
    let words = split_words(input);
    let mut result = String::new();
    for (i, word) in words.iter().enumerate() {
        if i == 0 {
            result.push_str(&word.to_lowercase());
        } else {
            let mut chars = word.chars();
            if let Some(first) = chars.next() {
                result.push(first.to_uppercase().collect::<String>().chars().next().unwrap());
                result.push_str(&chars.as_str().to_lowercase());
            }
        }
    }
    result
}

fn to_pascal_case(input: &str) -> String {
    let words = split_words(input);
    let mut result = String::new();
    for word in words {
        let mut chars = word.chars();
        if let Some(first) = chars.next() {
            result.push_str(&first.to_uppercase().collect::<String>());
            result.push_str(&chars.as_str().to_lowercase());
        }
    }
    result
}

fn to_snake_case(input: &str) -> String {
    split_words(input).join("_")
}

fn to_kebab_case(input: &str) -> String {
    split_words(input).join("-")
}

fn generate_lorem_ipsum(count: usize) -> String {
    let words = vec![
        "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
        "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
        "magna", "aliqua", "ut", "enim", "ad", "minim", "veniam", "quis", "nostrud",
        "exercitation", "ullamco", "laboris", "nisi", "ut", "aliquip", "ex", "ea",
        "commodo", "consequat", "duis", "aute", "irure", "dolor", "in", "reprehenderit",
        "in", "voluptate", "velit", "esse", "cillum", "dolore", "eu", "fugiat", "nulla",
        "pariatur", "excepteur", "sint", "occaecat", "cupidatat", "non", "proident",
        "sunt", "in", "culpa", "qui", "officia", "deserunt", "mollit", "anim", "id",
        "est", "laborum",
    ];

    let mut rng_state = 12345u32;
    let mut next_rand = || {
        rng_state = rng_state.wrapping_mul(1103515245).wrapping_add(12345);
        rng_state
    };

    let mut paragraphs = Vec::new();
    for _ in 0..count {
        let mut sentences = Vec::new();
        let sentence_count = 3 + (next_rand() as usize) % 4;
        for s in 0..sentence_count {
            let word_count = 8 + (s * 7) % 12;
            let mut sentence_words: Vec<String> = Vec::new();
            for _ in 0..word_count {
                let r = next_rand();
                sentence_words.push(words[(r as usize) % words.len()].to_string());
            }
            let mut sentence = sentence_words.join(" ");
            if let Some(first) = sentence.get_mut(0..1) {
                first.make_ascii_uppercase();
            }
            sentence.push('.');
            sentences.push(sentence);
        }
        paragraphs.push(sentences.join(" "));
    }
    paragraphs.join("\n\n")
}
