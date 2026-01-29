use serde::{Deserialize, Serialize};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use winapi::um::winbase::CREATE_NO_WINDOW;

/// 创建 PowerShell 命令（Windows 下禁止弹出控制台窗口）
fn powershell_cmd() -> Command {
    let mut cmd = Command::new("powershell");

    // 统一加上更“安静”的 PowerShell 参数，减少环境干扰
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"]);

    // Windows 下避免弹出/闪现 powershell 控制台窗口
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd
}

/// 创建 ping 命令（Windows 下禁止弹出控制台窗口）
fn ping_cmd() -> Command {
    let mut cmd = Command::new("ping");

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd
}

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
    /// 连接持续时间（格式: "hh:mm:ss"，仅在 Status 为 Up 时有值）
    pub duration: Option<String>,
    /// 链路速度（例如 "1 Gbps"）
    pub link_speed: Option<String>,
    /// 已发送字节数
    pub bytes_sent: Option<u64>,
    /// 已接收字节数
    pub bytes_received: Option<u64>,
}

#[tauri::command]
pub async fn get_network_info() -> Result<Vec<NetworkAdapter>, String> {
    let mut adapters = Vec::new();

    // 获取网络适配器信息 - 使用 UTF-8 编码
    let output = powershell_cmd()
        .args(&[
            "-Command",
            // 合并适配器基本信息 + 统计信息（速度/收发字节/持续时间）
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
            $adapters = Get-NetAdapter; \
            $stats = Get-NetAdapterStatistics; \
            $result = @(); \
            foreach ($adapter in $adapters) { \
              $stat = $stats | Where-Object { $_.Name -eq $adapter.Name } | Select-Object -First 1; \
              $duration = $null; \
              if ($adapter.Status -eq 'Up' -and $adapter.LinkUpTime) { \
                $ts = New-TimeSpan -Start $adapter.LinkUpTime -End (Get-Date); \
                $duration = $ts.ToString('hh\\:mm\\:ss'); \
              } \
              $obj = [PSCustomObject]@{ \
                Name = $adapter.Name; \
                InterfaceDescription = $adapter.InterfaceDescription; \
                Status = $adapter.Status; \
                MacAddress = $adapter.MacAddress; \
                LinkSpeed = $adapter.LinkSpeed; \
                Duration = $duration; \
                BytesSent = if ($stat) { [int64]$stat.SentBytes } else { $null }; \
                BytesReceived = if ($stat) { [int64]$stat.ReceivedBytes } else { $null }; \
              }; \
              $result += $obj; \
            }; \
            $result | ConvertTo-Json -Depth 10"
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

        // 连接持续时间（可能为 null）
        let duration = adapter_json["Duration"]
            .as_str()
            .map(|s| s.to_string());

        // 链路速度（直接使用 PowerShell 返回的字符串，如 "1 Gbps"）
        let link_speed = adapter_json["LinkSpeed"]
            .as_str()
            .map(|s| s.to_string());

        // 已发送/已接收字节数
        let bytes_sent = adapter_json["BytesSent"].as_i64().map(|v| v as u64);
        let bytes_received = adapter_json["BytesReceived"].as_i64().map(|v| v as u64);

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
            duration,
            link_speed,
            bytes_sent,
            bytes_received,
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
    let output = powershell_cmd()
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
    let ip_output = match powershell_cmd()
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
    let gateway_output = powershell_cmd()
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
    let dhcp_output = powershell_cmd()
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
    let dns_output = powershell_cmd()
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
    let _remove_gateway = powershell_cmd()
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ $routes = Get-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue; if ($routes) {{ $routes | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue }} }}",
                adapter_name.replace("'", "''")
            )
        ])
        .output();
    
    // 第二步：移除现有IP配置（允许失败，因为可能没有现有IP）
    let _remove_ip = powershell_cmd()
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
    
    let set_ip_output = powershell_cmd()
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
    let set_gateway_output = powershell_cmd()
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; \
                 $existing = Get-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1; \
                 if ($existing) {{ \
                   Set-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -NextHop {} -ErrorAction Stop \
                 }} else {{ \
                   New-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -NextHop {} -ErrorAction Stop \
                 }}",
                adapter_name.replace("'", "''"),
                gateway,
                gateway
            )
        ])
        .output()
        .map_err(|e| format!("执行设置网关命令失败: {}", e))?;
    
    check_powershell_output(&set_gateway_output, &format!("为网卡 {} 设置网关", adapter_name))?;

    // 禁用DHCP
    let disable_dhcp_output = powershell_cmd()
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
        let set_dns_output = powershell_cmd()
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
    // 先移除默认网关路由（避免从静态/旧配置残留 0.0.0.0/0 NextHop，导致“DHCP 了网关还显示旧值”）
    let _ = powershell_cmd()
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ $routes = Get-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue; if ($routes) {{ $routes | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue }} }}",
                adapter_name.replace("'", "''")
            ),
        ])
        .output();

    // 移除现有IP配置（允许失败，因为可能没有现有IP）
    let _ = powershell_cmd()
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ Remove-NetIPAddress -InterfaceIndex $adapter.ifIndex -Confirm:$false -ErrorAction SilentlyContinue }}",
                adapter_name.replace("'", "''")
            )
        ])
        .output();

    // 启用DHCP
    let enable_dhcp_output = powershell_cmd()
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
    let _ = powershell_cmd()
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction SilentlyContinue; if ($adapter) {{ Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ResetServerAddresses -ErrorAction SilentlyContinue }}",
                adapter_name.replace("'", "''")
            )
        ])
        .output();

    // 主动触发一次 DHCP 续租（某些环境下仅启用 DHCP 不会立刻刷新租约/路由）
    let _ = powershell_cmd()
        .args(&[
            "-Command",
            &format!(
                "$name = '{}'; ipconfig /renew \"$name\" | Out-Null",
                adapter_name.replace("'", "''")
            ),
        ])
        .output();

    Ok(())
}

