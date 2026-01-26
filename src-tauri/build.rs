fn main() {
    // 先调用 tauri_build，它会生成自己的资源
    tauri_build::build();
    
    // 在 Windows 上，使用 winres 仅嵌入清单文件（不生成其他资源）
    // 这样可以避免与 Tauri 的资源系统冲突
    #[cfg(target_os = "windows")]
    {
        // 只在 release 模式下嵌入清单，避免开发时的冲突
        if std::env::var("PROFILE").unwrap_or_default() == "release" {
            let mut res = winres::WindowsResource::new();
            res.set_manifest_file("app.manifest");
            // 不设置图标和其他资源，避免冲突
            if let Err(e) = res.compile() {
                eprintln!("警告: 无法嵌入清单文件: {}", e);
                eprintln!("应用仍可运行，但需要手动以管理员身份运行");
            }
        }
    }
}
