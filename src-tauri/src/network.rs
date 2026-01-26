use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct NetworkAdapter {
    pub name: String,
    pub network_type: String, // "wifi", "ethernet", "bluetooth", "vpn", "other"
    pub is_wireless: bool, // 保持向后兼容
    pub is_enabled: bool,
    pub is_dhcp: bool,
    pub ip_address: Option<String>,
    pub subnet_mask: Option<String>,
    pub gateway: Option<String>,
    pub dns_servers: Option<Vec<String>>,
    pub mac_address: Option<String>,
}

#[tauri::command]
pub async fn get_network_info() -> Result<Vec<NetworkAdapter>, String> {
    let mut adapters = Vec::new();

    // 获取网络适配器信息 - 使用 UTF-8 编码
    let output = Command::new("powershell")
        .args(&[
            "-Command",
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, MacAddress | ConvertTo-Json -Depth 10"
        ])
        .output()
        .map_err(|e| format!("执行命令失败: {}", e))?;

    // 使用 from_utf8_lossy 来处理可能的编码问题
    let mut adapter_list = String::from_utf8_lossy(&output.stdout).to_string();
    adapter_list = adapter_list.trim().to_string();

    // 检查是否有错误输出
    if !output.stderr.is_empty() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        eprintln!("PowerShell错误: {}", error_msg);
    }

    // 清理输出（移除可能的BOM和空白字符）
    if adapter_list.is_empty() {
        return Ok(Vec::new());
    }

    // 移除 UTF-8 BOM（如果存在）
    if adapter_list.starts_with('\u{FEFF}') {
        adapter_list = adapter_list[3..].to_string();
    }

    // 解析适配器列表
    let adapters_json: Vec<serde_json::Value> = serde_json::from_str(&adapter_list)
        .unwrap_or_else(|_| {
            // 如果不是数组，尝试解析单个对象
            if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&adapter_list) {
                vec![obj]
            } else {
                eprintln!("无法解析适配器列表: {}", adapter_list);
                vec![]
            }
        });

    // 使用单个 PowerShell 命令获取所有适配器的完整信息
    let all_configs = get_all_ip_configs().unwrap_or_default();
    
    for adapter_json in adapters_json {
        let name = adapter_json["Name"]
            .as_str()
            .unwrap_or("Unknown")
            .to_string();
        
        let description = adapter_json["InterfaceDescription"]
            .as_str()
            .unwrap_or("")
            .to_string();
        
        let desc_lower = description.to_lowercase();
        let name_lower = name.to_lowercase();
        
        // 判断网络类型
        let (network_type, is_wireless) = if desc_lower.contains("bluetooth") || name_lower.contains("bluetooth") {
            ("bluetooth".to_string(), true)
        } else if desc_lower.contains("wireless") || desc_lower.contains("wifi") || desc_lower.contains("802.11") || name_lower.contains("wlan") {
            ("wifi".to_string(), true)
        } else if desc_lower.contains("vpn") || name_lower.contains("vpn") || desc_lower.contains("tunnel") {
            ("vpn".to_string(), false)
        } else if desc_lower.contains("ethernet") || name_lower.contains("ethernet") || name_lower.contains("以太网") {
            ("ethernet".to_string(), false)
        } else {
            ("other".to_string(), false)
        };
        
        let status = adapter_json["Status"].as_str().unwrap_or("Disabled");
        let is_enabled = status == "Up";
        
        let mac = adapter_json["MacAddress"]
            .as_str()
            .map(|s| s.to_string());

        // 从缓存中获取IP配置信息
        let ip_config = all_configs.get(&name).cloned().unwrap_or_else(|| {
            // 如果缓存中没有，尝试单独获取（作为后备）
            get_ip_config(&name).unwrap_or_else(|_| {
                IpConfig {
                    is_dhcp: false,
                    ip_address: None,
                    subnet_mask: None,
                    gateway: None,
                    dns_servers: None,
                }
            })
        });
        
        adapters.push(NetworkAdapter {
            name,
            network_type: network_type.clone(),
            is_wireless,
            is_enabled,
            is_dhcp: ip_config.is_dhcp,
            ip_address: ip_config.ip_address,
            subnet_mask: ip_config.subnet_mask,
            gateway: ip_config.gateway,
            dns_servers: ip_config.dns_servers,
            mac_address: mac,
        });
    }

    Ok(adapters)
}

#[derive(Clone)]
struct IpConfig {
    is_dhcp: bool,
    ip_address: Option<String>,
    subnet_mask: Option<String>,
    gateway: Option<String>,
    dns_servers: Option<Vec<String>>,
}

