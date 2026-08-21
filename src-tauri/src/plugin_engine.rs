// Plugin engine — 大幅瘦身: 只保留真正有 Rust 价值的命令
// (HTTP 请求支持 30s timeout + 禁用证书验证, 浏览器 fetch 做不到)。
//
// 编码/文本/转换/加密/UUID/时间戳等工具全部由前端 JS 实现
// (Web Crypto API / 原生 API 已足够, Rust 重复实现是 浪费 ~2500 LOC)。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;

#[derive(Serialize, Deserialize, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub elapsed_ms: u128,
    pub url: String,
    pub method: String,
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub fn http_request(
    url: String,
    method: String,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> HttpResponse {
    let start = Instant::now();
    let m = method.to_uppercase();

    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return HttpResponse {
                status: 0,
                status_text: "Client Error".into(),
                headers: HashMap::new(),
                body: String::new(),
                elapsed_ms: start.elapsed().as_millis(),
                url,
                method: m,
                success: false,
                error: Some(format!("Failed to create HTTP client: {}", e)),
            };
        }
    };

    let req = match m.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        "HEAD" => client.head(&url),
        _ => {
            return HttpResponse {
                status: 0,
                status_text: "Invalid Method".into(),
                headers: HashMap::new(),
                body: String::new(),
                elapsed_ms: start.elapsed().as_millis(),
                url,
                method: m.clone(),
                success: false,
                error: Some(format!("Unsupported HTTP method: {}", m)),
            };
        }
    };

    let req = if let Some(h) = headers {
        req.headers(
            h.iter()
                .map(|(k, v)| {
                    (
                        reqwest::header::HeaderName::from_bytes(k.as_bytes())
                            .unwrap_or(reqwest::header::ACCEPT),
                        reqwest::header::HeaderValue::from_str(v)
                            .unwrap_or(reqwest::header::HeaderValue::from_static("")),
                    )
                })
                .collect(),
        )
    } else {
        req
    };

    let req = if let Some(b) = body { req.body(b) } else { req };

    match req.send() {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let status_text = resp.status().canonical_reason().unwrap_or("").to_string();

            let mut resp_headers = HashMap::new();
            for (k, v) in resp.headers() {
                resp_headers.insert(k.as_str().to_string(), v.to_str().unwrap_or("").to_string());
            }
            let body = resp.text().unwrap_or_default();

            HttpResponse {
                status,
                status_text,
                headers: resp_headers,
                body,
                elapsed_ms: start.elapsed().as_millis(),
                url,
                method: m,
                success: status >= 200 && status < 300,
                error: if status >= 400 {
                    Some(format!("HTTP {}", status))
                } else {
                    None
                },
            }
        }
        Err(e) => HttpResponse {
            status: 0,
            status_text: "Request Failed".into(),
            headers: HashMap::new(),
            body: String::new(),
            elapsed_ms: start.elapsed().as_millis(),
            url,
            method: m,
            success: false,
            error: Some(format!("{}", e)),
        },
    }
}
