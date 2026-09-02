param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 65535)]
  [int]$Port,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateRoot = Join-Path $env:LOCALAPPDATA "RokuroSerpo"
$logPath = Join-Path $stateRoot "server-$Port.log"

New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
Set-Location $projectRoot
$Host.UI.RawUI.WindowTitle = "RokuroSerpo - http://127.0.0.1:$Port"
$env:DATABASE_URL = "file:./data/app.db"

Start-Transcript -Path $logPath -Append | Out-Null
try {
  Write-Host "Preparing RokuroSerpo at http://127.0.0.1:$Port ..." -ForegroundColor Cyan

  if (Test-Path (Join-Path $projectRoot "data/app.db")) {
    & node.exe "scripts/dbUpgradeAndVerify.mjs" "data/app.db"
  } else {
    Write-Host "Creating the local database..." -ForegroundColor Cyan
    & npx.cmd prisma migrate deploy
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Database preparation failed with exit code $LASTEXITCODE."
  }

  Write-Host "Starting the local server. Keep this window open while using RokuroSerpo." -ForegroundColor Green
  & npm.cmd run dev -- -p $Port
  exit $LASTEXITCODE
} catch {
  Write-Host "RokuroSerpo could not start: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Log: $logPath" -ForegroundColor Yellow
  if (-not $NonInteractive) {
    Read-Host "Press Enter to close"
  }
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