// 使用单个命令获取所有适配器的IP配置（更快）
fn get_all_ip_configs() -> Result<std::collections::HashMap<String, IpConfig>, String> {
    use std::collections::HashMap;
    let mut configs = HashMap::new();
    
    // 一次性获取所有适配器的IP配置
    let output = Command::new("powershell")
        .args(&[
            "-Command",
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $adapters = Get-NetAdapter; $result = @(); foreach ($adapter in $adapters) { $ip = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1; $route = Get-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1; $interface = Get-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue; $dns = Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue; $dhcpValue = 0; if ($interface) { $dhcpValue = [int]$interface.Dhcp }; $obj = @{ Name = $adapter.Name; IP = if ($ip) { $ip.IPAddress } else { $null }; Prefix = if ($ip) { $ip.PrefixLength } else { $null }; Gateway = if ($route) { $route.NextHop } else { $null }; Dhcp = $dhcpValue; DNS = if ($dns -and $dns.ServerAddresses) { ($dns.ServerAddresses -join ',') } else { '' } }; $result += $obj }; $result | ConvertTo-Json -Depth 10"
        ])
        .output();
    
    let output = match output {
        Ok(output) => output,
        Err(e) => {
            eprintln!("获取所有IP配置失败: {}", e);
            return Ok(configs);
        }
    };
    
    let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output_str.is_empty() {
        return Ok(configs);
    }
    
    // 移除 BOM
    let output_str = if output_str.starts_with('\u{FEFF}') {
        &output_str[3..]
    } else {
        &output_str
    };
    
    // 解析JSON
    let configs_json: Vec<serde_json::Value> = match serde_json::from_str(output_str) {
        Ok(json) => json,
        Err(e) => {
            eprintln!("解析IP配置JSON失败: {}", e);
            return Ok(configs);
        }
    };
    
    for config_json in configs_json {
        let name = config_json["Name"]
            .as_str()
            .unwrap_or("")
            .to_string();
        
        if name.is_empty() {
            continue;
        }
        
        // 解析IP地址
        let ip_address = config_json["IP"]
            .as_str()
            .map(|s| s.to_string());
        
        // 解析子网掩码
        let subnet_mask = config_json["Prefix"]
            .as_u64()
            .and_then(|p| prefix_to_subnet(p as u8));
        
        // 解析网关
        let gateway = config_json["Gateway"]
            .as_str()
            .and_then(|s| {
                let s = s.trim();
                if s != "null" && !s.is_empty() {
                    Some(s.to_string())
                } else {
                    None
                }
            });
        
        // 解析DHCP状态 - 支持字符串和数字格式
        let is_dhcp = config_json["Dhcp"]
            .as_str()
            .map(|s| {
                let upper = s.to_uppercase();
                upper == "ENABLED" || upper.contains("ENABLED")
            })
            .or_else(|| {
                // 如果是数字，1 表示启用，0 表示禁用
                config_json["Dhcp"]
                    .as_u64()
                    .map(|n| n == 1)
            })
            .unwrap_or(false);
        
        // 解析DNS
        let dns_servers = config_json["DNS"]
            .as_str()
            .and_then(|s| {
                let s = s.trim();
                if !s.is_empty() {
                    Some(s.split(',').map(|x| x.trim().to_string()).collect())
                } else {
                    None
                }
            });
        
        configs.insert(name, IpConfig {
            is_dhcp,
            ip_address,
            subnet_mask,
            gateway,
            dns_servers,
        });
    }
    
    Ok(configs)
}

