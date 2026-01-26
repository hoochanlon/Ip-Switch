@echo off
chcp 65001 >nul
echo ========================================
echo IP 配置管理器 - 安装程序构建脚本
echo ========================================
echo.

echo [1/3] 正在构建前端...
call npm run build
if errorlevel 1 (
    echo 前端构建失败！
    pause
    exit /b 1
)
echo 前端构建完成！
echo.

echo [2/3] 正在构建 Tauri 应用...
call npm run tauri build
if errorlevel 1 (
    echo Tauri 构建失败！
    pause
    exit /b 1
)
echo Tauri 构建完成！
echo.

echo [3/3] 正在编译 Inno Setup 安装程序...
set INNO_PATH="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist %INNO_PATH% (
    set INNO_PATH="C:\Program Files\Inno Setup 6\ISCC.exe"
)
if not exist %INNO_PATH% (
    echo 错误：找不到 Inno Setup Compiler！
    echo 请确保已安装 Inno Setup 6，或手动指定路径。
    pause
    exit /b 1
)

%INNO_PATH% installer.iss
if errorlevel 1 (
    echo Inno Setup 编译失败！
    pause
    exit /b 1
)

echo.
echo ========================================
echo 构建完成！
echo 安装程序位于: dist-installer\IP-Switch-Setup-1.0.0.exe
echo ========================================
pause
