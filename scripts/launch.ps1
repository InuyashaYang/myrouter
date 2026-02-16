param(
  [string]$HostAddr = "127.0.0.1",
  [int]$PreferredPort = 8787
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root ".gateway.pid"
$portFile = Join-Path $root ".gateway.port"
$outFile = Join-Path $root "gateway.out.log"
$errFile = Join-Path $root "gateway.err.log"
$runtimeConfig = Join-Path $root "config.runtime.json"

function Test-CommandExists([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Test-PortFree([string]$bindAddr, [int]$port) {
  try {
    $ip = [System.Net.IPAddress]::Parse($bindAddr)
  } catch {
    return $false
  }
  try {
    $listener = [System.Net.Sockets.TcpListener]::new($ip, $port)
    $listener.Start()
    $listener.Stop()
    return $true
  } catch {
    return $false
  }
}

function Get-FreePort([string]$bindAddr, [int]$preferred) {
  if (Test-PortFree $bindAddr $preferred) { return $preferred }
  for ($p = $preferred + 1; $p -le $preferred + 20; $p++) {
    if (Test-PortFree $bindAddr $p) { return $p }
  }
  throw "No free port near $preferred"
}

function Read-PidFile() {
  if (!(Test-Path $pidFile)) { return $null }
  $v = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($v -match "^\d+$") { return [int]$v }
  return $null
}

function Is-ProcessAlive([int]$processId) {
  try {
    $p = Get-Process -Id $processId -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

if (!(Test-CommandExists "node")) {
  Write-Host "node.exe not found. Install Node.js first."
  exit 1
}
if (!(Test-CommandExists "npm")) {
  Write-Host "npm not found. Install Node.js (includes npm)."
  exit 1
}

if (!(Test-Path (Join-Path $root "node_modules"))) {
  Write-Host "Installing dependencies (npm install)..."
  $p = Start-Process -FilePath "npm" -ArgumentList @("install") -WorkingDirectory $root -PassThru -Wait
  if ($p.ExitCode -ne 0) {
    Write-Host "npm install failed (exit $($p.ExitCode))."
    exit 1
  }
}

if (!(Test-Path $runtimeConfig)) {
  "{}" | Out-File -FilePath $runtimeConfig -Encoding ascii
}

$existingPid = Read-PidFile
if ($existingPid -ne $null -and (Is-ProcessAlive $existingPid)) {
  $port = $PreferredPort
  if (Test-Path $portFile) {
    $praw = (Get-Content $portFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($praw -match "^\d+$") { $port = [int]$praw }
  }
  $url = "http://$HostAddr`:$port/admin"
  Start-Process $url | Out-Null
  Write-Host "Gateway already running (PID $existingPid). Opened: $url"
  exit 0
}

$port = Get-FreePort $HostAddr $PreferredPort
$env:LISTEN_HOST = $HostAddr
$env:LISTEN_PORT = "$port"
$env:RUNTIME_CONFIG_PATH = $runtimeConfig

$proc = Start-Process -FilePath "node" -ArgumentList @("src\\server.js") -WorkingDirectory $root -RedirectStandardOutput $outFile -RedirectStandardError $errFile -PassThru -WindowStyle Hidden

$proc.Id | Out-File -FilePath $pidFile -Encoding ascii
$port | Out-File -FilePath $portFile -Encoding ascii

Start-Sleep -Milliseconds 250

$url = "http://$HostAddr`:$port/admin"
Start-Process $url | Out-Null
Write-Host "Started gateway PID $($proc.Id) on ${HostAddr}:$port"
Write-Host "Opened: $url"
