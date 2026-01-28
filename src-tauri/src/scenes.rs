use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct Scene {
    pub name: String,
    pub network_configs: HashMap<String, NetworkConfig>,
    pub hosts_content: Option<String>,
    pub proxy_config: Option<ProxyConfig>,
    #[serde(default)]
    pub tray_color: Option<String>, // 托盘图标颜色（十六进制，如 "#3366FF"）
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkConfig {
    pub is_dhcp: bool,
    pub ip: Option<String>,
    pub subnet: Option<String>,
    pub gateway: Option<String>,
    pub dns: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProxyConfig {
    pub enabled: bool,
    pub server: String,
    pub bypass: Vec<String>,
}

fn get_scenes_dir() -> PathBuf {
    // legacy: scenes folder next to the executable
    let mut path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    path.pop();
    path.push("scenes");
    path
}

fn get_scenes_dir_in_documents(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Prefer Documents\IP Switch\scenes on Windows (also works cross-platform when available).
    // Fallback to app data dir if documents dir is unavailable.
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("获取用户目录失败: {}", e))?;
    Ok(base.join("IP Switch").join("scenes"))
}

fn is_dir_empty(dir: &PathBuf) -> bool {
    match fs::read_dir(dir) {
        Ok(mut it) => it.next().is_none(),
        Err(_) => true,
    }
}

fn migrate_legacy_scenes_if_needed(legacy: &PathBuf, target: &PathBuf) -> Result<(), String> {
    if !legacy.exists() {
        return Ok(());
    }
    // Only migrate if target is empty (avoid overwriting user data)
    if target.exists() && !is_dir_empty(target) {
        return Ok(());
    }

    fs::create_dir_all(target).map_err(|e| format!("创建场景目录失败: {}", e))?;
    let entries = fs::read_dir(legacy).map_err(|e| format!("读取旧场景目录失败: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取旧场景文件失败: {}", e))?;
        let from = entry.path();
        if !from.is_file() {
            continue;
        }
        let Some(name) = from.file_name() else { continue; };
        let to = target.join(name);
        // Try rename first; fallback to copy+remove (cross-device / permissions)
        if fs::rename(&from, &to).is_err() {
            fs::copy(&from, &to).map_err(|e| format!("迁移场景文件失败: {}", e))?;
            let _ = fs::remove_file(&from);
        }
    }
    Ok(())
}

fn ensure_scenes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = get_scenes_dir_in_documents(app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建场景目录失败: {}", e))?;

    // Best-effort migration from legacy location (exe\scenes)
    let legacy = get_scenes_dir();
    let _ = migrate_legacy_scenes_if_needed(&legacy, &dir);

    Ok(dir)
}

#[tauri::command]
pub async fn get_scenes(app: tauri::AppHandle) -> Result<Vec<Scene>, String> {
    let scenes_dir = ensure_scenes_dir(&app)?;
    let mut scenes = Vec::new();

    let entries = fs::read_dir(&scenes_dir)
        .map_err(|e| format!("读取场景目录失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取场景文件失败: {}", e))?;
        let path = entry.path();
        
        // 跳过备份文件，不显示在场景列表中
        if let Some(file_name) = path.file_stem().and_then(|s| s.to_str()) {
            if file_name.starts_with("_backup_") {
                continue;
            }
        }
        
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(scene) = serde_json::from_str::<Scene>(&content) {
                    scenes.push(scene);
                }
            }
        }
    }

    Ok(scenes)
}

#[tauri::command]
pub async fn save_scene(app: tauri::AppHandle, scene_name: String) -> Result<(), String> {
    let scenes_dir = ensure_scenes_dir(&app)?;
    
    // 获取当前网络配置
    use crate::network::get_network_info;
    let adapters = get_network_info().await?;
    
    let mut network_configs = HashMap::new();
    for adapter in adapters {
        network_configs.insert(adapter.name.clone(), NetworkConfig {
            is_dhcp: adapter.is_dhcp,
            ip: adapter.ip_address.clone(),
            subnet: adapter.subnet_mask.clone(),
            gateway: adapter.gateway.clone(),
            dns: adapter.dns_servers.clone(),
        });
    }
    
    // 获取当前Hosts内容
    use crate::hosts::get_hosts;
    let hosts_content = get_hosts().await.ok();
    
    // 获取当前代理配置
    use crate::proxy::get_proxy;
    let proxy_config = get_proxy().await.ok().map(|p| ProxyConfig {
        enabled: p.enabled,
        server: p.server,
        bypass: p.bypass,
    });
    
    let scene = Scene {
        name: scene_name.clone(),
        network_configs,
        hosts_content,
        proxy_config,
        tray_color: None, // 保存场景时默认不设置托盘颜色
    };
    
    let scene_file = scenes_dir.join(format!("{}.json", scene_name));
    let content = serde_json::to_string_pretty(&scene)
        .map_err(|e| format!("序列化场景失败: {}", e))?;
    
    fs::write(&scene_file, content)
        .map_err(|e| format!("保存场景失败: {}", e))?;
    
    Ok(())
}

