use serde::{Deserialize, Serialize};
use winreg::enums::*;
use winreg::RegKey;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub enabled: bool,
    pub server: String,
    pub bypass: Vec<String>,
}

#[tauri::command]
pub async fn get_proxy() -> Result<ProxyConfig, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let internet_settings = hkcu
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .map_err(|e| format!("打开注册表失败: {}", e))?;

    let proxy_enable: u32 = internet_settings
        .get_value("ProxyEnable")
        .unwrap_or(0);

    let proxy_server: String = internet_settings
        .get_value("ProxyServer")
        .unwrap_or_else(|_| "".to_string());

    let proxy_override: String = internet_settings
        .get_value("ProxyOverride")
        .unwrap_or_else(|_| "".to_string());

    let bypass = if proxy_override.is_empty() {
        Vec::new()
    } else {
        proxy_override.split(';').map(|s| s.trim().to_string()).collect()
    };

    Ok(ProxyConfig {
        enabled: proxy_enable != 0,
        server: proxy_server,
        bypass,
    })
}

#[tauri::command]
pub async fn set_proxy(
    enabled: bool,
    server: String,
    bypass: Vec<String>,
) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (internet_settings, _) = hkcu
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .map_err(|e| format!("打开注册表失败: {}", e))?;

    internet_settings
        .set_value("ProxyEnable", &(if enabled { 1u32 } else { 0u32 }))
        .map_err(|e| format!("设置代理状态失败: {}", e))?;

    if enabled {
        internet_settings
            .set_value("ProxyServer", &server)
            .map_err(|e| format!("设置代理服务器失败: {}", e))?;

        let bypass_str = if bypass.is_empty() {
            "".to_string()
        } else {
            bypass.join(";")
        };

        internet_settings
            .set_value("ProxyOverride", &bypass_str)
            .map_err(|e| format!("设置代理绕过列表失败: {}", e))?;
    }

    // 通知系统代理设置已更改
    unsafe {
        use winapi::um::wininet::InternetSetOptionW;
        use winapi::um::wininet::INTERNET_OPTION_SETTINGS_CHANGED;
        use winapi::um::wininet::INTERNET_OPTION_REFRESH;
        
        InternetSetOptionW(
            std::ptr::null_mut(),
            INTERNET_OPTION_SETTINGS_CHANGED,
            std::ptr::null_mut(),
            0,
        );
        InternetSetOptionW(
            std::ptr::null_mut(),
            INTERNET_OPTION_REFRESH,
            std::ptr::null_mut(),
            0,
        );
    }

    Ok(())
}
