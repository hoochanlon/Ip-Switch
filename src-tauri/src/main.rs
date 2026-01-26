// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod network;
mod hosts;
mod proxy;
mod scenes;
mod tray_icon;

use network::*;
use hosts::*;
use proxy::*;
use scenes::*;
use tray_icon::{TrayIconGenerator, update_tray_icon_color};
use tauri::{Manager, menu::{Menu, MenuItem}, tray::{TrayIconBuilder, TrayIconEvent}};
use std::fs;
use std::path::PathBuf;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 创建系统托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            
            let menu = Menu::with_items(app, &[
                &show_item,
                &hide_item,
                &quit_item,
            ])?;

            // 生成自定义托盘图标（方形，包含 "IP" 文字）
            // 使用微信大小的图标（32x32 像素）
            let icon = TrayIconGenerator::new()
                .with_size(32)
                .with_background_color(0.2, 0.5, 0.9, 1.0) // 蓝色背景
                .with_text_color(1.0, 1.0, 1.0, 1.0)      // 白色文字
                .generate()
                .unwrap_or_else(|e| {
                    eprintln!("Failed to generate tray icon: {}, using fallback", e);
                    // 如果生成失败，使用备用方法
                    load_tray_icon(app.handle(), "#FFFFFF")
                });

            let tray_icon = TrayIconBuilder::new()
                .menu(&menu)
                .icon(icon)
                .tooltip("IP 配置管理器")
                .build(app)?;
            
            // 将托盘图标句柄存储到应用状态中，以便后续更新
            let tray_icon_clone = tray_icon.clone();
            app.manage(std::sync::Mutex::new(tray_icon_clone));

            // 处理系统托盘事件
            tray_icon.on_tray_icon_event(|tray, event| {
                match event {
                    TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } => {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    _ => {}
                }
            });

            // 处理菜单项点击事件
            let app_handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                }
            });

            // 监听窗口关闭事件，点击关闭按钮时隐藏到托盘而不是退出
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // 阻止默认关闭行为
                        api.prevent_close();
                        // 隐藏窗口到托盘
                        let _ = window_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_network_info,
            set_static_ip,
            set_dhcp,
            get_hosts,
            set_hosts,
            get_proxy,
            set_proxy,
            get_scenes,
            save_scene,
            apply_scene,
            update_scene,
            delete_scene,
            export_scenes,
            import_scenes,
            export_scenes_json,
            import_scenes_json,
            update_tray_icon_color,
            save_backup,
            restore_backup,
            has_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// 加载托盘图标（优先使用 SVG，失败则使用默认图标）
// color: SVG 中 currentColor 的替换颜色，例如 "#FFFFFF"（白色）或 "#000000"（黑色）
fn load_tray_icon(app: &tauri::AppHandle, color: &str) -> tauri::image::Image<'static> {
    // 尝试加载 SVG 图标（按优先级顺序）
    let svg_paths = [
        "imgs/svg/tray/ip.svg",
        "imgs/svg/tray/entypo-network.svg",
        "imgs/svg/tray/network.svg",
    ];
    
    for svg_path in &svg_paths {
        // 获取资源目录路径
        let resource_path = app
            .path()
            .resource_dir()
            .ok()
            .and_then(|dir| {
                let path = dir.join(svg_path);
                if path.exists() {
                    Some(path)
                } else {
                    None
                }
            });
        
        // 如果资源目录中找不到，尝试从项目根目录加载（开发环境）
        let svg_file = resource_path
            .or_else(|| {
                let dev_path = PathBuf::from("../").join(svg_path);
                if dev_path.exists() {
                    Some(dev_path)
                } else {
                    None
                }
            });
        
        if let Some(path) = svg_file {
            // 读取 SVG 文件内容
            if let Ok(svg_bytes) = fs::read(&path) {
                // 将 currentColor 替换为指定颜色
                let svg_str = String::from_utf8_lossy(&svg_bytes);
                let svg_str = svg_str.replace("currentColor", color);
                let modified_svg_bytes = svg_str.as_bytes().to_vec();
                
                // 将 SVG 转换为位图
                if let Ok(icon) = load_svg_as_image(&modified_svg_bytes) {
                    return icon;
                }
            }
        }
    }
    
    // ICO 文件需要特殊解析，暂时跳过，直接使用 SVG 或备用图标
    // 如果需要支持 ICO，可以使用 image crate 来解析
    
    // 如果都失败了，创建一个简单的白色图标
    let size = 256;
    let rgba: Vec<u8> = (0..size * size * 4)
        .map(|i| {
            match i % 4 {
                0 => 255, // R
                1 => 255, // G
                2 => 255, // B
                3 => 255, // A
                _ => 0,
            }
        })
        .collect();
    tauri::image::Image::new_owned(rgba, size, size)
}

