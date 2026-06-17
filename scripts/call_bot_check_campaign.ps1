param(
  [string]$BaseUrl = "https://call-bot-0n0y.onrender.com",
  [string]$User = "admin",
  [string]$Pass = "admin",
  [int]$CampaignId = 2,
  [string]$AudioUrl = ""
)

$ErrorActionPreference = "Stop"
$Token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:${Pass}"))
$Headers = @{ Authorization = "Basic $Token" }

Write-Host "Checking auth..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "$BaseUrl/api/auth/check" -Headers $Headers | ConvertTo-Json -Depth 8

if ($AudioUrl) {
  Write-Host "Checking audio URL through backend..." -ForegroundColor Cyan
  $EncodedAudioUrl = [uri]::EscapeDataString($AudioUrl)
  Invoke-RestMethod -Uri "$BaseUrl/api/check-audio?url=$EncodedAudioUrl" | ConvertTo-Json -Depth 8
}

Write-Host "Checking campaign status..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "$BaseUrl/api/campaigns/$CampaignId/status" -Headers $Headers | ConvertTo-Json -Depth 20
