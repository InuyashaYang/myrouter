param(
  [Parameter(Mandatory=$true)][string]$UpstreamBaseUrl,
  [Parameter(Mandatory=$true)][string]$UpstreamApiKey,
  [string]$LocalApiKeys = "",
  [string]$AdminApiKeys = ""
)

$env:UPSTREAM_BASE_URL = $UpstreamBaseUrl
$env:UPSTREAM_API_KEY = $UpstreamApiKey
if ($LocalApiKeys -ne "") { $env:LOCAL_API_KEYS = $LocalApiKeys }
if ($AdminApiKeys -ne "") { $env:ADMIN_API_KEYS = $AdminApiKeys }

node "src/server.js"
