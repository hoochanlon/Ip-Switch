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

// 检查 PowerShell 命令执行结果
fn check_powershell_output(output: &std::process::Output, operation: &str) -> Result<(), String> {
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        
        // 检查是否是权限错误
        let error_text = if !stderr.trim().is_empty() {
            stderr.trim()
        } else if !stdout.trim().is_empty() {
            stdout.trim()
        } else {
            ""
        };
        
        // 检测权限错误的关键词
        let is_permission_error = error_text.contains("Access is denied") 
            || error_text.contains("权限被拒绝")
            || error_text.contains("Windows System Error 5")
            || error_text.contains("PermissionDenied")
            || output.status.code() == Some(5);
        
        if is_permission_error {
            return Err(format!(
                "{}\n\n错误原因：权限不足\n\n解决方案：\n1. 请右键点击应用程序\n2. 选择\"以管理员身份运行\"\n3. 重新尝试应用场景\n\n详细错误信息：{}",
                operation,
                if error_text.is_empty() {
                    format!("退出码: {}", output.status.code().unwrap_or(-1))
                } else {
                    error_text.to_string()
                }
            ));
        }
        
        let error_msg = if !error_text.is_empty() {
            format!("{}: {}", operation, error_text)
        } else {
            format!("{}失败: 退出码 {}", operation, output.status.code().unwrap_or(-1))
        };
        return Err(error_msg);
    }
    
    // 检查 stderr 中是否有错误信息（即使退出码为0）
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.trim().is_empty() && !stderr.contains("Warning") {
        // 忽略警告，但记录其他错误
        eprintln!("PowerShell警告: {}", stderr.trim());
    }
    
    Ok(())
}

#[tauri::command]
pub async fn set_static_ip(
    adapter_name: String,
    ip: String,
    subnet: String,
    gateway: String,
    dns: Vec<String>,
) -> Result<(), String> {
    // 第一步：移除现有的默认网关路由（如果存在）
    let _remove_gateway = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ $routes = Get-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue; if ($routes) {{ $routes | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue }} }}",
                adapter_name.replace("'", "''")
            )
        ])
        .output();
    
    // 第二步：移除现有IP配置（允许失败，因为可能没有现有IP）
    let _remove_ip = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; Remove-NetIPAddress -InterfaceIndex $adapter.ifIndex -Confirm:$false -ErrorAction SilentlyContinue",
                adapter_name.replace("'", "''")
            )
        ])
        .output();
    
    // 等待一下，确保旧配置已清除
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // 第三步：设置静态IP（不包含DefaultGateway参数，先设置IP）
    let prefix = subnet_to_prefix(&subnet)?;
    
    let set_ip_output = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; New-NetIPAddress -InterfaceIndex $adapter.ifIndex -IPAddress {} -PrefixLength {} -ErrorAction Stop",
                adapter_name.replace("'", "''"),
                ip,
                prefix
            )
        ])
        .output()
        .map_err(|e| format!("执行设置静态IP命令失败: {}", e))?;
    
    check_powershell_output(&set_ip_output, &format!("为网卡 {} 设置静态IP", adapter_name))?;
    
    // 第四步：单独设置默认网关
    let set_gateway_output = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; New-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -NextHop {} -ErrorAction Stop",
                adapter_name.replace("'", "''"),
                gateway
            )
        ])
        .output()
        .map_err(|e| format!("执行设置网关命令失败: {}", e))?;
    
    check_powershell_output(&set_gateway_output, &format!("为网卡 {} 设置网关", adapter_name))?;

    // 禁用DHCP
    let disable_dhcp_output = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; Set-NetIPInterface -InterfaceIndex $adapter.ifIndex -Dhcp Disabled -ErrorAction Stop",
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .map_err(|e| format!("执行禁用DHCP命令失败: {}", e))?;
    
    check_powershell_output(&disable_dhcp_output, &format!("为网卡 {} 禁用DHCP", adapter_name))?;

    // 设置DNS
    if !dns.is_empty() {
        let dns_str = dns.join(",");
        let set_dns_output = Command::new("powershell")
            .args(&[
                "-Command",
                &format!(
                    "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses {} -ErrorAction Stop",
                    adapter_name.replace("'", "''"),
                    dns_str
                )
            ])
            .output()
            .map_err(|e| format!("执行设置DNS命令失败: {}", e))?;
        
        check_powershell_output(&set_dns_output, &format!("为网卡 {} 设置DNS", adapter_name))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn set_dhcp(adapter_name: String) -> Result<(), String> {
    // 移除现有IP配置（允许失败，因为可能没有现有IP）
    let _ = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ Remove-NetIPAddress -InterfaceIndex $adapter.ifIndex -Confirm:$false -ErrorAction SilentlyContinue }}",
                adapter_name.replace("'", "''")
            )
        ])
        .output();

    // 启用DHCP
    let enable_dhcp_output = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; Set-NetIPInterface -InterfaceIndex $adapter.ifIndex -Dhcp Enabled -ErrorAction Stop",
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .map_err(|e| format!("执行启用DHCP命令失败: {}", e))?;
    
    check_powershell_output(&enable_dhcp_output, &format!("为网卡 {} 启用DHCP", adapter_name))?;

    // 清除DNS设置（使用DHCP提供的DNS，允许失败）
    let _ = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ResetServerAddresses -ErrorAction SilentlyContinue }}",
                adapter_name.replace("'", "''")
            )
        ])
        .output();

    Ok(())
}