/// 保存当前网络配置为备份（在应用场景前调用，只备份网卡IP配置）
#[tauri::command]
pub async fn save_backup(app: tauri::AppHandle) -> Result<(), String> {
    let scenes_dir = ensure_scenes_dir(&app)?;
    
    // 只获取当前网络配置（不涉及Hosts和代理）
    use crate::network::get_network_info;
    let adapters = get_network_info().await?;
    
    let mut network_configs = HashMap::new();
    for adapter in adapters {
        network_configs.insert(adapter.name.clone(), NetworkConfig {
            is_dhcp: adapter.is_dhcp,
            ip: adapter.ip_address.clone(),
            subnet: adapter.subnet_mask.clone(),
            gateway: adapter.gateway.clone(),
            dns: adapter.dns_servers.clone(),
        });
    }
    
    // 只备份网络配置，不备份Hosts和代理
    let backup = Scene {
        name: "_backup_before_scene".to_string(),
        network_configs,
        hosts_content: None,  // 不备份Hosts
        proxy_config: None,  // 不备份代理
        tray_color: None,
    };
    
    let backup_file = scenes_dir.join("_backup_before_scene.json");
    let content = serde_json::to_string_pretty(&backup)
        .map_err(|e| format!("序列化备份失败: {}", e))?;
    
    fs::write(&backup_file, content)
        .map_err(|e| format!("保存备份失败: {}", e))?;
    
    Ok(())
}

/// 恢复备份配置（解除场景，只恢复网卡IP配置）
#[tauri::command]
pub async fn restore_backup(app: tauri::AppHandle) -> Result<(), String> {
    let scenes_dir = ensure_scenes_dir(&app)?;
    let backup_file = scenes_dir.join("_backup_before_scene.json");
    
    if !backup_file.exists() {
        return Err("没有找到备份配置".to_string());
    }
    
    let content = fs::read_to_string(&backup_file)
        .map_err(|e| format!("读取备份文件失败: {}", e))?;
    
    let backup: Scene = serde_json::from_str(&content)
        .map_err(|e| format!("解析备份文件失败: {}", e))?;
    
    // 只恢复网络配置（不恢复Hosts和代理）
    use crate::network::{set_static_ip, set_dhcp};
    for (adapter_name, config) in backup.network_configs {
        if config.is_dhcp {
            set_dhcp(adapter_name).await?;
        } else if let (Some(ip), Some(subnet), Some(gateway)) = (config.ip, config.subnet, config.gateway) {
            set_static_ip(
                adapter_name,
                ip,
                subnet,
                gateway,
                config.dns.unwrap_or_default(),
            ).await?;
        }
    }
    
    // 不恢复Hosts和代理配置，场景只管理网卡IP
    
    Ok(())
}

/// 检查是否存在备份
#[tauri::command]
pub async fn has_backup(app: tauri::AppHandle) -> Result<bool, String> {
    let scenes_dir = ensure_scenes_dir(&app)?;
    let backup_file = scenes_dir.join("_backup_before_scene.json");
    Ok(backup_file.exists())
}

#[tauri::command]
pub async fn apply_scene(app: tauri::AppHandle, scene_name: String) -> Result<(), String> {
    // 在应用场景前，先保存当前配置为备份
    save_backup(app.clone()).await?;
    
    let scenes_dir = ensure_scenes_dir(&app)?;
    let scene_file = scenes_dir.join(format!("{}.json", scene_name));
    
    let content = fs::read_to_string(&scene_file)
        .map_err(|e| format!("读取场景文件失败: {}", e))?;
    
    let scene: Scene = serde_json::from_str(&content)
        .map_err(|e| format!("解析场景文件失败: {}", e))?;
    
    // 只应用网络配置（场景只管理网卡IP配置，不涉及Hosts和代理）
    // 串行执行所有网卡的配置，确保每个配置都成功应用
    use crate::network::{set_static_ip, set_dhcp};
    
    for (adapter_name, config) in scene.network_configs {
        let adapter_name_clone = adapter_name.clone();
        if config.is_dhcp {
            set_dhcp(adapter_name).await
                .map_err(|e| format!("应用网卡 {} 的DHCP配置失败: {}", adapter_name_clone, e))?;
        } else if let (Some(ip), Some(subnet), Some(gateway)) = (config.ip, config.subnet, config.gateway) {
            let dns = config.dns.unwrap_or_default();
            set_static_ip(
                adapter_name.clone(),
                ip,
                subnet,
                gateway,
                dns,
            ).await
                .map_err(|e| format!("应用网卡 {} 的静态IP配置失败: {}", adapter_name, e))?;
        }
    }
    
    // 不应用Hosts和代理配置，场景只管理网卡IP
    
    // 注意：托盘颜色更新需要在调用 apply_scene 时传入 AppHandle
    // 这里暂时不处理，由前端调用 update_tray_icon_color
    
    Ok(())
}

