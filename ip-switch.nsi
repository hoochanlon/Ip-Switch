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
; Function to close running application
; This function will be called before installation/uninstallation

Function CloseApp
  ; Force kill the process and all child processes
  ; /F = force, /IM = image name, /T = kill child processes
  nsExec::ExecToStack 'taskkill /F /IM "${APP_EXE}" /T'
  Pop $0
  Pop $1
  
  ; Wait for process to fully terminate and verify (retry up to 5 times)
  StrCpy $2 0
  retry_loop:
    Sleep 500
    IntOp $2 $2 + 1
    
    ; Check if process still exists
    ; find returns 0 if found, non-zero if not found
    nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq ${APP_EXE}" 2^>NUL | find /I "${APP_EXE}" >NUL'
    Pop $0
    
    ; If process not found (exit code != 0), we're done
    IntCmp $0 0 still_running
    Goto done
    
    still_running:
      ; If we've tried 5 times, give up and continue anyway
      IntCmp $2 5 done
      Goto retry_loop
  
  done:
FunctionEnd

;--------------------------------
; Install section

Section "MainSection" SEC_Main
  ; Close any running instance before installation
  Call CloseApp
  
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
  ; Close running application before uninstallation
  Call un.CloseApp
  
  ; Wait a bit more to ensure files are released
  Sleep 1000

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

;--------------------------------
; Uninstaller function to close running application

Function un.CloseApp
  ; Force kill the process and all child processes
  ; /F = force, /IM = image name, /T = kill child processes
  nsExec::ExecToStack 'taskkill /F /IM "${APP_EXE}" /T'
  Pop $0
  Pop $1
  
  ; Wait for process to fully terminate and verify (retry up to 5 times)
  StrCpy $2 0
  retry_loop:
    Sleep 500
    IntOp $2 $2 + 1
    
    ; Check if process still exists
    ; find returns 0 if found, non-zero if not found
    nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq ${APP_EXE}" 2^>NUL | find /I "${APP_EXE}" >NUL'
    Pop $0
    
    ; If process not found (exit code != 0), we're done
    IntCmp $0 0 still_running
    Goto done
    
    still_running:
      ; If we've tried 5 times, give up and continue anyway
      IntCmp $2 5 done
      Goto retry_loop
  
  done:
FunctionEnd