/// 单独设置 DNS 服务器（不改变 IP 获取方式，可用于 DHCP + 自定义 DNS）
pub async fn set_dns_servers_internal(adapter_name: String, dns: Vec<String>) -> Result<(), String> {
    if dns.is_empty() {
        return Ok(());
    }

    let dns_str = dns.join(",");
    let set_dns_output = powershell_cmd()
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses {} -ErrorAction Stop",
                adapter_name.replace("'", "''"),
                dns_str.replace("'", "''"),
            ),
        ])
        .output()
        .map_err(|e| format!("执行设置DNS命令失败: {}", e))?;

    check_powershell_output(&set_dns_output, &format!("为网卡 {} 设置DNS", adapter_name))?;
    Ok(())
}

/// Ping测试（Tauri command）
#[tauri::command]
pub async fn ping_test(host: String, timeout_sec: u64) -> Result<bool, String> {
    // 使用PowerShell的Test-Connection命令进行ping测试
    let output = powershell_cmd()
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

/// 多次 ping（任意一次成功即视为可用），用于降低短暂抖动/解析延迟导致的误判。
async fn ping_test_with_retries(host: &str, timeout_sec: u64, attempts: u32, delay_ms: u64) -> bool {
    let tries = attempts.max(1);
    for i in 0..tries {
        let ok = ping_test(host.to_string(), timeout_sec).await.unwrap_or(false);
        if ok {
            return true;
        }
        // 最后一次不必再等待
        if i + 1 < tries {
            tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
        }
    }
    false
}

/// 尽量使用指定网卡的 IPv4 作为 Source 进行 ping，避免系统默认路由（例如 Wi‑Fi）导致“以太网配置错了也能 ping 通”的误判。
async fn ping_test_on_adapter(adapter_name: &str, host: &str, timeout_sec: u64) -> bool {
    let (ip, _) = match get_ipv4_and_gateway(adapter_name).await {
        Ok(v) => v,
        Err(_) => (None, None),
    };

    // 没有可用 IPv4 时，直接认为“当前网卡不可用”，而不是退回到普通 ping，
    // 避免被其它网卡（例如 Wi‑Fi 默认路由）误判为“其实能通”。
    let src_ip = match ip {
        Some(v) if !v.trim().is_empty() => v,
        _ => return false,
    };

    // 使用系统自带 ping.exe + -S 显式指定源地址，行为与用户在 CMD 中执行的
    // `ping -S <ip> <host>` 保持一致，避免 Test-Connection 在不同环境下的兼容性问题。
    let timeout_ms = timeout_sec.saturating_mul(1000);

    let output = ping_cmd()
        .args(&[
            "-S",
            &src_ip,
            "-n",
            "1",
            "-w",
            &timeout_ms.to_string(),
            host,
        ])
        .output();

    match output {
        Ok(out) => out.status.success(),
        Err(_) => false,
    }
}

async fn ping_test_on_adapter_with_retries(
    adapter_name: &str,
    host: &str,
    timeout_sec: u64,
    attempts: u32,
    delay_ms: u64,
) -> bool {
    let tries = attempts.max(1);
    for i in 0..tries {
        let ok = ping_test_on_adapter(adapter_name, host, timeout_sec).await;
        if ok {
            return true;
        }
        if i + 1 < tries {
            tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
        }
    }
    false
}

/// 读取指定网卡的 IPv4 地址与默认网关（0.0.0.0/0 NextHop）
async fn get_ipv4_and_gateway(adapter_name: &str) -> Result<(Option<String>, Option<String>), String> {
    let safe_name = adapter_name.replace("'", "''");
    // IMPORTANT: 这里不要用 `format!`，否则 PowerShell 的 `{}` 会被 Rust 当作格式化占位符解析导致编译失败。
    let script = r#"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
      $adapter = Get-NetAdapter -Name '{ADAPTER}' -ErrorAction SilentlyContinue;
      if (-not $adapter) { '{"ip":null,"gw":null}' } else {
        $ip = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1;
        $route = Get-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1;
        $obj = @{ ip = if ($ip) { $ip.IPAddress } else { $null }; gw = if ($route) { $route.NextHop } else { $null } };
        $obj | ConvertTo-Json -Compress
      }"#.replace("{ADAPTER}", &safe_name);

    let output = powershell_cmd()
        .args(&[
            "-Command",
            &script,
        ])
        .output()
        .map_err(|e| format!("读取网卡IP信息失败: {}", e))?;

    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("解析网卡IP信息失败: {} ({})", e, raw))?;
    let ip = v.get("ip").and_then(|x| x.as_str()).map(|s| s.to_string());
    let gw = v.get("gw").and_then(|x| x.as_str()).map(|s| s.to_string());
    Ok((ip, gw))
}

