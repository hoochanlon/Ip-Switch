; Inno Setup 安装脚本
; 用于打包 IP 配置管理器

#define AppName "IP 配置管理器"
#define AppNameEn "IP Switch"
#define AppVersion "1.0.0"
#define AppPublisher "hoochanlon"
#define AppURL "https://github.com/hoochanlon/IP-Switch"
#define AppExeName "ip-switch.exe"
#define OutputDir "dist-installer"
; Tauri 2.0 构建输出路径（根据实际构建结果选择）
#define SourceDir "src-tauri\target\release"
; 如果使用 bundle 模式，可能需要：
; #define SourceDir "src-tauri\target\release\bundle\msi"

[Setup]
; 应用信息
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppNameEn}
DefaultGroupName={#AppName}
AllowNoIcons=yes
LicenseFile=
InfoBeforeFile=
InfoAfterFile=
OutputDir={#OutputDir}
OutputBaseFilename=IP-Switch-Setup-{#AppVersion}
SetupIconFile=src-tauri\icons\icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64

; 安装程序外观
WizardImageFile=
WizardSmallImageFile=
WizardImageStretch=no

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
; 主程序文件
Source: "{#SourceDir}\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; 依赖 DLL 文件
Source: "{#SourceDir}\*.dll"; DestDir: "{app}"; Flags: ignoreversion
; 资源文件（如果有）
Source: "{#SourceDir}\resources\*"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs createallsubdirs
; WebView2 运行时（如果需要）
; Source: "redist\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: quicklaunchicon

[Run]
; 安装后运行程序（可选）
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
; 安装 WebView2 运行时（如果需要）
; Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "正在安装 WebView2 运行时..."; Check: not IsWebView2Installed

[Code]
// 检查 WebView2 是否已安装（如果需要）
function IsWebView2Installed: Boolean;
begin
  Result := RegKeyExists(HKEY_LOCAL_MACHINE, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E9C5}');
end;

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Registry]
; 注册表项（如果需要）
; Root: HKLM; Subkey: "Software\{#AppNameEn}"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
