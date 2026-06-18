param(
  [Parameter(Mandatory=$true)] [string]$BaseUrl,
  [Parameter(Mandatory=$true)] [string]$User,
  [Parameter(Mandatory=$true)] [string]$Pass
)

$Token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:${Pass}"))
Invoke-RestMethod `
  -Method Delete `
  -Uri "$BaseUrl/api/logs" `
  -Headers @{ Authorization = "Basic $Token" }
