# Inno Setup 打包快速指南

## 📦 快速开始

### 方法一：一键构建（推荐）

1. **运行自动化脚本**
   ```bash
   build-installer.bat
   ```
   这会自动完成：
   - 构建前端
   - 构建 Tauri 应用
   - 编译 Inno Setup 安装程序

2. **获取安装程序**
   - 安装程序位于：`dist-installer\IP-Switch-Setup-1.0.0.exe`

### 方法二：手动构建

1. **构建 Tauri 应用**
   ```bash
   npm run tauri build
   ```

2. **打开 Inno Setup Compiler**
   - 启动 Inno Setup Compiler
   - 文件 → 打开 → 选择 `installer.iss`

3. **编译安装程序**
   - 构建 → 编译（或按 F9）
   - 安装程序将生成在 `dist-installer` 目录

## ⚙️ 配置说明

### 修改版本号

在以下文件中同步版本号：
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `installer.iss` (第 6 行)

### 修改应用信息

编辑 `installer.iss` 文件：
```iss
#define AppName "IP 配置管理器"      ; 应用名称
#define AppVersion "1.0.0"           ; 版本号
#define AppPublisher "hoochanlon"     ; 发布者
#define AppURL "https://github.com/hoochanlon/IP-Switch"  ; 项目地址
```

### 检查构建路径

Tauri 构建后，检查可执行文件位置：
- 通常位于：`src-tauri\target\release\ip-switch.exe`
- 如果路径不同，修改 `installer.iss` 中的 `SourceDir`

## 🔧 常见问题

### 1. 找不到 Inno Setup Compiler

**问题**：`build-installer.bat` 提示找不到 Inno Setup

**解决**：
- 确保已安装 Inno Setup 6
- 如果安装在非默认路径，编辑 `build-installer.bat` 修改 `INNO_PATH`

### 2. 找不到可执行文件

**问题**：编译时提示找不到 `ip-switch.exe`

**解决**：
1. 先运行 `npm run tauri build` 确保应用已构建
2. 检查 `src-tauri\target\release\` 目录是否存在 exe 文件
3. 确认 `installer.iss` 中的 `SourceDir` 路径正确

### 3. 安装程序需要管理员权限

**说明**：这是正常的，因为应用需要修改网络配置，必须使用管理员权限。

### 4. 中文显示乱码

**解决**：
- 确保 Inno Setup 安装了中文语言包
- 脚本中已配置中文支持：`Name: "chinesesimp"`

## 📝 自定义安装程序

### 添加许可证文件

1. 创建 `LICENSE.txt`
2. 在 `installer.iss` 中取消注释：
   ```iss
   LicenseFile=LICENSE.txt
   ```

### 添加安装前后信息

1. 创建 `README.md` 或 `CHANGELOG.md`
2. 在 `installer.iss` 中配置：
   ```iss
   InfoBeforeFile=README.md
   InfoAfterFile=CHANGELOG.md
   ```

### 修改安装目录

在 `installer.iss` 中修改：
```iss
DefaultDirName={autopf}\{#AppNameEn}  ; 默认安装到 Program Files
; 或
DefaultDirName={localappdata}\{#AppNameEn}  ; 安装到用户目录
```

## 🚀 发布前检查清单

- [ ] 版本号已更新
- [ ] 应用信息正确
- [ ] 图标路径正确
- [ ] 已测试安装程序
- [ ] 已测试卸载功能
- [ ] 在干净系统上测试过

## 📚 更多信息

详细说明请查看：`build-installer.md`
