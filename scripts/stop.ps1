$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root ".gateway.pid"
$portFile = Join-Path $root ".gateway.port"

if (!(Test-Path $pidFile)) {
  Write-Host "No PID file: $pidFile"
  exit 0
}

$gatewayPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
Remove-Item $pidFile -ErrorAction SilentlyContinue
Remove-Item $portFile -ErrorAction SilentlyContinue

if ($gatewayPid -match "^\d+$") {
  try {
    Stop-Process -Id ([int]$gatewayPid) -Force -ErrorAction Stop
    Write-Host "Stopped gateway PID $gatewayPid"
  } catch {
    Write-Host "Failed to stop PID ${gatewayPid}: $($_.Exception.Message)"
  }
} else {
  Write-Host "Invalid PID content"
}
