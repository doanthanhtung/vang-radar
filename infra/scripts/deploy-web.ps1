param(
  [string]$WebUrl = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$composeFile = Join-Path $repoRoot "infra\docker-compose.home-server.yml"

if (-not (Test-Path $composeFile)) {
  throw "Không tìm thấy production Compose: $composeFile"
}

Set-Location $repoRoot

function Invoke-Compose {
  param([string[]]$ComposeArguments)

  & docker compose -f $composeFile @ComposeArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose thất bại (exit code $LASTEXITCODE)."
  }
}

Write-Host "Building production frontend..." -ForegroundColor Cyan
Invoke-Compose -ComposeArguments @(
  "run", "--rm", "--no-deps", "-e", "NODE_ENV=production", "app-setup",
  "sh", "-c", "corepack enable && pnpm --filter @vang-radar/web build"
)

Write-Host "Recreating web only..." -ForegroundColor Cyan
Invoke-Compose -ComposeArguments @("up", "-d", "--no-deps", "--force-recreate", "web")

Write-Host "Web container status:" -ForegroundColor Cyan
Invoke-Compose -ComposeArguments @("ps", "web")

Write-Host "Checking $WebUrl..." -ForegroundColor Cyan
$statusCode = $null
for ($attempt = 1; $attempt -le 60; $attempt++) {
  $statusCode = & curl.exe --silent --output NUL --write-out "%{http_code}" --max-time 5 $WebUrl
  if ($LASTEXITCODE -eq 0 -and $statusCode -match "^2\d\d$") {
    break
  }
  Start-Sleep -Seconds 1
}

if ($null -eq $statusCode -or $statusCode -lt 200 -or $statusCode -ge 400) {
  throw "Web chưa sẵn sàng tại $WebUrl. Xem log: docker compose -f $composeFile logs --tail 80 web"
}

Write-Host "Frontend deployed successfully (HTTP $statusCode)." -ForegroundColor Green