/// Ping测试（Tauri command）
#[tauri::command]
pub async fn ping_test(host: String, timeout_sec: u64) -> Result<bool, String> {
    // 使用PowerShell的Test-Connection命令进行ping测试
    let output = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "$result = Test-Connection -ComputerName '{}' -Count 1 -Quiet -TimeoutSeconds {}; if ($result) {{ Write-Output 'SUCCESS' }} else {{ Write-Output 'FAILED' }}",
                host.replace("'", "''"),
                timeout_sec
            )
        ])
        .output()
        .map_err(|e| format!("执行ping测试失败: {}", e))?;
    
    let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(output_str.contains("SUCCESS"))
}

/// 自动切换网络配置（双向切换）
#[tauri::command]
pub async fn auto_switch_network(
    adapter_name: String,
    dhcp_config: Option<DhcpConfig>,
    static_config: Option<StaticConfig>,
    dhcp_ping_target: String,      // DHCP模式下的ping目标（如baidu.com）
    static_ping_target: String,    // 静态IP模式下的ping目标（如网关IP）
) -> Result<String, String> {
    // 获取当前网络配置
    let current_info = get_network_info().await?;
    let adapter = current_info.iter()
        .find(|a| a.name == adapter_name)
        .ok_or_else(|| format!("找不到网卡: {}", adapter_name))?;
    
    let current_is_dhcp = adapter.is_dhcp;
    
    // 根据当前模式进行ping测试和切换
    if current_is_dhcp {
        // 当前是DHCP模式，ping外网目标
        let can_ping = ping_test(dhcp_ping_target.clone(), 3).await.unwrap_or(false);
        
        if !can_ping {
            // 无法ping通外网，切换到静态IP
            if let Some(static_cfg) = static_config {
                set_static_ip(
                    adapter_name.clone(),
                    static_cfg.ip,
                    static_cfg.subnet,
                    static_cfg.gateway,
                    static_cfg.dns.unwrap_or_default(),
                ).await?;
                return Ok(format!("已从DHCP切换到静态IP (无法ping通 {})", dhcp_ping_target));
            } else {
                return Err("静态IP配置未提供".to_string());
            }
        } else {
            return Ok("保持DHCP模式 (可以ping通外网)".to_string());
        }
    } else {
        // 当前是静态IP模式，ping内网目标
        let can_ping = ping_test(static_ping_target.clone(), 3).await.unwrap_or(false);
        
        if !can_ping {
            // 无法ping通内网，切换到DHCP
            if let Some(dhcp_cfg) = dhcp_config {
                set_dhcp(adapter_name.clone()).await?;
                
                // 如果提供了DHCP的DNS配置，设置DNS
                if let Some(dns) = dhcp_cfg.dns {
                    if !dns.is_empty() {
                        let dns_str = dns.join(",");
                        let _ = Command::new("powershell")
                            .args(&[
                                "-Command",
                                &format!(
                                    "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses {} -ErrorAction SilentlyContinue",
                                    adapter_name.replace("'", "''"),
                                    dns_str.replace("'", "''")
                                )
                            ])
                            .output();
                    }
                }
                
                return Ok(format!("已从静态IP切换到DHCP (无法ping通 {})", static_ping_target));
            } else {
                return Err("DHCP配置未提供".to_string());
            }
        } else {
            return Ok("保持静态IP模式 (可以ping通内网)".to_string());
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DhcpConfig {
    pub dns: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StaticConfig {
    pub ip: String,
    pub subnet: String,
    pub gateway: String,
    pub dns: Option<Vec<String>>,
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
