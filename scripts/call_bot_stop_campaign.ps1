param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$User,
  [Parameter(Mandatory=$true)][string]$Pass,
  [Parameter(Mandatory=$true)][int]$CampaignId
)

$Token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:${Pass}"))
$Headers = @{ Authorization = "Basic $Token" }

Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/campaigns/$CampaignId/stop" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body '{"note":"Campaign stopped from PowerShell"}'
