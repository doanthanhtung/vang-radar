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
  "run", "--rm", "--no-deps", "app-setup",
  "sh", "-c", "corepack enable && pnpm --filter @vang-radar/web build"
)

Write-Host "Recreating web only..." -ForegroundColor Cyan
Invoke-Compose -ComposeArguments @("up", "-d", "--no-deps", "--force-recreate", "web")

Write-Host "Web container status:" -ForegroundColor Cyan
Invoke-Compose -ComposeArguments @("ps", "web")

Write-Host "Checking $WebUrl..." -ForegroundColor Cyan
$response = Invoke-WebRequest -Uri $WebUrl -Method Head -TimeoutSec 30
if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
  throw "Web returned HTTP $($response.StatusCode)."
}

Write-Host "Frontend deployed successfully (HTTP $($response.StatusCode))." -ForegroundColor Green
