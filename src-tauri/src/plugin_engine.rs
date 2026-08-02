use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn list_plugins(app: tauri::AppHandle) -> Vec<PluginInfo> {
    let plugins_dir = get_plugins_dir(&app);
    let mut plugins = Vec::new();

    if let Ok(entries) = fs::read_dir(&plugins_dir) {
        for entry in entries.flatten() {
            let manifest_path = entry.path().join("plugin.json");
            if let Ok(content) = fs::read_to_string(&manifest_path) {
                if let Ok(info) = serde_json::from_str::<PluginInfo>(&content) {
                    plugins.push(info);
                }
            }
        }
    }

    // Built-in plugins
    plugins.extend(get_builtin_plugins());
    plugins
}

#[tauri::command]
pub fn execute_plugin(app: tauri::AppHandle, plugin_id: String, action: String, input: String) -> String {
    match plugin_id.as_str() {
        "base64" => execute_base64(&action, &input),
        "json-format" => execute_json_format(&action, &input),
        "timestamp" => execute_timestamp(&action, &input),
        "uuid" => execute_uuid(),
        _ => format!("Unknown plugin: {}", plugin_id),
    }
}

fn get_plugins_dir(app: &tauri::AppHandle) -> PathBuf {
    let app_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    app_dir.join("plugins")
}

fn get_builtin_plugins() -> Vec<PluginInfo> {
    vec![
        PluginInfo {
            id: "base64".into(),
            name: "Base64编解码".into(),
            description: "Base64 encode/decode".into(),
            icon: "encode".into(),
            enabled: true,
        },
        PluginInfo {
            id: "json-format".into(),
            name: "JSON格式化".into(),
            description: "JSON format/minify/validate".into(),
            icon: "code".into(),
            enabled: true,
        },
        PluginInfo {
            id: "timestamp".into(),
            name: "时间戳转换".into(),
            description: "Unix timestamp converter".into(),
            icon: "clock".into(),
            enabled: true,
        },
        PluginInfo {
            id: "uuid".into(),
            name: "UUID生成".into(),
            description: "Generate UUID v4".into(),
            icon: "key".into(),
            enabled: true,
        },
    ]
}

fn execute_base64(action: &str, input: &str) -> String {
    match action {
        "encode" => {
            // Simple base64 encode using a basic implementation
            base64_encode(input.as_bytes())
        }
        "decode" => {
            match base64_decode(input) {
                Some(bytes) => String::from_utf8_lossy(&bytes).to_string(),
                None => "Invalid Base64 input".into(),
            }
        }
        _ => "Unknown action".into(),
    }
}

const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(data: &[u8]) -> String {
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;

        result.push(BASE64_CHARS[((n >> 18) & 63) as usize] as char);
        result.push(BASE64_CHARS[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            result.push(BASE64_CHARS[((n >> 6) & 63) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(BASE64_CHARS[(n & 63) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let input = input.trim();
    let mut result = Vec::new();
    let data: Vec<u8> = input.bytes().filter(|&b| b != b'\n' && b != b'\r' && b != b' ').collect();

    for chunk in data.chunks(4) {
        let mut vals = [0u32; 4];
        let mut pad = 0;
        for (i, &b) in chunk.iter().enumerate() {
            vals[i] = if b == b'=' { pad += 1; 0 }
            else {
                BASE64_CHARS.iter().position(|&c| c == b).map(|p| p as u32).unwrap_or(0)
            };
        }
        let n = (vals[0] << 18) | (vals[1] << 12) | (vals[2] << 6) | vals[3];
        result.push((n >> 16) as u8);
        if pad < 2 { result.push((n >> 8) as u8); }
        if pad < 1 { result.push(n as u8); }
    }
    Some(result)
}

fn execute_json_format(action: &str, input: &str) -> String {
    match action {
        "format" => {
            match serde_json::from_str::<serde_json::Value>(input) {
                Ok(v) => serde_json::to_string_pretty(&v).unwrap_or_else(|_| "Invalid JSON".into()),
                Err(e) => format!("Parse error: {}", e),
            }
        }
        "minify" => {
            match serde_json::from_str::<serde_json::Value>(input) {
                Ok(v) => serde_json::to_string(&v).unwrap_or_else(|_| "Invalid JSON".into()),
                Err(e) => format!("Parse error: {}", e),
            }
        }
        _ => "Unknown action".into(),
    }
}

fn execute_timestamp(action: &str, input: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    match action {
        "now" => {
            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
            now.as_secs().to_string()
        }
        "to-date" => {
            let ts: u64 = input.parse().unwrap_or(0);
            format!("Timestamp: {}", ts)
        }
        _ => "Unknown action".into(),
    }
}

fn execute_uuid() -> String {
    // Simple UUID v4 generation without external crate
    let mut buf = [0u8; 16];
    getrandom::getrandom(&mut buf).ok();
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    format!("{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        buf[0], buf[1], buf[2], buf[3],
        buf[4], buf[5], buf[6], buf[7],
        buf[8], buf[9], buf[10], buf[11],
        buf[12], buf[13], buf[14], buf[15])
}
