@echo off
chcp 65001 >nul
echo ========================================
echo IP Switch 安装程序构建脚本
echo ========================================
echo.

REM 检查 NSIS 是否安装
where makensisw >nul 2>&1
if %errorlevel% neq 0 (
    where makensis >nul 2>&1
    if %errorlevel% neq 0 (
        echo [错误] 未找到 NSIS 编译器！
        echo.
        echo 请先安装 NSIS (Unicode 版本):
        echo https://nsis.sourceforge.io/Download
        echo.
        echo 安装时请选择 "Add NSIS to Path"
        echo.
        pause
        exit /b 1
    )
    set NSIS_CMD=makensis
) else (
    set NSIS_CMD=makensisw
)

REM 检查 Tauri 应用是否已构建
if not exist "src-tauri\target\release\ip-switch.exe" (
    echo [警告] 未找到 Tauri 应用的可执行文件！
    echo.
    echo 正在构建 Tauri 应用 (release 模式)...
    echo 这可能需要几分钟时间...
    echo.
    
    call npm run tauri build
    
    if %errorlevel% neq 0 (
        echo.
        echo [错误] Tauri 应用构建失败！
        echo 请检查错误信息并重试。
        echo.
        pause
        exit /b 1
    )
    
    echo.
    echo [成功] Tauri 应用构建完成！
    echo.
)

REM 编译 NSIS 安装脚本
echo ========================================
echo 正在编译 NSIS 安装脚本...
echo ========================================
echo.

%NSIS_CMD% "ip-switch.nsi"

if %errorlevel% neq 0 (
    echo.
    echo [错误] NSIS 安装程序编译失败！
    echo 请检查错误信息。
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo [成功] 安装程序构建完成！
echo ========================================
echo.
echo 安装程序文件: Ip-Switch-Setup.exe
echo.
pause
