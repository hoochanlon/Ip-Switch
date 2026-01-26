@echo off
echo 正在以管理员权限启动开发模式...
echo.

:: 检查是否已有管理员权限
net session >nul 2>&1
if %errorLevel% == 0 (
    echo 已有管理员权限，直接启动...
    npm run tauri dev
) else (
    echo 请求管理员权限...
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d %~dp0 && npm run tauri dev' -Verb RunAs"
)