// 使用 resvg 将 SVG 转换为 Image
fn load_svg_as_image(svg_bytes: &[u8]) -> Result<tauri::image::Image<'static>, String> {
    use resvg::usvg::{Options, Tree};
    use resvg::render;
    use tiny_skia::Pixmap;
    
    // 解析 SVG，设置默认大小
    let mut opt = Options::default();
    opt.default_size = resvg::usvg::Size::from_wh(256.0, 256.0).unwrap();
    // fontdb 是 Arc，需要通过 get_mut 或使用默认字体数据库
    // 对于托盘图标，通常不需要加载系统字体，使用默认即可
    
    let tree = Tree::from_data(svg_bytes, &opt)
        .map_err(|e| format!("Failed to parse SVG: {}", e))?;
    
    // 创建位图（托盘图标使用 256x256 以获得更好的显示效果，系统会自动缩放）
    let size = 256u32;
    let mut pixmap = Pixmap::new(size, size)
        .ok_or_else(|| "Failed to create pixmap".to_string())?;
    
    // 填充透明背景（而不是白色），让图标本身显示出来
    pixmap.fill(tiny_skia::Color::from_rgba(0.0, 0.0, 0.0, 0.0).unwrap());
    
    // 渲染 SVG 到位图
    render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    
    // 转换为 RGBA 字节数组
    // tiny_skia 使用 premultiplied alpha，需要转换回 straight alpha
    let rgba_bytes: Vec<u8> = pixmap
        .pixels()
        .iter()
        .flat_map(|p| {
            let a = p.alpha();
            if a == 0 {
                vec![0, 0, 0, 0] // 完全透明
            } else {
                // 从 premultiplied alpha 转换回 straight alpha
                // tiny_skia 的 alpha 范围是 0-255，颜色值也是 0-255 但已预乘
                let a_f32 = a as f32 / 255.0;
                let r = if a_f32 > 0.0 {
                    ((p.red() as f32 / a_f32).min(255.0)) as u8
                } else {
                    0
                };
                let g = if a_f32 > 0.0 {
                    ((p.green() as f32 / a_f32).min(255.0)) as u8
                } else {
                    0
                };
                let b = if a_f32 > 0.0 {
                    ((p.blue() as f32 / a_f32).min(255.0)) as u8
                } else {
                    0
                };
                vec![r, g, b, a]
            }
        })
        .collect();
    
    // 创建 Tauri Image
    Ok(tauri::image::Image::new_owned(
        rgba_bytes,
        size,
        size,
    ))
}

// 可选：在位图转换后调整颜色（如果需要进一步的颜色控制）
// 例如：将图标调整为特定颜色，或应用颜色滤镜
#[allow(dead_code)]
fn adjust_icon_color(
    icon: tauri::image::Image<'static>,
    target_color: (u8, u8, u8), // RGB 目标颜色
) -> tauri::image::Image<'static> {
    let width = icon.width();
    let height = icon.height();
    let mut rgba = icon.rgba().to_vec();
    
    // 遍历每个像素，保留 alpha 通道，但调整 RGB 颜色
    for i in (0..rgba.len()).step_by(4) {
        if i + 3 < rgba.len() {
            let alpha = rgba[i + 3];
            if alpha > 0 {
                // 如果像素不透明，应用目标颜色
                rgba[i] = target_color.0;     // R
                rgba[i + 1] = target_color.1; // G
                rgba[i + 2] = target_color.2;  // B
                // alpha 保持不变
            }
        }
    }
    
    tauri::image::Image::new_owned(rgba, width, height)
}
