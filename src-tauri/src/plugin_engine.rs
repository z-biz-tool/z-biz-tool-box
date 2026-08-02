use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

use crate::tools;

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
        // Original tools
        "base64" => execute_base64(&action, &input),
        "json-format" => execute_json_format(&action, &input),
        "timestamp" => execute_timestamp(&action, &input),
        "uuid" => execute_uuid(),
        // Encoding tools
        "encoding" | "url" => execute_encoding(&action, &input),
        "html" => execute_html(&action, &input),
        "hex" => execute_hex(&action, &input),
        "md5" => execute_md5(&input),
        "sha256" => execute_sha256(&input),
        // Text tools
        "text-diff" => execute_text_diff(&input),
        "text-case" => execute_text_case(&action, &input),
        "text-dedup" => execute_text_dedup(&input),
        "text-sort" => execute_text_sort(&action, &input),
        "text-stats" => execute_text_stats(&input),
        "text-reverse" => execute_text_reverse(&input),
        "lorem-ipsum" => execute_lorem_ipsum(&input),
        // Crypto tools
        "aes" | "aes-256" => execute_aes(&action, &input),
        "jwt" => execute_jwt(&input),
        "password-gen" => execute_password_gen(&action, &input),
        "password-check" => execute_password_check(&input),
        // Convert tools
        "color" => execute_color(&input),
        "base-convert" => execute_base_convert(&action, &input),
        "unit-convert" => execute_unit_convert(&action, &input),
        "exchange" => execute_exchange(&action, &input),
        "cron" => execute_cron(&input),
        // Network tools
        "http" => execute_http(&action, &input),
        "ip" => execute_ip(&action, &input),
        "dns" => execute_dns(&input),
        "port" => execute_port(&action, &input),
        _ => format!("Unknown plugin: {}", plugin_id),
    }
}

fn get_plugins_dir(app: &tauri::AppHandle) -> PathBuf {
    let app_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    app_dir.join("plugins")
}

