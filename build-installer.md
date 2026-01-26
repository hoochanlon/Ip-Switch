# Inno Setup 打包指南

## 前置要求

1. **安装 Inno Setup Compiler**
   - 下载地址：https://jrsoftware.org/isdl.php
   - 推荐安装版本：6.2.0 或更高版本
   - 安装时选择 "Install Inno Setup Preprocessor" 和 "Install Inno Script Studio"

2. **构建 Tauri 应用**
   - 确保已经完成 Tauri 应用的构建

## 打包步骤

### 方法一：使用 Inno Setup 脚本（推荐）

1. **构建 Tauri 应用**
   ```bash
   npm run tauri build
   ```
   这会在 `src-tauri/target/release/` 目录下生成可执行文件。

2. **修改 installer.iss 脚本**
   - 检查 `SourceDir` 路径是否正确
   - 确认 `AppExeName` 与构建出的 exe 文件名一致
   - 检查图标路径是否正确

3. **使用 Inno Setup Compiler 编译**
   - 打开 Inno Setup Compiler
   - 文件 → 打开 → 选择 `installer.iss`
   - 构建 → 编译（或按 F9）
   - 安装程序将生成在 `dist-installer` 目录

### 方法二：配置 Tauri 使用 Inno Setup（高级）

如果你想在 `npm run tauri build` 时直接生成 Inno Setup 安装包：

1. **修改 `src-tauri/Cargo.toml`**
   ```toml
   [package.metadata.tauri.bundle]
   icon = ["icons/icon.ico"]
   windows = ["nsis"]  # 改为使用 NSIS，或配置 Inno Setup
   ```

2. **安装 Tauri Inno Setup 插件**（如果可用）
   ```bash
   cargo install tauri-bundler
   ```

## 脚本配置说明

### 关键配置项

- `AppName`: 应用显示名称
- `AppVersion`: 版本号（需与 package.json 和 tauri.conf.json 一致）
- `SourceDir`: Tauri 构建输出目录
- `OutputDir`: 安装程序输出目录
- `PrivilegesRequired`: 设置为 `admin`，因为需要管理员权限修改网络配置

### 自定义选项

1. **添加许可证文件**
   ```iss
   LicenseFile=LICENSE.txt
   ```

2. **添加安装前/后信息**
   ```iss
   InfoBeforeFile=README.md
   InfoAfterFile=CHANGELOG.md
   ```

3. **添加卸载确认**
   ```iss
   [UninstallRun]
   Filename: "{app}\{#AppExeName}"; Parameters: "/uninstall"; RunOnceId: "UninstallApp"
   ```

## 常见问题

### 1. 找不到 DLL 文件

如果安装后程序无法运行，可能是缺少依赖 DLL。解决方法：

```iss
[Files]
Source: "{#SourceDir}\*.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\*.pdb"; DestDir: "{app}"; Flags: ignoreversion
```

### 2. WebView2 运行时

如果应用需要 WebView2，可以在安装脚本中添加：

```iss
[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "正在安装 WebView2 运行时..."
```

### 3. 中文显示问题

确保 Inno Setup 安装了中文语言包，或使用：
```iss
[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
```

## 自动化构建脚本

创建 `build-installer.bat`（Windows）：

```batch
@echo off
echo 正在构建 Tauri 应用...
call npm run tauri build

echo 正在编译 Inno Setup 安装程序...
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss

echo 构建完成！安装程序位于 dist-installer 目录
pause
```

## 测试安装程序

1. 在干净的 Windows 系统上测试
2. 检查是否需要管理员权限
3. 验证所有文件是否正确安装
4. 测试卸载功能

## 签名安装程序（可选）

如果需要代码签名：

```iss
SignTool=signtool
SignedUninstaller=yes
```

然后在编译前配置签名工具。
