param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 65535)]
  [int]$Port,
  [switch]$NonInteractive,
  [switch]$SkipBrowser,
  [string]$ProgressPath,
  [string]$StartupEventName
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "launcherSupport.ps1")
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateRoot = Join-Path $env:LOCALAPPDATA "Serpo"
$logPath = Join-Path $stateRoot "server-$Port.log"

New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
Set-Location $projectRoot
$Host.UI.RawUI.WindowTitle = "Serpo - http://127.0.0.1:$Port"
$env:DATABASE_URL = "file:./data/app.db"

Start-Transcript -Path $logPath -Append | Out-Null
try {
  Write-Host "Preparing Serpo at http://127.0.0.1:$Port ..." -ForegroundColor Cyan

  # Machines set up by the installer carry an app-private portable Node.
  $nodeVersion = (Get-Content -Raw (Join-Path $projectRoot ".node-version")).Trim()
  $portableNode = Join-Path $stateRoot "node-$nodeVersion"
  if (Test-Path (Join-Path $portableNode "node.exe")) {
    if (($env:Path -split ";")[0] -ne $portableNode) {
      $env:Path = "$portableNode;$env:Path"
    }
  }
  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node $nodeVersion (supported: >=24.18.0 <25) from https://nodejs.org, then run this script again."
  }
  # Installs locked packages, generates Prisma, verifies/upgrades the database,
  # and builds production when its inputs changed. No running managed app may
  # share the workspace during this maintenance pass.
  $setupArguments = @("scripts/setup.mjs")
  if ($ProgressPath) { $setupArguments += @("--progress-path", $ProgressPath) }
  & node.exe @setupArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Setup failed with exit code $LASTEXITCODE."
  }
  if (Test-PortInUse $Port) {
    throw "Port $Port became busy during setup. Its process was left untouched; run the Serpo shortcut again to choose an available port."
  }

  Write-Host "Starting Serpo. Use Quit in the app to stop this session." -ForegroundColor Green
  $hostArguments = @("scripts/serpoHost.mjs", "$Port")
  if ($SkipBrowser) { $hostArguments += "--skip-browser" }
  if ($ProgressPath) { $hostArguments += @("--progress-path", $ProgressPath) }
  if ($StartupEventName) {
    $startupEvent = [System.Threading.EventWaitHandle]::OpenExisting($StartupEventName)
    try {
      if (-not $startupEvent.Set()) { throw "Could not signal completion of Serpo setup." }
    } finally { $startupEvent.Dispose() }
  }
  & node.exe @hostArguments
  exit $LASTEXITCODE
} catch {
  Write-SerpoStartupFailure -Path $ProgressPath -Detail $_.Exception.Message
  Write-Host "Serpo could not start: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Log: $logPath" -ForegroundColor Yellow
  if (-not $NonInteractive) {
    Read-Host "Press Enter to close"
  }
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
