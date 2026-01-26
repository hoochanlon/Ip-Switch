#[cfg(target_os = "windows")]
use winapi::um::securitybaseapi::GetTokenInformation;
#[cfg(target_os = "windows")]
use winapi::um::winnt::{TokenElevation, TOKEN_ELEVATION};
#[cfg(target_os = "windows")]
use winapi::um::processthreadsapi::{GetCurrentProcess, OpenProcessToken};
#[cfg(target_os = "windows")]
use winapi::um::winnt::{TOKEN_QUERY, HANDLE};
#[cfg(target_os = "windows")]
use winapi::um::shellapi::ShellExecuteW;
#[cfg(target_os = "windows")]
use winapi::shared::windef::HWND;
#[cfg(target_os = "windows")]
use winapi::um::winuser::SW_SHOW;
#[cfg(target_os = "windows")]
use std::ptr;
#[cfg(target_os = "windows")]
use std::ffi::OsStr;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::env;

#[cfg(target_os = "windows")]
fn is_elevated() -> bool {
    unsafe {
        let mut token: HANDLE = ptr::null_mut();
        let process = GetCurrentProcess();
        
        if OpenProcessToken(process, TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        
        if token.is_null() {
            return false;
        }
        
        let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
        let mut size = std::mem::size_of::<TOKEN_ELEVATION>() as u32;
        
        let result = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            size,
            &mut size,
        );
        
        result != 0 && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(target_os = "windows"))]
fn is_elevated() -> bool {
    true // 非 Windows 系统总是返回 true
}

// 导出检查管理员权限的命令
#[tauri::command]
pub fn check_admin_privileges() -> bool {
    #[cfg(target_os = "windows")]
    {
        is_elevated()
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}

// 以管理员权限重新启动程序
#[cfg(target_os = "windows")]
fn restart_as_admin() -> Result<(), String> {
    unsafe {
        // 获取当前可执行文件路径
        let exe_path = env::current_exe()
            .map_err(|e| format!("获取程序路径失败: {}", e))?;
        
        // 获取命令行参数（跳过第一个，因为那是程序路径）
        let args: Vec<String> = env::args().skip(1).collect();
        let args_str = args.join(" ");
        
        // 转换为宽字符串
        let exe_path_wide: Vec<u16> = exe_path
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        
        let args_wide: Vec<u16> = if !args_str.is_empty() {
            OsStr::new(&args_str)
                .encode_wide()
                .chain(Some(0))
                .collect()
        } else {
            vec![0]
        };
        
        let verb: Vec<u16> = OsStr::new("runas")
            .encode_wide()
            .chain(Some(0))
            .collect();
        
        // 使用 ShellExecute 以管理员权限启动
        // ShellExecuteW 返回 HINSTANCE，大于 32 表示成功
        let result = ShellExecuteW(
            ptr::null_mut() as HWND,
            verb.as_ptr(),
            exe_path_wide.as_ptr(),
            args_wide.as_ptr(),
            ptr::null(),
            SW_SHOW,
        );
        
        // ShellExecute 返回大于 32 表示成功
        if result as usize > 32 {
            Ok(())
        } else {
            Err(format!("请求管理员权限失败，错误代码: {}", result as i32))
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn restart_as_admin() -> Result<(), String> {
    Ok(()) // 非 Windows 系统不需要提升权限
}

// 导出请求管理员权限的命令
#[tauri::command]
pub fn request_admin_privileges() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        if is_elevated() {
            return Ok(true); // 已经有管理员权限
        }
        
        match restart_as_admin() {
            Ok(_) => {
                // 成功启动管理员权限的程序，当前程序应该退出
                std::process::exit(0);
            }
            Err(e) => Err(e)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(true)
    }
}

#[cfg(target_os = "windows")]
pub fn is_elevated_check() -> bool {
    is_elevated()
}

#[cfg(target_os = "windows")]
pub fn restart_as_admin_internal() -> Result<(), String> {
    restart_as_admin()
}
