use tauri::image::Image;
use tiny_skia::{Color, Paint, PathBuilder, Pixmap, Transform};

/// 托盘图标生成器
/// 生成一个方形图标，中心显示 "IP" 文字
pub struct TrayIconGenerator {
    /// 图标大小（像素），默认 32x32（类似微信托盘图标大小）
    size: u32,
    /// 背景颜色（RGBA）
    background_color: Color,
    /// 文字颜色（RGBA）
    text_color: Color,
}

impl Default for TrayIconGenerator {
    fn default() -> Self {
        Self::new()
    }
}

impl TrayIconGenerator {
    /// 创建新的托盘图标生成器，使用默认设置
    pub fn new() -> Self {
        Self {
            size: 32,
            background_color: Color::from_rgba(0.2, 0.5, 0.9, 1.0).unwrap(), // 蓝色背景
            text_color: Color::from_rgba(1.0, 1.0, 1.0, 1.0).unwrap(),      // 白色文字
        }
    }

    /// 设置图标大小
    pub fn with_size(mut self, size: u32) -> Self {
        self.size = size;
        self
    }

    /// 设置背景颜色（RGBA，范围 0.0-1.0）
    pub fn with_background_color(mut self, r: f32, g: f32, b: f32, a: f32) -> Self {
        if let Some(color) = Color::from_rgba(r, g, b, a) {
            self.background_color = color;
        }
        self
    }

    /// 设置文字颜色（RGBA，范围 0.0-1.0）
    pub fn with_text_color(mut self, r: f32, g: f32, b: f32, a: f32) -> Self {
        if let Some(color) = Color::from_rgba(r, g, b, a) {
            self.text_color = color;
        }
        self
    }

    /// 生成托盘图标
    pub fn generate(&self) -> Result<Image<'static>, String> {
        // 创建画布
        let mut pixmap = Pixmap::new(self.size, self.size)
            .ok_or_else(|| "Failed to create pixmap".to_string())?;

        // 填充透明背景
        pixmap.fill(Color::from_rgba(0.0, 0.0, 0.0, 0.0).unwrap());

        // 绘制方形背景（带圆角）
        let corner_radius = (self.size as f32 * 0.15).min(4.0); // 圆角半径
        let rect_path = self.create_rounded_rect(0.0, 0.0, self.size as f32, self.size as f32, corner_radius);
        
        let mut paint = Paint::default();
        paint.set_color(self.background_color);
        paint.anti_alias = true;
        pixmap.fill_path(&rect_path, &paint, tiny_skia::FillRule::Winding, Transform::identity(), None);

        // 绘制 "IP" 文字
        self.draw_text(&mut pixmap, "IP")?;

