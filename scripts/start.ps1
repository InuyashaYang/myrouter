param(
  [Parameter(Mandatory=$true)][string]$UpstreamBaseUrl,
  [Parameter(Mandatory=$true)][string]$UpstreamApiKey,
  [string]$LocalApiKeys = "",
  [string]$AdminApiKeys = "",
  [string]$HostAddr = "127.0.0.1",
  [int]$Port = 8787
)

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root ".gateway.pid"
$outFile = Join-Path $root "gateway.out.log"
$errFile = Join-Path $root "gateway.err.log"

if (Test-Path $pidFile) {
  Write-Host "PID file exists: $pidFile. Run scripts\\stop.ps1 first."
  exit 1
}

$env:UPSTREAM_BASE_URL = $UpstreamBaseUrl
$env:UPSTREAM_API_KEY = $UpstreamApiKey
if ($LocalApiKeys -ne "") { $env:LOCAL_API_KEYS = $LocalApiKeys }
if ($AdminApiKeys -ne "") { $env:ADMIN_API_KEYS = $AdminApiKeys }
$env:LISTEN_HOST = $HostAddr
$env:LISTEN_PORT = "$Port"

$p = Start-Process -FilePath "node" -ArgumentList @("src\\server.js") -WorkingDirectory $root -RedirectStandardOutput $outFile -RedirectStandardError $errFile -PassThru -WindowStyle Hidden

$p.Id | Out-File -FilePath $pidFile -Encoding ascii
Write-Host "Started gateway PID $($p.Id). Out: $outFile Err: $errFile"
