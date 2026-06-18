param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [Parameter(Mandatory = $true)][string]$User,
  [Parameter(Mandatory = $true)][string]$Pass,
  [Parameter(Mandatory = $true)][int]$CampaignId,
  [string]$OutputPath = ".\campaign_logs_IST.csv"
)

$Token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:${Pass}"))
$Headers = @{ Authorization = "Basic $Token" }
Invoke-WebRequest -Uri "$($BaseUrl.TrimEnd('/'))/api/campaigns/$CampaignId/logs/export" -Headers $Headers -OutFile $OutputPath
Write-Host "Downloaded logs to $OutputPath"
