param(
  [string]$BaseUrl = "http://127.0.0.1:8787",
  [string]$LocalKey = "",
  [string]$AdminKey = ""
)

$headers = @{}
if ($LocalKey -ne "") { $headers["x-api-key"] = $LocalKey }

$adminHeaders = @{}
if ($AdminKey -ne "") { $adminHeaders["x-admin-key"] = $AdminKey }

Write-Host "GET $BaseUrl/healthz"
Invoke-RestMethod -Method Get -Uri "$BaseUrl/healthz" -Headers $headers | ConvertTo-Json -Depth 5

Write-Host "GET $BaseUrl/v1/models"
Invoke-RestMethod -Method Get -Uri "$BaseUrl/v1/models" -Headers $headers | ConvertTo-Json -Depth 5

Write-Host "GET $BaseUrl/admin/config"
Invoke-RestMethod -Method Get -Uri "$BaseUrl/admin/config" -Headers $adminHeaders | ConvertTo-Json -Depth 10

$body = @{
  model = "claude-sonnet-4-5-20250929-thinking"
  max_tokens = 64
  messages = @(
    @{
      role = "user"
      content = @(
        @{ type = "text"; text = "say ok" }
      )
    }
  )
} | ConvertTo-Json -Depth 10

Write-Host "POST $BaseUrl/v1/messages"
Invoke-RestMethod -Method Post -Uri "$BaseUrl/v1/messages" -Headers $headers -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 10
