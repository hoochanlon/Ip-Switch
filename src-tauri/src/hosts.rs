use std::fs;
use std::path::PathBuf;
use reqwest;

fn get_hosts_path() -> PathBuf {
    PathBuf::from("C:\\Windows\\System32\\drivers\\etc\\hosts")
}

#[tauri::command]
pub async fn get_hosts() -> Result<String, String> {
    let hosts_path = get_hosts_path();
    
    fs::read_to_string(&hosts_path)
        .map_err(|e| format!("读取Hosts文件失败: {}", e))
}

#[tauri::command]
pub async fn set_hosts(content: String) -> Result<(), String> {
    let hosts_path = get_hosts_path();
    
    // 备份原文件
    let backup_path = hosts_path.with_extension("hosts.bak");
    if hosts_path.exists() {
        fs::copy(&hosts_path, &backup_path)
            .map_err(|e| format!("备份Hosts文件失败: {}", e))?;
    }
    
    // 写入新内容
    fs::write(&hosts_path, content)
        .map_err(|e| format!("写入Hosts文件失败: {}. 请确保以管理员权限运行", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn fetch_remote_hosts(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP错误: {} {}", response.status().as_u16(), response.status().as_str()));
    }
    
    let content = response
        .text()
        .await
        .map_err(|e| format!("读取响应内容失败: {}", e))?;
    
    if content.trim().is_empty() {
        return Err("远程内容为空".to_string());
    }
    
    Ok(content)
}
