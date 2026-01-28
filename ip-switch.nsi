; ip-switch.nsi - IP Switch installer script (NSIS Unicode + MUI2)

;--------------------------------
; Basic config

!include "MUI2.nsh"

Name "IP Switch"
OutFile "Ip-Switch-Setup.exe"

;--------------------------------
; Installer / Uninstaller icons (must be defined BEFORE MUI pages are inserted)
;
; Note: This controls the icon of the *installer/uninstaller EXE* (Ip-Switch-Setup.exe / Uninstall.exe),
; not the application's own icon (ip-switch.exe).
!define MUI_ICON   "imgs\ico\logo.ico"
!define MUI_UNICON "imgs\ico\logo.ico"

; Default install dir: Program Files\Ip-Switch
InstallDir "$PROGRAMFILES\Ip-Switch"
InstallDirRegKey HKLM "Software\Ip-Switch" "InstallDir"

; Require admin
RequestExecutionLevel admin

;--------------------------------
; Custom constants (edit for your project)

!define APP_NAME       "IP Switch"
!define APP_EXE        "ip-switch.exe"   ; main exe filename
!define APP_PUBLISHER  "hoochanlon"      ; publisher
!define APP_VERSION    "1.0.0"

; Path to the compiled application executable
; We only need the final exe, not the whole Rust target directory (to keep installer small)
!define APP_SOURCE_EXE "src-tauri\target\release\ip-switch.exe"

;--------------------------------
; Pages

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

;--------------------------------
; Language (must come AFTER the page macros)

!insertmacro MUI_LANGUAGE "SimpChinese"
; !insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Install section

Section "MainSection" SEC_Main
  SetOutPath "$INSTDIR"

  ; Save install dir to registry
  WriteRegStr HKLM "Software\Ip-Switch" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Ip-Switch" "Version" "${APP_VERSION}"
  WriteRegStr HKLM "Software\Ip-Switch" "Publisher" "${APP_PUBLISHER}"

  ; Copy application executable only (avoid bundling all Rust build artifacts)
  File "${APP_SOURCE_EXE}"

  ; Start Menu folder
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"

  ; Start Menu shortcut
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  ; Uninstall shortcut
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"

  ; Desktop shortcut
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  ; Add/Remove Programs info
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "Publisher" "${APP_PUBLISHER}"
  ; Icon and estimated size (for Control Panel)
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  ; EstimatedSize is in KB; here set to ~17 MB
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "EstimatedSize" 8192
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch" "NoRepair" 1

  ; Generate uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

;--------------------------------
; Uninstall section

Section "Uninstall"
  ; Try to kill running process (optional)
  nsExec::ExecToStack 'taskkill /F /IM "${APP_EXE}"'
  Pop $0  ; Exit code (ignored)

  ; Remove files and dir
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\${APP_EXE}"
  ; Add more Delete/RMDir here if needed

  RMDir /r "$INSTDIR"

  ; Delete shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"

  ; Delete registry keys
  DeleteRegKey HKLM "Software\Ip-Switch"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ip-Switch"
SectionEnd