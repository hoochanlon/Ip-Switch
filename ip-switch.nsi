; ip-switch.nsi - IP Switch 安装脚本示例（基于 NSIS Unicode + MUI2）

;--------------------------------
; 基本配置

!include "MUI2.nsh"

Name "IP Switch"
OutFile "Ip-Switch-Setup.exe"

; 默认安装到 Program Files\Ip-Switch
InstallDir "$PROGRAMFILES\Ip-Switch"
InstallDirRegKey HKLM "Software\Ip-Switch" "InstallDir"

; 需要管理员权限
RequestExecutionLevel admin

; 使用中文界面（需要 NSIS Unicode + 对应语言文件）
!insertmacro MUI_LANGUAGE "SimpChinese"

;--------------------------------
; 自定义常量（请根据你的项目实际情况修改）

!define APP_NAME       "IP Switch"
!define APP_EXE        "Ip-Switch.exe"   ; 主程序文件名
!define APP_PUBLISHER  "Your Company"    ; 发布者名称
!define APP_VERSION    "1.0.0"

; 构建输出目录（你的编译结果所在目录，按需修改）
!define SOURCE_DIR     "build\Ip-Switch"  ; 例如：.exe 和资源所在文件夹

;--------------------------------
; 页面设置

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

;--------------------------------
; 安装节

Section "MainSection" SEC_Main
  SetOutPath "$INSTDIR"

  ; 保存安装目录到注册表
  WriteRegStr HKLM "Software\Ip-Switch" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Ip-Switch" "Version" "${APP_VERSION}"
  WriteRegStr HKLM "Software\Ip-Switch" "Publisher" "${APP_PUBLISHER}"

  ; 复制所有文件（递归）
  ; 注意：/x 用于排除不需要的文件，可按需加规则
  File /r "${SOURCE_DIR}\*.*"

  ; 创建开始菜单目录
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"

  ; 开始菜单快捷方式
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  ; 卸载快捷方式
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\卸载 ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"

  ; 桌面快捷方式
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  ; 写入卸载信息到“添加/删除程序”
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "Publisher" "${APP_PUBLISHER}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "NoRepair" 1

  ; 生成卸载程序
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

;--------------------------------
; 卸载节

Section "Uninstall"
  ; 关闭正在运行的程序（简单方式：尝试关闭同名进程）
  ; 若不需要可注释掉
  nsExec::ExecToStack 'taskkill /F /IM "${APP_EXE}"'
  Pop $0  ; 退出码（忽略）

  ; 删除文件和目录
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\${APP_EXE}"
  ; 如有额外子目录/文件，可在下方按需添加 Delete / RMDir 命令

  RMDir /r "$INSTDIR"

  ; 删除快捷方式
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\卸载 ${APP_NAME}.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"

  ; 删除注册表
  DeleteRegKey HKLM "Software\Ip-Switch"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch"
SectionEnd