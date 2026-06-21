param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$composeFile = Join-Path $repoRoot "infra\docker-compose.preview.yml"
$previewUrl = "http://localhost:3001"

if (-not (Test-Path $composeFile)) {
  throw "Không tìm thấy preview Compose: $composeFile"
}

Set-Location $repoRoot

& docker compose -p vang-radar-preview -f $composeFile up -d
if ($LASTEXITCODE -ne 0) {
  throw "Không thể khởi động web preview (exit code $LASTEXITCODE)."
}

Write-Host "Waiting for $previewUrl..." -ForegroundColor Cyan
$statusCode = $null
for ($attempt = 1; $attempt -le 180; $attempt++) {
  $statusCode = & curl.exe --silent --output NUL --write-out "%{http_code}" --max-time 5 $previewUrl
  if ($LASTEXITCODE -eq 0 -and $statusCode -match "^2\d\d$") {
    break
  }
  Start-Sleep -Seconds 1
}

if ($null -eq $statusCode -or $statusCode -notmatch "^2\d\d$") {
  throw "Web preview chưa sẵn sàng. Xem log: docker compose -p vang-radar-preview -f $composeFile logs --tail 80 web-preview"
}

Write-Host "Preview ready (HTTP $statusCode): $previewUrl" -ForegroundColor Green
if (-not $NoBrowser) {
  Start-Process $previewUrl
}