fn get_ip_config(adapter_name: &str) -> Result<IpConfig, String> {
    // 获取IP地址配置 - 使用更健壮的命令
    let ip_output = match Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ $ipconfig = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1; if ($ipconfig) {{ @{{IP=$ipconfig.IPAddress; Prefix=$ipconfig.PrefixLength}} | ConvertTo-Json -Compress }} else {{ 'null' }} }} else {{ 'null' }}",
                adapter_name.replace("'", "''")
            )
        ])
        .output() {
        Ok(output) => output,
        Err(e) => {
            eprintln!("执行IP配置命令失败: {}", e);
            return Ok(IpConfig {
                is_dhcp: false,
                ip_address: None,
                subnet_mask: None,
                gateway: None,
                dns_servers: None,
            });
        }
    };

    let ip_str = String::from_utf8_lossy(&ip_output.stdout);
    let ip_str = ip_str.trim();
    
    let ip_address = if ip_str.trim() != "null" && !ip_str.trim().is_empty() {
        if let Ok(ip_json) = serde_json::from_str::<serde_json::Value>(ip_str) {
            ip_json["IP"].as_str().map(|s| s.to_string())
        } else {
            None
        }
    } else {
        None
    };

    // 计算子网掩码
    let subnet_mask = if let Some(prefix) = ip_str
        .lines()
        .find_map(|line| {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                json["Prefix"].as_u64()
            } else {
                None
            }
        }) {
        prefix_to_subnet(prefix as u8)
    } else {
        None
    };

    // 获取网关
    let gateway_output = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ $route = Get-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($route) {{ $route.NextHop }} else {{ 'null' }} }} else {{ 'null' }}",
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .ok();
    
    let gateway = gateway_output
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .and_then(|s| {
            if s != "null" && !s.is_empty() {
                Some(s)
            } else {
                None
            }
        });

    // 检查是否为DHCP
    let dhcp_output = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ $ipconfig = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue; if ($ipconfig -and $ipconfig.NetIPv4Interface) {{ $ipconfig.NetIPv4Interface.Dhcp }} else {{ 'Disabled' }} }} else {{ 'Disabled' }}",
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .ok();
    
    let is_dhcp = dhcp_output
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_uppercase())
        .map(|s| s.contains("ENABLED"))
        .unwrap_or(false);

    // 获取DNS服务器
    let dns_output = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ $dns = Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue; if ($dns -and $dns.ServerAddresses) {{ $dns.ServerAddresses -join ',' }} else {{ '' }} }} else {{ '' }}",
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .ok();
    
    let dns_servers = dns_output
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .and_then(|s| {
            if !s.is_empty() {
                Some(s.split(',').map(|x| x.trim().to_string()).collect())
            } else {
                None
            }
        });

    Ok(IpConfig {
        is_dhcp,
        ip_address,
        subnet_mask,
        gateway,
        dns_servers,
    })
}

fn prefix_to_subnet(prefix: u8) -> Option<String> {
    if prefix > 32 {
        return None;
    }
    
    let mask = (0xFFFFFFFFu32 << (32 - prefix)).to_be_bytes();
    Some(format!("{}.{}.{}.{}", mask[0], mask[1], mask[2], mask[3]))
}

#[tauri::command]
pub async fn set_static_ip(
    adapter_name: String,
    ip: String,
    subnet: String,
    gateway: String,
    dns: Vec<String>,
) -> Result<(), String> {
    // 移除现有IP配置
    Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}'; Remove-NetIPAddress -InterfaceIndex $adapter.ifIndex -Confirm:$false -ErrorAction SilentlyContinue",
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .map_err(|e| format!("移除旧IP配置失败: {}", e))?;

    // 设置静态IP
    let prefix = subnet_to_prefix(&subnet)?;
    
    Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}'; New-NetIPAddress -InterfaceIndex $adapter.ifIndex -IPAddress {} -PrefixLength {} -DefaultGateway {}",
                adapter_name.replace("'", "''"),
                ip,
                prefix,
                gateway
            )
        ])
        .output()
        .map_err(|e| format!("设置静态IP失败: {}", e))?;

    // 禁用DHCP
    Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}'; Set-NetIPInterface -InterfaceIndex $adapter.ifIndex -Dhcp Disabled",
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .map_err(|e| format!("禁用DHCP失败: {}", e))?;

    // 设置DNS
    if !dns.is_empty() {
        let dns_str = dns.join(",");
        Command::new("powershell")
            .args(&[
                "-Command",
                &format!(
                    "$adapter = Get-NetAdapter -Name '{}'; Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses {}",
                    adapter_name.replace("'", "''"),
                    dns_str
                )
            ])
            .output()
            .map_err(|e| format!("设置DNS失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn set_dhcp(adapter_name: String) -> Result<(), String> {
    // 移除现有IP配置
    Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}'; Remove-NetIPAddress -InterfaceIndex $adapter.ifIndex -Confirm:$false -ErrorAction SilentlyContinue",
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .ok();

    // 启用DHCP
    Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}'; Set-NetIPInterface -InterfaceIndex $adapter.ifIndex -Dhcp Enabled",
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .map_err(|e| format!("启用DHCP失败: {}", e))?;

    // 清除DNS设置（使用DHCP提供的DNS）
    Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}'; Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ResetServerAddresses",
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .ok();

    Ok(())
}

fn subnet_to_prefix(subnet: &str) -> Result<u8, String> {
    let parts: Vec<&str> = subnet.split('.').collect();
    if parts.len() != 4 {
        return Err("无效的子网掩码格式".to_string());
    }

    let mut prefix = 0;
    for part in parts {
        let octet: u8 = part.parse().map_err(|_| "无效的子网掩码值".to_string())?;
        prefix += octet.count_ones() as u8;
    }

    Ok(prefix)
}
