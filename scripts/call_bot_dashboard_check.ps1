param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [Parameter(Mandatory = $true)][string]$User,
  [Parameter(Mandatory = $true)][string]$Pass
)

$Token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:${Pass}"))
$Headers = @{ Authorization = "Basic $Token" }

Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/campaigns" -Headers $Headers | ConvertTo-Json -Depth 12