        // 转换为 RGBA 字节数组
        let rgba_bytes: Vec<u8> = pixmap
            .pixels()
            .iter()
            .flat_map(|p| {
                let a = p.alpha();
                if a == 0 {
                    vec![0, 0, 0, 0]
                } else {
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

        Ok(Image::new_owned(rgba_bytes, self.size, self.size))
    }

    /// 创建圆角矩形路径
    fn create_rounded_rect(&self, x: f32, y: f32, width: f32, height: f32, radius: f32) -> tiny_skia::Path {
        let mut pb = PathBuilder::new();
        
        // 左上角
        pb.move_to(x + radius, y);
        // 上边
        pb.line_to(x + width - radius, y);
        // 右上角
        pb.quad_to(x + width, y, x + width, y + radius);
        // 右边
        pb.line_to(x + width, y + height - radius);
        // 右下角
        pb.quad_to(x + width, y + height, x + width - radius, y + height);
        // 下边
        pb.line_to(x + radius, y + height);
        // 左下角
        pb.quad_to(x, y + height, x, y + height - radius);
        // 左边
        pb.line_to(x, y + radius);
        // 左上角
        pb.quad_to(x, y, x + radius, y);
        
        pb.finish().unwrap()
    }

    /// 绘制文字（直接使用 OPPOSans4.0.ttf 栅格化绘制，避免 SVG/resvg 的字体匹配不稳定）
    fn draw_text(&self, pixmap: &mut Pixmap, text: &str) -> Result<(), String> {
        self.draw_text_with_ttf(pixmap, text)
    }

    fn draw_text_with_ttf(&self, pixmap: &mut Pixmap, text: &str) -> Result<(), String> {
        use ab_glyph::{Font, FontArc, PxScale, ScaleFont, point};

        let font_bytes = self
            .load_oppo_font_bytes()
            .ok_or_else(|| "找不到 fonts/OPPOSans4.0.ttf，无法绘制托盘文字".to_string())?;

        let font = FontArc::try_from_vec(font_bytes)
            .map_err(|e| format!("OPPOSans4.0.ttf 解析失败: {}", e))?;

        // 32px 图标下，“IP” 的字号建议略大
        let font_px = (self.size as f32 * 0.62).max(14.0);
        let scale = PxScale::from(font_px);
        let scaled = font.as_scaled(scale);

        // 布局 glyph，计算整体包围盒，做居中
        let mut glyphs = Vec::new();
        let mut caret = point(0.0f32, scaled.ascent());
        for ch in text.chars() {
            let mut g = scaled.scaled_glyph(ch);
            g.position = caret;
            caret.x += scaled.h_advance(g.id);
            glyphs.push(g);
        }

        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        for g in &glyphs {
            if let Some(outlined) = font.outline_glyph(g.clone()) {
                let bb = outlined.px_bounds();
                min_x = min_x.min(bb.min.x);
                min_y = min_y.min(bb.min.y);
                max_x = max_x.max(bb.max.x);
                max_y = max_y.max(bb.max.y);
            }
        }
        if !min_x.is_finite() || !min_y.is_finite() || !max_x.is_finite() || !max_y.is_finite() {
            return Ok(());
        }

        let target_cx = self.size as f32 / 2.0;
        let target_cy = self.size as f32 / 2.0;
        let text_cx = (min_x + max_x) / 2.0;
        let text_cy = (min_y + max_y) / 2.0;
        let dx = target_cx - text_cx;
        let dy = target_cy - text_cy;

        // 写入 pixmap（premultiplied alpha）
        let data = pixmap.data_mut();
        let w = self.size as i32;
        let h = self.size as i32;

        let tr = self.text_color.red();
        let tg = self.text_color.green();
        let tb = self.text_color.blue();
        let ta = self.text_color.alpha(); // 0..1

        for mut g in glyphs {
            g.position.x += dx;
            g.position.y += dy;

            let Some(outlined) = font.outline_glyph(g) else { continue; };
            let bb = outlined.px_bounds();
            let ox = bb.min.x.floor() as i32;
            let oy = bb.min.y.floor() as i32;
            outlined.draw(|x, y, v| {
                let px = ox + x as i32;
                let py = oy + y as i32;
                if px < 0 || py < 0 || px >= w || py >= h {
                    return;
                }

                let a = (v * ta).clamp(0.0, 1.0);
                if a <= 0.0 {
                    return;
                }

                let idx = ((py as usize) * (w as usize) + (px as usize)) * 4;
                if idx + 3 >= data.len() {
                    return;
                }

                // dst（premultiplied）
                let dst_r = data[idx] as f32 / 255.0;
                let dst_g = data[idx + 1] as f32 / 255.0;
                let dst_b = data[idx + 2] as f32 / 255.0;
                let dst_a = data[idx + 3] as f32 / 255.0;

                // src（premultiplied）
                let src_a = a;
                let src_r = tr * src_a;
                let src_g = tg * src_a;
                let src_b = tb * src_a;

                // out = src + dst*(1-src_a)
                let out_a = src_a + dst_a * (1.0 - src_a);
                let out_r = src_r + dst_r * (1.0 - src_a);
                let out_g = src_g + dst_g * (1.0 - src_a);
                let out_b = src_b + dst_b * (1.0 - src_a);

                data[idx] = (out_r.clamp(0.0, 1.0) * 255.0) as u8;
                data[idx + 1] = (out_g.clamp(0.0, 1.0) * 255.0) as u8;
                data[idx + 2] = (out_b.clamp(0.0, 1.0) * 255.0) as u8;
                data[idx + 3] = (out_a.clamp(0.0, 1.0) * 255.0) as u8;
            });
        }

        Ok(())
    }

    fn load_oppo_font_bytes(&self) -> Option<Vec<u8>> {
        use std::fs;
        use std::path::PathBuf;

        // 优先使用编译期内嵌字体，避免 release 运行时找不到资源文件
        //（例如直接运行 target\release\ip-switch.exe 时并不存在 resources/fonts 目录）。
        const EMBEDDED_OPPO: &[u8] = include_bytes!("../../fonts/OPPOSans4.0.ttf");
        if !EMBEDDED_OPPO.is_empty() {
            return Some(EMBEDDED_OPPO.to_vec());
        }

        let mut font_paths = Vec::new();

        // 生产环境常见位置：exe 同级或 resources/fonts 下
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                font_paths.push(exe_dir.join("resources").join("fonts").join("OPPOSans4.0.ttf"));
                font_paths.push(exe_dir.join("fonts").join("OPPOSans4.0.ttf"));
            }
        }

        // 开发环境路径（从 src-tauri 目录运行）
        font_paths.extend(vec![
            PathBuf::from("../fonts/OPPOSans4.0.ttf"),
            PathBuf::from("fonts/OPPOSans4.0.ttf"),
            PathBuf::from("./fonts/OPPOSans4.0.ttf"),
            PathBuf::from("../../fonts/OPPOSans4.0.ttf"),
        ]);

        for p in font_paths {
            if p.exists() {
                if let Ok(b) = fs::read(p) {
                    return Some(b);
                }
            }
        }
        None
    }

}

