use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;

// ============ Tauri Commands ============

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

#[derive(Serialize, Deserialize, Clone)]
pub struct IpInfo {
    pub ip: String,
    pub is_valid: bool,
    pub version: String,
    pub is_private: bool,
    pub is_loopback: bool,
    pub binary: String,
    pub network_class: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SubnetInfo {
    pub ip: String,
    pub cidr: u8,
    pub subnet_mask: String,
    pub network_address: String,
    pub broadcast_address: String,
    pub first_host: String,
    pub last_host: String,
    pub total_hosts: u64,
    pub usable_hosts: u64,
    pub ip_class: String,
    pub valid: bool,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DnsInfo {
    pub query: String,
    pub record_type: String,
    pub records: Vec<String>,
    pub note: String,
    pub guide: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PortInfo {
    pub host: String,
    pub port: u16,
    pub is_open: bool,
    pub common_service: String,
    pub note: String,
    pub guide: String,
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
        req.headers(h.iter().map(|(k, v)| {
            (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()).unwrap_or(reqwest::header::ACCEPT),
                reqwest::header::HeaderValue::from_str(v).unwrap_or(reqwest::header::HeaderValue::from_static("")),
            )
        }).collect())
    } else {
        req
    };

    let req = if let Some(b) = body {
        req.body(b)
    } else {
        req
    };

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
                error: if status >= 400 { Some(format!("HTTP {}", status)) } else { None },
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

#[tauri::command]
pub fn ip_lookup(ip: String) -> IpInfo {
    let ip = ip.trim();
    let parts: Vec<&str> = ip.split('.').collect();

    if parts.len() != 4 {
        return IpInfo {
            ip: ip.to_string(),
            is_valid: false,
            version: "Unknown".into(),
            is_private: false,
            is_loopback: false,
            binary: String::new(),
            network_class: String::new(),
            message: "Invalid IPv4 address format".into(),
        };
    }

    let octets: Vec<u8> = parts.iter().filter_map(|p| p.parse().ok()).collect();
    if octets.len() != 4 {
        return IpInfo {
            ip: ip.to_string(),
            is_valid: false,
            version: "Unknown".into(),
            is_private: false,
            is_loopback: false,
            binary: String::new(),
            network_class: String::new(),
            message: "Invalid IPv4 octets".into(),
        };
    }

    let is_loopback = octets[0] == 127;
    let is_private = (octets[0] == 10)
        || (octets[0] == 172 && (16..=31).contains(&octets[1]))
        || (octets[0] == 192 && octets[1] == 168);

    let network_class = if octets[0] < 128 {
        "Class A"
    } else if octets[0] < 192 {
        "Class B"
    } else if octets[0] < 224 {
        "Class C"
    } else if octets[0] < 240 {
        "Class D (Multicast)"
    } else {
        "Class E (Reserved)"
    };

    let binary: String = octets
        .iter()
        .map(|o| format!("{:08b}", o))
        .collect::<Vec<_>>()
        .join(".");

    let message = if is_loopback {
        "Loopback address (127.0.0.0/8) - used for local testing".to_string()
    } else if is_private {
        "Private IP address - not routable on the public internet".to_string()
    } else {
        "Public IP address".to_string()
    };

    IpInfo {
        ip: ip.to_string(),
        is_valid: true,
        version: "IPv4".into(),
        is_private,
        is_loopback,
        binary,
        network_class: network_class.into(),
        message,
    }
}

#[tauri::command]
pub fn subnet_calculate(ip: String, cidr: u8) -> SubnetInfo {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 {
        return SubnetInfo {
            ip: ip.to_string(),
            cidr,
            subnet_mask: String::new(),
            network_address: String::new(),
            broadcast_address: String::new(),
            first_host: String::new(),
            last_host: String::new(),
            total_hosts: 0,
            usable_hosts: 0,
            ip_class: String::new(),
            valid: false,
            message: "Invalid IP format".into(),
        };
    }

    let octets: Vec<u8> = parts.iter().filter_map(|p| p.parse().ok()).collect();
    if octets.len() != 4 || cidr > 32 {
        return SubnetInfo {
            ip: ip.to_string(),
            cidr,
            subnet_mask: String::new(),
            network_address: String::new(),
            broadcast_address: String::new(),
            first_host: String::new(),
            last_host: String::new(),
            total_hosts: 0,
            usable_hosts: 0,
            ip_class: String::new(),
            valid: false,
            message: "Invalid IP or CIDR".into(),
        };
    }

    // Convert IP to u32
    let ip_num: u32 = ((octets[0] as u32) << 24)
        | ((octets[1] as u32) << 16)
        | ((octets[2] as u32) << 8)
        | (octets[3] as u32);

    // Calculate mask
    let mask: u32 = if cidr == 0 { 0 } else { (!0u32) << (32 - cidr) };

    // Network address
    let network = ip_num & mask;
    // Broadcast address
    let broadcast = network | (!mask);

    // Subnet mask string
    let mask_octets = [
        (mask >> 24) as u8,
        (mask >> 16) as u8,
        (mask >> 8) as u8,
        mask as u8,
    ];
    let subnet_mask = format!("{}.{}.{}.{}", mask_octets[0], mask_octets[1], mask_octets[2], mask_octets[3]);

    let network_str = format!(
        "{}.{}.{}.{}",
        (network >> 24) as u8,
        (network >> 16) as u8,
        (network >> 8) as u8,
        network as u8
    );

    let broadcast_str = format!(
        "{}.{}.{}.{}",
        (broadcast >> 24) as u8,
        (broadcast >> 16) as u8,
        (broadcast >> 8) as u8,
        broadcast as u8
    );

    let total_hosts: u64 = if cidr >= 32 { 1 } else { (1u64 << (32 - cidr)) };
    let usable_hosts: u64 = if cidr >= 31 { 0 } else { total_hosts.saturating_sub(2) };

    // First and last host
    let first_host = if total_hosts > 2 { network + 1 } else { network };
    let last_host = if total_hosts > 2 { broadcast - 1 } else { broadcast };

    let first_host_str = format!(
        "{}.{}.{}.{}",
        (first_host >> 24) as u8,
        (first_host >> 16) as u8,
        (first_host >> 8) as u8,
        first_host as u8
    );

    let last_host_str = format!(
        "{}.{}.{}.{}",
        (last_host >> 24) as u8,
        (last_host >> 16) as u8,
        (last_host >> 8) as u8,
        last_host as u8
    );

    let ip_class = if octets[0] < 128 {
        "Class A"
    } else if octets[0] < 192 {
        "Class B"
    } else if octets[0] < 224 {
        "Class C"
    } else if octets[0] < 240 {
        "Class D (Multicast)"
    } else {
        "Class E (Reserved)"
    };

    SubnetInfo {
        ip: ip.to_string(),
        cidr,
        subnet_mask,
        network_address: network_str,
        broadcast_address: broadcast_str,
        first_host: first_host_str,
        last_host: last_host_str,
        total_hosts,
        usable_hosts,
        ip_class: ip_class.into(),
        valid: true,
        message: format!("/{}` subnet with {} usable hosts", cidr, usable_hosts),
    }
}

#[tauri::command]
pub fn dns_lookup_guide(domain: Option<String>) -> DnsInfo {
    let query = domain.unwrap_or_default();
    let guide = r#"DNS查询工具说明:

DNS (Domain Name System) 是互联网的电话簿，将域名翻译为IP地址。

常见记录类型:
  • A记录     - 域名 -> IPv4地址
  • AAAA记录  - 域名 -> IPv6地址
  • CNAME记录 - 域名别名
  • MX记录    - 邮件交换服务器
  • TXT记录   - 文本记录(SPF/DKIM等)
  • NS记录    - 域名服务器
  • SOA记录   - 授权起始记录
  • PTR记录   - IP地址 -> 域名 (反向解析)

查询方法:
  • 命令行: nslookup / dig / host
  • 示例:   nslookup example.com
            dig example.com MX
            dig @8.8.8.8 example.com

常见公共DNS服务器:
  • Google:     8.8.8.8 / 8.8.4.4
  • Cloudflare: 1.1.1.1 / 1.0.0.1
  • 阿里DNS:    223.5.5.5 / 223.6.6.6
  • 114DNS:     114.114.114.114"#;

    DnsInfo {
        query,
        record_type: "ALL".into(),
        records: vec![
            "由于沙箱限制，此工具不执行实际DNS查询".into(),
            "请使用命令行工具或在线DNS查询服务".into(),
            "推荐: nslookup, dig, 或 https://dnschecker.org".into(),
        ],
        note: "DNS查询说明工具 - 此工具返回DNS查询的说明和指南，而非实际查询结果(受沙箱网络限制)".into(),
        guide: guide.to_string(),
    }
}

#[tauri::command]
pub fn port_check_guide(host: Option<String>, port: Option<u16>) -> PortInfo {
    let host = host.unwrap_or_default();
    let port = port.unwrap_or(0);

    let common_ports: HashMap<u16, &str> = [
        (21, "FTP - File Transfer Protocol"),
        (22, "SSH - Secure Shell"),
        (23, "Telnet"),
        (25, "SMTP - Simple Mail Transfer Protocol"),
        (53, "DNS - Domain Name System"),
        (80, "HTTP - HyperText Transfer Protocol"),
        (110, "POP3 - Post Office Protocol v3"),
        (143, "IMAP - Internet Message Access Protocol"),
        (443, "HTTPS - HTTP Secure"),
        (445, "SMB - Server Message Block"),
        (3306, "MySQL Database"),
        (3389, "RDP - Remote Desktop Protocol"),
        (5432, "PostgreSQL Database"),
        (6379, "Redis"),
        (8080, "HTTP Alternate / Proxy"),
        (8443, "HTTPS Alternate"),
        (27017, "MongoDB"),
        (9200, "Elasticsearch"),
    ]
    .iter()
    .copied()
    .collect();

    let service = common_ports.get(&port).map(|s| s.to_string()).unwrap_or_else(|| {
        if port > 0 {
            format!("Port {} - Unknown/Custom service", port)
        } else {
            "No port specified".to_string()
        }
    });

    let guide = r#"端口检查工具说明:

端口状态:
  • open (开放)     - 有服务在监听该端口
  • closed (关闭)   - 端口可达但无服务监听
  • filtered (过滤) - 防火墙阻止了探测

检查方法:
  • 命令行: telnet <host> <port>
            nc -zv <host> <port>
            nmap <host> -p <port>

常用端口范围:
  • 0-1023:    公认端口 (Well-known)
  • 1024-49151: 注册端口 (Registered)
  • 49152-65535: 动态/私有端口 (Dynamic/Private)

安全提示:
  • 仅检查你有权限测试的主机
  • 开放端口越多，攻击面越大
  • 建议关闭不必要的服务和端口"#;

    PortInfo {
        host,
        port,
        is_open: false,
        common_service: service,
        note: "端口检查说明工具 - 返回端口信息和检查方法指南(受沙箱网络限制，不执行实际连接)".into(),
        guide: guide.to_string(),
    }
}
