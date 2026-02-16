param(
  [string]$HostAddr = "127.0.0.1",
  [int]$PreferredPort = 8787
)

Set-Location -Path $PSScriptRoot
& "scripts\launch.ps1" -HostAddr $HostAddr -PreferredPort $PreferredPort