/// 等待网卡在应用配置后进入“更稳定的可用状态”，避免 DHCP/路由未就绪就 ping 误判。
/// 优化：减少等待时间以提升响应速度
async fn wait_adapter_ready(adapter_name: &str, cfg: &NetworkConfig) {
    match cfg.mode.as_str() {
        "dhcp" => {
            // 优化：最多等待约 6s（从 15s 降低），每秒检查一次
            // DHCP 通常 2-4 秒内就能拿到 IP，6 秒足够大多数情况
            for _ in 0..6 {
                if let Ok((ip, gw)) = get_ipv4_and_gateway(adapter_name).await {
                    let ip_ok = ip.as_deref().is_some_and(|s| !s.starts_with("169.254."));
                    let gw_ok = gw.as_deref().is_some_and(|s| s != "0.0.0.0");
                    if ip_ok && gw_ok {
                        break;
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
        }
        "static" => {
            // 优化：静态模式最多等待约 1.5s（从 3s 降低），每 200ms 检查一次
            // 静态 IP 配置通常很快（<500ms），1.5 秒足够
            let expected_ip = cfg
                .static_config
                .as_ref()
                .map(|s| s.ip.as_str())
                .unwrap_or("");
            for _ in 0..8 {
                if expected_ip.is_empty() {
                    break;
                }
                if let Ok((ip, _)) = get_ipv4_and_gateway(adapter_name).await {
                    if ip.as_deref() == Some(expected_ip) {
                        break;
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            }
        }
        _ => {
            // ignore
        }
    }
}

/// 在“当前已按 cfg 应用完配置并 wait_adapter_ready 之后”，
/// 使用指定网卡依次检测：
///   1）ping 网关
///   2）ping 外网（cfg.ping_target）
/// 只有两者均成功才返回 true；否则视为该侧不可用。
async fn test_side_connectivity(adapter_name: &str, cfg: &NetworkConfig) -> bool {
    // 先确定应当使用的网关地址
    let gateway = match cfg.mode.as_str() {
        // 静态：直接使用配置中的网关
        "static" => cfg
            .static_config
            .as_ref()
            .map(|s| s.gateway.clone())
            .unwrap_or_default(),
        // DHCP：从当前网卡实际状态中读取网关
        "dhcp" => match get_ipv4_and_gateway(adapter_name).await {
            Ok((_, gw)) => gw.unwrap_or_default(),
            Err(_) => String::new(),
        },
        // 其他模式一律视为失败
        _ => String::new(),
    };

    let gateway = gateway.trim();
    // 没有有效网关（为空或 0.0.0.0）直接视为失败
    if gateway.is_empty() || gateway == "0.0.0.0" {
        return false;
    }

    // 优化：减少重试次数和超时时间以提升响应速度
    // 网关 ping：2 次重试 × 1 秒超时（从 3 次 × 2 秒降低）
    // 外网 ping：同样 2 次重试 × 1 秒超时
    // 1）先 ping 网关
    let gw_ok = ping_test_on_adapter_with_retries(adapter_name, gateway, 1, 2, 300).await;
    if !gw_ok {
        return false;
    }

    // 2）再 ping 外网
    let ext_ok =
        ping_test_on_adapter_with_retries(adapter_name, &cfg.ping_target, 1, 2, 300).await;
    ext_ok
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetworkConfig {
    pub mode: String, // "dhcp" | "static"
    pub dhcp: Option<DhcpConfig>,
    #[serde(rename = "staticConfig")]
    pub static_config: Option<StaticConfig>,
    pub ping_target: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSwitchResult {
    pub message: String,
    pub active_network: String, // "network1" | "network2"
    pub result: String,         // "stay" | "switched" | "both_failed"
    /// 实际作为“当前判定依据”的 ping 目标（方便前端按目标映射托盘颜色）
    pub active_ping_target: Option<String>,
}

/// 自动切换网络配置（双向切换，双方均可独立选择DHCP或静态）
#[tauri::command]
pub async fn auto_switch_network(
    adapter_name: String,
    current_active: Option<String>, // "network1" | "network2"
    network1_config: NetworkConfig,
    network2_config: NetworkConfig,
) -> Result<AutoSwitchResult, String> {
    // 先探测当前网卡是否存在
    let current_info = get_network_info().await?;
    let _ = current_info
        .iter()
        .find(|a| a.name == adapter_name)
        .ok_or_else(|| format!("找不到网卡: {}", adapter_name))?;

    let active = current_active.unwrap_or_else(|| "network1".to_string());
    let (current_label, other_label, current_cfg, other_cfg) = if active == "network2" {
        ("网络2", "网络1", network2_config.clone(), network1_config.clone())
    } else {
        ("网络1", "网络2", network1_config.clone(), network2_config.clone())
    };

    // 1. 先“按配置应用当前侧”（无论是 DHCP 还是静态），
    //    再在该配置下用指定网卡依次检测：
    //      1) ping 网关
    //      2) ping 外网（用户配置的 pingTarget）
    //    只有“网关 + 外网都 OK”才认为当前侧可用，否则尝试另一侧。
    apply_network_config(&adapter_name, &current_cfg).await?;
    wait_adapter_ready(&adapter_name, &current_cfg).await;
    let current_ok = test_side_connectivity(&adapter_name, &current_cfg).await;
    if current_ok {
        return Ok(AutoSwitchResult {
            message: format!("保持{} (连接正常)", current_label),
            active_network: if active == "network2" {
                "network2".to_string()
            } else {
                "network1".to_string()
            },
            result: "stay".to_string(),
            active_ping_target: Some(current_cfg.ping_target.clone()),
        });
    }

    // 2. 当前侧不通，才切换到另一侧并检测
    apply_network_config(&adapter_name, &other_cfg).await?;
    // 等待配置生效/路由就绪后再 ping
    wait_adapter_ready(&adapter_name, &other_cfg).await;
    let other_ok = test_side_connectivity(&adapter_name, &other_cfg).await;
    if other_ok {
        return Ok(AutoSwitchResult {
            message: format!("已切换到{} (原{}不可用)", other_label, current_label),
            active_network: if active == "network2" {
                "network1".to_string()
            } else {
                "network2".to_string()
            },
            result: "switched".to_string(),
            active_ping_target: Some(other_cfg.ping_target.clone()),
        });
    }

    // 3. 两侧都不通，回退到原侧
    let _ = apply_network_config(&adapter_name, &current_cfg).await;
    Ok(AutoSwitchResult {
        message: format!(
            "异常：{} 与 {} 都无法ping通，已回退到{}",
            current_label, other_label, current_label
        ),
        active_network: if active == "network2" {
            "network2".to_string()
        } else {
            "network1".to_string()
        },
        result: "both_failed".to_string(),
        active_ping_target: None,
    })
}

async fn apply_network_config(adapter_name: &str, cfg: &NetworkConfig) -> Result<(), String> {
    match cfg.mode.as_str() {
        "dhcp" => {
            set_dhcp(adapter_name.to_string()).await?;

            if let Some(dhcp_cfg) = &cfg.dhcp {
                if let Some(dns) = &dhcp_cfg.dns {
                    if !dns.is_empty() {
                        let dns_str = dns.join(",");
                        let _ = powershell_cmd()
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
            }
        }
        "static" => {
            if let Some(static_cfg) = &cfg.static_config {
                set_static_ip(
                    adapter_name.to_string(),
                    static_cfg.ip.clone(),
                    static_cfg.subnet.clone(),
                    static_cfg.gateway.clone(),
                    static_cfg.dns.clone().unwrap_or_default(),
                ).await?;
            } else {
                return Err("静态IP配置未提供".to_string());
            }
        }
        other => return Err(format!("未知的模式: {}", other)),
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DhcpConfig {
    pub dns: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
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

/// 禁用网络适配器
#[tauri::command]
pub async fn disable_adapter(adapter_name: String) -> Result<(), String> {
    let disable_output = powershell_cmd()
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; Disable-NetAdapter -Name '{}' -Confirm:$false -ErrorAction Stop",
                adapter_name.replace("'", "''"),
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .map_err(|e| format!("执行禁用网卡命令失败: {}", e))?;
    
    check_powershell_output(&disable_output, &format!("禁用网卡 {}", adapter_name))?;
    Ok(())
}

/// 启用网络适配器
#[tauri::command]
pub async fn enable_adapter(adapter_name: String) -> Result<(), String> {
    let enable_output = powershell_cmd()
        .args(&[
            "-Command",
            &format!(
                "$adapter = Get-NetAdapter -Name '{}' -ErrorAction Stop; Enable-NetAdapter -Name '{}' -Confirm:$false -ErrorAction Stop",
                adapter_name.replace("'", "''"),
                adapter_name.replace("'", "''")
            )
        ])
        .output()
        .map_err(|e| format!("执行启用网卡命令失败: {}", e))?;
    
    check_powershell_output(&enable_output, &format!("启用网卡 {}", adapter_name))?;
    Ok(())
}