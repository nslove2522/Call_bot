param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$User,
  [Parameter(Mandatory=$true)][string]$Pass
)

$BaseUrl = $BaseUrl.TrimEnd('/')
$Token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:${Pass}"))
$Headers = @{ Authorization = "Basic $Token" }

Invoke-RestMethod `
  -Uri "$BaseUrl/api/dashboard/waiting-calls" `
  -Headers $Headers `
  -Method Get | ConvertTo-Json -Depth 8
