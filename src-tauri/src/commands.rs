use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct GreetResult {
    pub message: String,
}

#[tauri::command]
pub fn greet(name: &str) -> GreetResult {
    GreetResult {
        message: format!("Hello, {}! Welcome to z-biz-tool-box", name),
    }
}