/// 从十六进制颜色字符串转换为 RGBA 颜色（公开函数）
/// 支持格式: "#RRGGBB" 或 "#RRGGBBAA" 或 "RRGGBB"
pub fn hex_to_rgba(hex: &str) -> Result<(f32, f32, f32, f32), String> {
    let hex = hex.trim().trim_start_matches('#');
    
    if hex.len() == 6 {
        // #RRGGBB 格式
        let r = u8::from_str_radix(&hex[0..2], 16)
            .map_err(|_| "无效的红色分量")?;
        let g = u8::from_str_radix(&hex[2..4], 16)
            .map_err(|_| "无效的绿色分量")?;
        let b = u8::from_str_radix(&hex[4..6], 16)
            .map_err(|_| "无效的蓝色分量")?;
        Ok((r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, 1.0))
    } else if hex.len() == 8 {
        // #RRGGBBAA 格式
        let r = u8::from_str_radix(&hex[0..2], 16)
            .map_err(|_| "无效的红色分量")?;
        let g = u8::from_str_radix(&hex[2..4], 16)
            .map_err(|_| "无效的绿色分量")?;
        let b = u8::from_str_radix(&hex[4..6], 16)
            .map_err(|_| "无效的蓝色分量")?;
        let a = u8::from_str_radix(&hex[6..8], 16)
            .map_err(|_| "无效的透明度分量")?;
        Ok((r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, a as f32 / 255.0))
    } else {
        Err(format!("无效的颜色格式: 期望 6 或 8 位十六进制，得到 {} 位", hex.len()))
    }
}

/// 更新托盘图标颜色（Tauri command）
#[tauri::command]
pub async fn update_tray_icon_color(app: tauri::AppHandle, hex_color: &str) -> Result<(), String> {
    // 解析十六进制颜色
    let (r, g, b, a) = hex_to_rgba(hex_color)?;
    
    // 生成新图标
    let icon = TrayIconGenerator::new()
        .with_size(32)
        .with_background_color(r, g, b, a)
        .with_text_color(1.0, 1.0, 1.0, 1.0) // 文字保持白色
        .generate()
        .map_err(|e| format!("生成托盘图标失败: {}", e))?;
    
    // 获取托盘图标句柄并更新
    use tauri::Manager;
    if let Some(tray_handle) = app.try_state::<std::sync::Mutex<tauri::tray::TrayIcon>>() {
        if let Ok(tray) = tray_handle.lock() {
            tray
                .set_icon(Some(icon))
                .map_err(|e| format!("更新托盘图标失败: {}", e))?;
            return Ok(());
        }
    }
    
    Err("无法获取托盘图标句柄".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tray_icon_generator() {
        let generator = TrayIconGenerator::new()
            .with_size(32)
            .with_background_color(0.2, 0.5, 0.9, 1.0)
            .with_text_color(1.0, 1.0, 1.0, 1.0);
        
        let icon = generator.generate();
        assert!(icon.is_ok());
    }
    
    #[test]
    fn test_hex_to_rgba() {
        assert_eq!(hex_to_rgba("#3366FF").unwrap(), (0.2, 0.4, 1.0, 1.0));
        assert_eq!(hex_to_rgba("3366FF").unwrap(), (0.2, 0.4, 1.0, 1.0));
        assert_eq!(hex_to_rgba("#FF0000FF").unwrap(), (1.0, 0.0, 0.0, 1.0));
    }
}
