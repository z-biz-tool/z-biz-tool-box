use tauri::Manager;

mod commands;
mod plugin_engine;
mod tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Original commands
            commands::greet,
            plugin_engine::list_plugins,
            plugin_engine::execute_plugin,
            // Encoding tools
            tools::encoding::url_encode,
            tools::encoding::url_decode,
            tools::encoding::html_encode,
            tools::encoding::html_decode,
            tools::encoding::hex_encode,
            tools::encoding::hex_decode,
            tools::encoding::md5_hash,
            tools::encoding::sha256_hash,
            // Text tools
            tools::text::text_diff,
            tools::text::text_case,
            tools::text::text_deduplicate,
            tools::text::text_sort,
            tools::text::text_stats,
            tools::text::text_reverse,
            tools::text::lorem_ipsum,
            // Crypto tools
            tools::crypto::aes_encrypt,
            tools::crypto::aes_decrypt,
            tools::crypto::jwt_decode,
            tools::crypto::password_generate,
            tools::crypto::password_check,
            // Convert tools
            tools::convert::color_convert,
            tools::convert::base_convert,
            tools::convert::unit_convert,
            tools::convert::exchange_convert,
            tools::convert::cron_parse,
            // Network tools
            tools::network::http_request,
            tools::network::ip_lookup,
            tools::network::subnet_calculate,
            tools::network::dns_lookup_guide,
            tools::network::port_check_guide,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