fn get_builtin_plugins() -> Vec<PluginInfo> {
    vec![
        // Original
        PluginInfo { id: "base64".into(), name: "Base64编解码".into(), description: "Base64 encode/decode".into(), icon: "encode".into(), enabled: true },
        PluginInfo { id: "json-format".into(), name: "JSON格式化".into(), description: "JSON format/minify/validate".into(), icon: "code".into(), enabled: true },
        PluginInfo { id: "timestamp".into(), name: "时间戳转换".into(), description: "Unix timestamp converter".into(), icon: "clock".into(), enabled: true },
        PluginInfo { id: "uuid".into(), name: "UUID生成".into(), description: "Generate UUID v4".into(), icon: "key".into(), enabled: true },
        // Encoding
        PluginInfo { id: "encoding".into(), name: "URL编解码".into(), description: "URL encode/decode".into(), icon: "link".into(), enabled: true },
        PluginInfo { id: "html".into(), name: "HTML实体编解码".into(), description: "HTML entity encode/decode".into(), icon: "code".into(), enabled: true },
        PluginInfo { id: "hex".into(), name: "Hex编解码".into(), description: "Hexadecimal encode/decode".into(), icon: "hash".into(), enabled: true },
        PluginInfo { id: "md5".into(), name: "MD5哈希".into(), description: "MD5 hash generator".into(), icon: "fingerprint".into(), enabled: true },
        PluginInfo { id: "sha256".into(), name: "SHA256哈希".into(), description: "SHA-256 hash generator".into(), icon: "fingerprint".into(), enabled: true },
        // Text
        PluginInfo { id: "text-diff".into(), name: "文本差异对比".into(), description: "Compare two texts line by line".into(), icon: "git-compare".into(), enabled: true },
        PluginInfo { id: "text-case".into(), name: "大小写转换".into(), description: "Upper/lower/title/camel/snake/kebab".into(), icon: "type".into(), enabled: true },
        PluginInfo { id: "text-dedup".into(), name: "文本去重".into(), description: "Remove duplicate lines".into(), icon: "list".into(), enabled: true },
        PluginInfo { id: "text-sort".into(), name: "文本排序".into(), description: "Sort lines asc/desc".into(), icon: "arrow-down-narrow-wide".into(), enabled: true },
        PluginInfo { id: "text-stats".into(), name: "字数统计".into(), description: "Count characters/words/lines".into(), icon: "bar-chart".into(), enabled: true },
        PluginInfo { id: "text-reverse".into(), name: "文本翻转".into(), description: "Reverse text".into(), icon: "repeat".into(), enabled: true },
        PluginInfo { id: "lorem-ipsum".into(), name: "Lorem Ipsum".into(), description: "Generate placeholder text".into(), icon: "align-left".into(), enabled: true },
        // Crypto
        PluginInfo { id: "aes".into(), name: "AES加密".into(), description: "AES-256-ECB encrypt/decrypt".into(), icon: "lock".into(), enabled: true },
        PluginInfo { id: "jwt".into(), name: "JWT解码".into(), description: "Decode JWT tokens".into(), icon: "key".into(), enabled: true },
        PluginInfo { id: "password-gen".into(), name: "密码生成".into(), description: "Generate strong passwords".into(), icon: "key-round".into(), enabled: true },
        PluginInfo { id: "password-check".into(), name: "密码强度检测".into(), description: "Check password strength".into(), icon: "shield".into(), enabled: true },
        // Convert
        PluginInfo { id: "color".into(), name: "颜色转换".into(), description: "HEX/RGB/HSL converter".into(), icon: "palette".into(), enabled: true },
        PluginInfo { id: "base-convert".into(), name: "进制转换".into(), description: "Binary/Octal/Decimal/Hex".into(), icon: "binary".into(), enabled: true },
        PluginInfo { id: "unit-convert".into(), name: "单位换算".into(), description: "Length/weight/temp/area/volume/speed".into(), icon: "ruler".into(), enabled: true },
        PluginInfo { id: "exchange".into(), name: "汇率换算".into(), description: "Currency exchange (static rates)".into(), icon: "dollar-sign".into(), enabled: true },
        PluginInfo { id: "cron".into(), name: "Cron解析".into(), description: "Parse cron expressions".into(), icon: "clock".into(), enabled: true },
        // Network
        PluginInfo { id: "http".into(), name: "HTTP请求测试".into(), description: "GET/POST/PUT/DELETE test".into(), icon: "globe".into(), enabled: true },
        PluginInfo { id: "ip".into(), name: "IP地址查询".into(), description: "IP info & subnet calculator".into(), icon: "network".into(), enabled: true },
        PluginInfo { id: "dns".into(), name: "DNS查询说明".into(), description: "DNS query guide".into(), icon: "server".into(), enabled: true },
        PluginInfo { id: "port".into(), name: "端口检查说明".into(), description: "Port check guide".into(), icon: "plug".into(), enabled: true },
    ]
}

// ============ Original Tools ============

fn execute_base64(action: &str, input: &str) -> String {
    match action {
        "encode" => base64_encode(input.as_bytes()),
        "decode" => match base64_decode(input) {
            Some(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            None => "Invalid Base64 input".into(),
        },
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
            vals[i] = if b == b'=' {
                pad += 1;
                0
            } else {
                BASE64_CHARS.iter().position(|&c| c == b).map(|p| p as u32).unwrap_or(0)
            };
        }
        let n = (vals[0] << 18) | (vals[1] << 12) | (vals[2] << 6) | vals[3];
        result.push((n >> 16) as u8);
        if pad < 2 {
            result.push((n >> 8) as u8);
        }
        if pad < 1 {
            result.push(n as u8);
        }
    }
    Some(result)
}

fn execute_json_format(action: &str, input: &str) -> String {
    match action {
        "format" => match serde_json::from_str::<serde_json::Value>(input) {
            Ok(v) => serde_json::to_string_pretty(&v).unwrap_or_else(|_| "Invalid JSON".into()),
            Err(e) => format!("Parse error: {}", e),
        },
        "minify" => match serde_json::from_str::<serde_json::Value>(input) {
            Ok(v) => serde_json::to_string(&v).unwrap_or_else(|_| "Invalid JSON".into()),
            Err(e) => format!("Parse error: {}", e),
        },
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
    let mut buf = [0u8; 16];
    getrandom::getrandom(&mut buf).ok();
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        buf[0], buf[1], buf[2], buf[3], buf[4], buf[5], buf[6], buf[7], buf[8], buf[9], buf[10], buf[11], buf[12], buf[13], buf[14], buf[15]
    )
}

