// Plugin engine — 大幅瘦身: 只保留真正有 Rust 价值的命令
// (HTTP 请求支持 30s timeout 与跨域, 浏览器 fetch 在 Tauri 里做不到)。
//
// 编码/文本/转换/加密/UUID/时间戳等工具全部由前端 JS 实现
// (Web Crypto API / 原生 API 已足够, Rust 重复实现是 浪费 ~2500 LOC)。
//
// ⚠️ 证书校验: 早期版本在这里硬编码 `danger_accept_invalid_certs(true)`,
// 理由是"内网自签证书的 HTTP 调试器用得上"。但这条命令同时经 `zBiz.invoke`
// 的白名单暴露给**所有外部插件** —— 也就是任何插件都能发起免证书校验的
// 请求, 中间人一次就够(插件以为自己连的是内网服务, 实际连的是攻击者)。
// 现在改成: 默认校验证书, 需要放宽必须由调用方**逐次显式**传 insecure=true,
// 且响应里会回带 `insecure: true` 供 UI 标黄 ——
// 放宽是可见的决定, 不是默认状态。

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
    /// 本次请求是否关闭了 TLS 证书校验。
    /// 为 true 时响应内容不可信, 前端必须提示用户。
    #[serde(default)]
    pub insecure: bool,
}

/// 请求里与安全相关的参数, 单独抽出来便于单测与审计。
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct HttpSecurity {
    /// 显式关闭证书校验。默认 false —— 放宽必须由调用方逐次声明。
    #[serde(default)]
    pub insecure: bool,
}

#[tauri::command]
pub fn http_request(
    url: String,
    method: String,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
    security: Option<HttpSecurity>,
) -> HttpResponse {
    let start = Instant::now();
    let m = method.to_uppercase();
    // 缺省一律校验证书; 只有显式传 insecure=true 才放宽。
    let insecure = security.map(|s| s.insecure).unwrap_or(false);

    let mut builder =
        reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(30));
    if insecure {
        builder = builder.danger_accept_invalid_certs(true);
    }
    let client = match builder.build() {
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
                insecure,
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
                insecure,
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
                success: (200..300).contains(&status),
                error: if status >= 400 {
                    Some(format!("HTTP {}", status))
                } else {
                    None
                },
                insecure,
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
            insecure,
        },
    }
}

/// 证书校验的默认值必须恒为 false。
///
/// 写这个测试是因为原先这里是硬编码 `danger_accept_invalid_certs(true)`,
/// 而这条命令经 zBiz.invoke 对**所有外部插件**开放 —— 任何插件都能发起
/// 免证书校验的请求。判据不是"有没有校验", 而是"默认状态下校验没有被关闭":
/// 显式传 insecure=true 的那条路是刻意留的, 但它必须是调用方主动走的。
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 缺省即校验证书_显式声明才放宽() {
        assert!(!HttpSecurity::default().insecure, "缺省不得关闭证书校验");
        assert!(
            !HttpSecurity {
                insecure: false
            }
            .insecure
        );
        // 放宽只能是显式且逐次的
        assert!(HttpSecurity { insecure: true }.insecure);
    }

    #[test]
    fn 不传_security_参数时按缺省处理() {
        // 对应前端 `invoke("http_request", { url, method })` 的旧调用形态:
        // 参数缺失不得被当成"放宽", 否则等于留了个静默的后门。
        let security: Option<HttpSecurity> = None;
        let insecure = security.map(|s| s.insecure).unwrap_or(false);
        assert!(!insecure, "参数缺失时必须走证书校验");
    }

    #[test]
    fn 响应必须回带_insecure_标记_供前端提示() {
        // 放宽是可见的决定: UI 需要据此标黄。
        let r = HttpResponse {
            status: 200,
            status_text: "OK".into(),
            headers: HashMap::new(),
            body: "ok".into(),
            elapsed_ms: 1,
            url: "https://x".into(),
            method: "GET".into(),
            success: true,
            error: None,
            insecure: true,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(
            json.contains("\"insecure\":true"),
            "序列化后必须带出该标记: {}",
            json
        );
    }
}
