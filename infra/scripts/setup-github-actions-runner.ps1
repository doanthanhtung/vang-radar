param(
  [string]$Repo = "doanthanhtung/vang-radar",
  [string]$RunnerRoot = "$env:USERPROFILE\actions-runner\vang-radar",
  [string]$RunnerName = "$env:COMPUTERNAME-vang-radar",
  [string]$RunnerLabel = "vang-radar-prod",
  [string]$ProductionEnvPath,
  [switch]$SetProductionEnvSecret,
  [switch]$AsService
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if ([string]::IsNullOrWhiteSpace($ProductionEnvPath)) {
  $ProductionEnvPath = Join-Path $repoRoot ".env"
}

$ghCommand = Get-Command gh -ErrorAction SilentlyContinue
$gh = if ($ghCommand) { $ghCommand.Source } else { $null }
if (-not $gh) {
  $gh = @(
    "C:\Program Files\GitHub CLI\gh.exe",
    "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $gh) {
  throw "GitHub CLI is not installed. Install it with: winget install --id GitHub.cli --exact"
}

& $gh auth status
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not authenticated. Run: gh auth login --hostname github.com --git-protocol https --web --scopes repo,workflow,admin:repo_hook"
}

if ($SetProductionEnvSecret) {
  if (-not (Test-Path $ProductionEnvPath)) {
    throw "Production env file not found: $ProductionEnvPath"
  }

  Write-Host "Setting GitHub secret PRODUCTION_ENV from $ProductionEnvPath..." -ForegroundColor Cyan
  & $gh secret set PRODUCTION_ENV --repo $Repo --body-file $ProductionEnvPath
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to set GitHub secret PRODUCTION_ENV."
  }
}

New-Item -ItemType Directory -Force -Path $RunnerRoot | Out-Null
Set-Location $RunnerRoot
$restartServiceForDockerAccess = $false

if (-not (Test-Path ".\config.cmd")) {
  Write-Host "Downloading latest GitHub Actions runner..." -ForegroundColor Cyan
  $releaseJson = & $gh api repos/actions/runner/releases/latest
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to fetch latest GitHub Actions runner release."
  }

  $release = $releaseJson | ConvertFrom-Json
  $asset = $release.assets | Where-Object { $_.name -like "actions-runner-win-x64-*.zip" } | Select-Object -First 1
  if (-not $asset) {
    throw "Could not find Windows x64 runner asset in latest release."
  }

  $zipPath = Join-Path $RunnerRoot $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath
  Expand-Archive -Path $zipPath -DestinationPath $RunnerRoot -Force
  Remove-Item $zipPath
}

if ($AsService) {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Installing the runner as a Windows service requires an elevated PowerShell session."
  }

  # The default runner location is under the current user's profile. Network Service
  # needs read/execute permission on every parent directory to reach the runner root.
  $runnerParent = Split-Path $RunnerRoot -Parent
  foreach ($parentPath in @($env:USERPROFILE, $runnerParent) | Select-Object -Unique) {
    & icacls.exe $parentPath /grant '*S-1-5-20:(RX)' | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to grant Network Service access to $parentPath."
    }
  }

  $dockerUsersGroup = Get-LocalGroup -Name "docker-users" -ErrorAction SilentlyContinue
  if ($dockerUsersGroup) {
    $networkServiceSid = "S-1-5-20"
    $hasDockerAccess = Get-LocalGroupMember -Group $dockerUsersGroup.Name -ErrorAction Stop |
      Where-Object { $_.SID.Value -eq $networkServiceSid }
    if (-not $hasDockerAccess) {
      Write-Host "Granting the runner service access to Docker Desktop..." -ForegroundColor Cyan
      Add-LocalGroupMember -Group $dockerUsersGroup.Name -Member $networkServiceSid
      $restartServiceForDockerAccess = $true
    }
  }

  if ((Test-Path ".\.runner") -and -not (Test-Path ".\.service")) {
    Write-Host "Reconfiguring the existing runner as a Windows service..." -ForegroundColor Cyan
    $removeToken = & $gh api --method POST "repos/$Repo/actions/runners/remove-token" --jq ".token"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($removeToken)) {
      throw "Failed to create GitHub Actions runner removal token."
    }

    & .\config.cmd remove --token $removeToken
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to remove the existing runner configuration."
    }
  }
}

if (-not (Test-Path ".\.runner")) {
  Write-Host "Registering runner $RunnerName for $Repo..." -ForegroundColor Cyan
  $registrationToken = & $gh api --method POST "repos/$Repo/actions/runners/registration-token" --jq ".token"
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($registrationToken)) {
    throw "Failed to create GitHub Actions runner registration token."
  }

  $configArguments = @(
    "--unattended",
    "--url", "https://github.com/$Repo",
    "--token", $registrationToken,
    "--name", $RunnerName,
    "--labels", $RunnerLabel,
    "--work", "_work",
    "--replace"
  )
  if ($AsService) {
    $configArguments += "--runasservice"
  }

  & .\config.cmd @configArguments

  if ($LASTEXITCODE -ne 0) {
    throw "Runner registration failed."
  }
} else {
  Write-Host "Runner is already registered at $RunnerRoot." -ForegroundColor Yellow
}

if ($AsService) {
  $serviceName = Get-Content ".\.service" -ErrorAction Stop | Select-Object -First 1
  $service = Get-Service -Name $serviceName -ErrorAction Stop
  if ($restartServiceForDockerAccess -and $service.Status -eq "Running") {
    Write-Host "Restarting runner service to apply Docker access..." -ForegroundColor Cyan
    Restart-Service -Name $serviceName
    $service.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
  } elseif ($service.Status -ne "Running") {
    Write-Host "Starting runner service..." -ForegroundColor Cyan
    Start-Service -Name $serviceName
    $service.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
  }
} else {
  Write-Host "Starting runner in this user session..." -ForegroundColor Cyan
  Start-Process -FilePath ".\run.cmd" -WorkingDirectory $RunnerRoot -WindowStyle Hidden
}

Write-Host "GitHub Actions runner is ready with label: $RunnerLabel" -ForegroundColor Green