// ============ Encoding Tools ============

fn execute_encoding(action: &str, input: &str) -> String {
    match action {
        "encode" | "url-encode" => tools::encoding::url_encode(input.into()),
        "decode" | "url-decode" => tools::encoding::url_decode(input.into()),
        _ => "Unknown action. Use 'encode' or 'decode'".into(),
    }
}

fn execute_html(action: &str, input: &str) -> String {
    match action {
        "encode" => tools::encoding::html_encode(input.into()),
        "decode" => tools::encoding::html_decode(input.into()),
        _ => "Unknown action. Use 'encode' or 'decode'".into(),
    }
}

fn execute_hex(action: &str, input: &str) -> String {
    match action {
        "encode" => tools::encoding::hex_encode(input.into()),
        "decode" => tools::encoding::hex_decode(input.into()),
        _ => "Unknown action. Use 'encode' or 'decode'".into(),
    }
}

fn execute_md5(input: &str) -> String {
    let result = tools::encoding::md5_hash(input.into());
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_sha256(input: &str) -> String {
    let result = tools::encoding::sha256_hash(input.into());
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

// ============ Text Tools ============

fn execute_text_diff(input: &str) -> String {
    // input format: text1\ntext2 separated by a special delimiter
    // We use "\n---DIFF_SEPARATOR---\n" as delimiter
    let parts: Vec<&str> = input.splitn(2, "\n---DIFF_SEPARATOR---\n").collect();
    if parts.len() != 2 {
        return "Error: Input must contain two texts separated by '---DIFF_SEPARATOR---'".into();
    }
    let result = tools::text::text_diff(parts[0].into(), parts[1].into());
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_text_case(action: &str, input: &str) -> String {
    tools::text::text_case(input.into(), action.into())
}

fn execute_text_dedup(input: &str) -> String {
    tools::text::text_deduplicate(input.into())
}

fn execute_text_sort(action: &str, input: &str) -> String {
    let order = if action == "desc" || action == "descending" || action == "reverse" {
        Some("desc".to_string())
    } else {
        None
    };
    tools::text::text_sort(input.into(), order)
}

fn execute_text_stats(input: &str) -> String {
    let result = tools::text::text_stats(input.into());
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_text_reverse(input: &str) -> String {
    tools::text::text_reverse(input.into())
}

fn execute_lorem_ipsum(input: &str) -> String {
    let count: usize = input.trim().parse().unwrap_or(5);
    tools::text::lorem_ipsum(Some(count))
}

// ============ Crypto Tools ============

fn execute_aes(action: &str, input: &str) -> String {
    // input format: key|||data
    let parts: Vec<&str> = input.splitn(2, "|||").collect();
    if parts.len() != 2 {
        return "Error: Input must be 'key|||data' (key and data separated by |||)".into();
    }
    let key = parts[0];
    let data = parts[1];

    match action {
        "encrypt" | "encode" => {
            let result = tools::crypto::aes_encrypt(data.into(), key.into());
            serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
        }
        "decrypt" | "decode" => {
            let result = tools::crypto::aes_decrypt(data.into(), key.into());
            serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
        }
        _ => "Unknown action. Use 'encrypt' or 'decrypt'".into(),
    }
}

fn execute_jwt(input: &str) -> String {
    let result = tools::crypto::jwt_decode(input.into());
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_password_gen(action: &str, input: &str) -> String {
    // input can be a JSON with options or just a length number
    let (length, uppercase, lowercase, numbers, symbols) = if input.trim().starts_with('{') {
        if let Ok(opts) = serde_json::from_str::<serde_json::Value>(input) {
            (
                opts.get("length").and_then(|v| v.as_u64()).map(|v| v as usize),
                opts.get("uppercase").and_then(|v| v.as_bool()),
                opts.get("lowercase").and_then(|v| v.as_bool()),
                opts.get("numbers").and_then(|v| v.as_bool()),
                opts.get("symbols").and_then(|v| v.as_bool()),
            )
        } else {
            (None, None, None, None, None)
        }
    } else if let Ok(len) = input.trim().parse::<usize>() {
        (Some(len), None, None, None, None)
    } else {
        (None, None, None, None, None)
    };

    let _ = action; // action unused for password gen
    let result = tools::crypto::password_generate(length, uppercase, lowercase, numbers, symbols);
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_password_check(input: &str) -> String {
    let result = tools::crypto::password_check(input.into());
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

// ============ Convert Tools ============

fn execute_color(input: &str) -> String {
    let result = tools::convert::color_convert(input.into(), None);
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_base_convert(action: &str, input: &str) -> String {
    let from_base: u32 = action.parse().unwrap_or(10);
    let result = tools::convert::base_convert(input.into(), Some(from_base));
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_unit_convert(action: &str, input: &str) -> String {
    // input format: value|from_unit|to_unit
    // action is the category
    let parts: Vec<&str> = input.split('|').collect();
    if parts.len() != 3 {
        return "Error: Input must be 'value|from_unit|to_unit'".into();
    }
    let value: f64 = match parts[0].trim().parse() {
        Ok(v) => v,
        Err(_) => return "Error: Invalid numeric value".into(),
    };
    let result = tools::convert::unit_convert(value, parts[1].trim().into(), parts[2].trim().into(), action.into());
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_exchange(action: &str, input: &str) -> String {
    // action is ignored; input format: amount|from_currency|to_currency
    let parts: Vec<&str> = input.split('|').collect();
    if parts.len() != 3 {
        return "Error: Input must be 'amount|from_currency|to_currency'".into();
    }
    let amount: f64 = match parts[0].trim().parse() {
        Ok(v) => v,
        Err(_) => return "Error: Invalid amount".into(),
    };
    let _ = action;
    let result = tools::convert::exchange_convert(amount, parts[1].trim().into(), parts[2].trim().into());
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_cron(input: &str) -> String {
    let result = tools::convert::cron_parse(input.into());
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

// ============ Network Tools ============

fn execute_http(action: &str, input: &str) -> String {
    // action is the HTTP method (GET/POST/PUT/DELETE)
    // input format: url|||body  OR  url  (for GET)
    // headers can be passed as JSON in the format: url|||body|||{"key":"value"}
    let parts: Vec<&str> = input.splitn(3, "|||").collect();
    let url = parts.get(0).map(|s| s.to_string()).unwrap_or_default();
    let body = parts.get(1).filter(|s| !s.is_empty()).map(|s| s.to_string());
    let headers: Option<std::collections::HashMap<String, String>> = parts
        .get(2)
        .filter(|s| !s.is_empty())
        .and_then(|s| serde_json::from_str(s).ok());

    let result = tools::network::http_request(url, action.into(), body, headers);
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_ip(action: &str, input: &str) -> String {
    match action {
        "lookup" | "info" => {
            let result = tools::network::ip_lookup(input.into());
            serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
        }
        "subnet" => {
            // input format: ip/cidr or ip cidr
            let input = input.trim();
            let (ip, cidr) = if let Some(pos) = input.find('/') {
                (&input[..pos], input[pos + 1..].parse::<u8>().unwrap_or(24))
            } else {
                let parts: Vec<&str> = input.split_whitespace().collect();
                if parts.len() == 2 {
                    (parts[0], parts[1].parse::<u8>().unwrap_or(24))
                } else {
                    (input, 24u8)
                }
            };
            let result = tools::network::subnet_calculate(ip.into(), cidr);
            serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
        }
        _ => "Unknown action. Use 'lookup' or 'subnet'".into(),
    }
}

fn execute_dns(input: &str) -> String {
    let result = tools::network::dns_lookup_guide(if input.is_empty() { None } else { Some(input.into()) });
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}

fn execute_port(action: &str, input: &str) -> String {
    // input format: host:port or just port
    let (host, port) = if let Some(pos) = input.find(':') {
        (&input[..pos], input[pos + 1..].parse::<u16>().unwrap_or(0))
    } else {
        ("", input.trim().parse::<u16>().unwrap_or(0))
    };
    let _ = action;
    let result = tools::network::port_check_guide(Some(host.into()), Some(port));
    serde_json::to_string_pretty(&result).unwrap_or_else(|_| "Error".into())
}
