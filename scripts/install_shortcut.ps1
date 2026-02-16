param(
  [string]$Name = "MyRouter",
  [string]$IconPath = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "Start-MyRouter.ps1"

if (!(Test-Path $target)) {
  throw "Missing: $target"
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop ("$Name.lnk")

$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)

$sc.TargetPath = "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
$sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$target`""
$sc.WorkingDirectory = $root

if ($IconPath -and (Test-Path $IconPath)) {
  $sc.IconLocation = $IconPath
} else {
  $sc.IconLocation = "$env:SystemRoot\\System32\\shell32.dll,220"
}

$sc.Save()
Write-Host "Created shortcut: $shortcutPath"