#[tauri::command]
pub async fn update_scene(
    app: tauri::AppHandle,
    scene_name: String,
    network_configs: HashMap<String, NetworkConfig>,
    hosts_content: Option<String>,
    proxy_config: Option<ProxyConfig>,
    tray_color: Option<String>,
) -> Result<(), String> {
    let scenes_dir = ensure_scenes_dir(&app)?;
    let scene_file = scenes_dir.join(format!("{}.json", scene_name));
    
    // 读取现有场景（如果存在）
    let mut scene = if scene_file.exists() {
        let content = fs::read_to_string(&scene_file)
            .map_err(|e| format!("读取场景文件失败: {}", e))?;
        serde_json::from_str::<Scene>(&content)
            .map_err(|e| format!("解析场景文件失败: {}", e))?
    } else {
        Scene {
            name: scene_name.clone(),
            network_configs: HashMap::new(),
            hosts_content: None,
            proxy_config: None,
            tray_color: None,
        }
    };
    
    // 更新网络配置
    scene.network_configs = network_configs;
    
    // 更新Hosts内容（如果提供）
    if let Some(hosts) = hosts_content {
        scene.hosts_content = Some(hosts);
    }
    
    // 更新代理配置（如果提供）
    if let Some(proxy) = proxy_config {
        scene.proxy_config = Some(proxy);
    }
    
    // 更新托盘颜色（如果提供）
    if let Some(color) = tray_color {
        scene.tray_color = Some(color);
    }
    
    // 保存场景
    let content = serde_json::to_string_pretty(&scene)
        .map_err(|e| format!("序列化场景失败: {}", e))?;
    
    fs::write(&scene_file, content)
        .map_err(|e| format!("保存场景失败: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn delete_scene(app: tauri::AppHandle, scene_name: String) -> Result<(), String> {
    let scenes_dir = ensure_scenes_dir(&app)?;
    let scene_file = scenes_dir.join(format!("{}.json", scene_name));
    
    fs::remove_file(&scene_file)
        .map_err(|e| format!("删除场景文件失败: {}", e))?;
    
    Ok(())
}

/// 导出所有场景到指定文件（JSON）
#[tauri::command]
pub async fn export_scenes(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let scenes = get_scenes(app).await?;
    let content = serde_json::to_string_pretty(&scenes)
        .map_err(|e| format!("序列化场景列表失败: {}", e))?;
    fs::write(&file_path, content)
        .map_err(|e| format!("写入导出文件失败: {}", e))?;
    Ok(())
}

/// 从指定文件导入场景列表（JSON），会覆盖同名场景
#[tauri::command]
pub async fn import_scenes(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let scenes_dir = ensure_scenes_dir(&app)?;
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("读取导入文件失败: {}", e))?;
    
    let imported: Vec<Scene> = serde_json::from_str(&content)
        .map_err(|e| format!("解析导入文件失败: {}", e))?;
    
    for scene in imported {
        let scene_file = scenes_dir.join(format!("{}.json", scene.name));
        let scene_content = serde_json::to_string_pretty(&scene)
            .map_err(|e| format!("序列化场景失败: {}", e))?;
        fs::write(&scene_file, scene_content)
            .map_err(|e| format!("写入场景文件失败: {}", e))?;
    }
    
    Ok(())
}

/// 以 JSON 字符串形式导出所有场景（给前端下载用）
#[tauri::command]
pub async fn export_scenes_json(app: tauri::AppHandle) -> Result<String, String> {
    let scenes = get_scenes(app).await?;
    let content = serde_json::to_string_pretty(&scenes)
        .map_err(|e| format!("序列化场景列表失败: {}", e))?;
    Ok(content)
}

/// 从 JSON 字符串导入场景列表（给前端上传用），会覆盖同名场景
#[tauri::command]
pub async fn import_scenes_json(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let scenes_dir = ensure_scenes_dir(&app)?;
    let imported: Vec<Scene> = serde_json::from_str(&json)
        .map_err(|e| format!("解析导入数据失败: {}", e))?;
    
    for scene in imported {
        let scene_file = scenes_dir.join(format!("{}.json", scene.name));
        let scene_content = serde_json::to_string_pretty(&scene)
            .map_err(|e| format!("序列化场景失败: {}", e))?;
        fs::write(&scene_file, scene_content)
            .map_err(|e| format!("写入场景文件失败: {}", e))?;
    }
    
    Ok(())
}
