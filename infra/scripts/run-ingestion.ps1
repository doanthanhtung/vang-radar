param(
  [string]$ApiBaseUrl = "http://localhost:4000/api/v1",
  [string]$Username = "admin",
  [string]$Password = "change_me"
)

$pair = "$Username`:$Password"
$encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/admin/jobs/run-ingestion" -Headers @{ Authorization = "Basic $encoded" }
