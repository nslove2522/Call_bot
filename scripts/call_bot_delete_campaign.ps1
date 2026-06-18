param(
  [Parameter(Mandatory=$true)] [string]$BaseUrl,
  [Parameter(Mandatory=$true)] [string]$User,
  [Parameter(Mandatory=$true)] [string]$Pass,
  [Parameter(Mandatory=$true)] [string]$CampaignId
)

$Token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:${Pass}"))
Invoke-RestMethod `
  -Method Delete `
  -Uri "$BaseUrl/api/campaigns/$CampaignId" `
  -Headers @{ Authorization = "Basic $Token" }
