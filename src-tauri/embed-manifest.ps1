# PowerShell 脚本：在构建后嵌入清单文件
# 使用 Windows SDK 的 mt.exe 工具

param(
    [string]$ExePath = "",
    [string]$ManifestPath = "app.manifest"
)

if ([string]::IsNullOrEmpty($ExePath)) {
    Write-Host "错误: 请提供 exe 文件路径" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ManifestPath)) {
    Write-Host "警告: 清单文件不存在: $ManifestPath" -ForegroundColor Yellow
    exit 0
}

# 查找 mt.exe（Windows SDK 工具）
$mtPaths = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.*\x64\mt.exe",
    "${env:ProgramFiles}\Windows Kits\10\bin\10.0.*\x64\mt.exe",
    "${env:ProgramFiles(x86)}\Microsoft SDKs\Windows\v10.0A\bin\NETFX 4.8 Tools\x64\mt.exe"
)

$mtExe = $null
foreach ($path in $mtPaths) {
    $found = Get-ChildItem -Path $path -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {
        $mtExe = $found.FullName
        break
    }
}

if (-not $mtExe) {
    Write-Host "警告: 未找到 mt.exe，跳过清单文件嵌入" -ForegroundColor Yellow
    Write-Host "提示: 请安装 Windows SDK 或手动以管理员身份运行应用" -ForegroundColor Yellow
    exit 0
}

Write-Host "找到 mt.exe: $mtExe" -ForegroundColor Green
Write-Host "嵌入清单文件到: $ExePath" -ForegroundColor Green

# 使用 mt.exe 嵌入清单文件
& $mtExe -manifest $ManifestPath -outputresource:"$ExePath;1"

if ($LASTEXITCODE -eq 0) {
    Write-Host "清单文件嵌入成功" -ForegroundColor Green
} else {
    Write-Host "警告: 清单文件嵌入失败，应用仍可运行但需要手动以管理员身份运行" -ForegroundColor Yellow
}
