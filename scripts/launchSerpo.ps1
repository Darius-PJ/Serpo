param(
  [ValidateRange(1, 65535)]
  [int]$PreferredPort = 3000,
  [switch]$SkipBrowser,
  [switch]$SkipFolder
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "startSerpoServer.ps1"
$stateRoot = Join-Path $env:LOCALAPPDATA "Serpo"
$statePath = Join-Path $stateRoot "launcher-state.json"
$maxPort = [Math]::Min(65535, $PreferredPort + 99)

New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null

function Test-PortInUse([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync("127.0.0.1", $Port)
    if (-not $task.Wait(350)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Test-Serpo([int]$Port) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/dashboard" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -match "Serpo"
  } catch {
    return $false
  }
}

function Open-Workspace([int]$Port) {
  $url = "http://127.0.0.1:$Port/dashboard"
  if (-not $SkipFolder) {
    Start-Process -FilePath "explorer.exe" -ArgumentList @($projectRoot)
  }
  if (-not $SkipBrowser) {
    # Managed sessions own a dedicated browser; focus that window on relaunch.
    $hostStatePath = Join-Path $stateRoot "host-state.json"
    if (Test-Path $hostStatePath) {
      try {
        $hostState = Get-Content -Raw $hostStatePath | ConvertFrom-Json
        if ([int]$hostState.port -eq $Port -and $hostState.projectRoot -eq $projectRoot) {
          Invoke-WebRequest -Uri "http://127.0.0.1:$($hostState.controlPort)/focus" -Method Post -Headers @{ Authorization = "Bearer $($hostState.token)" } -UseBasicParsing -TimeoutSec 5 | Out-Null
          return
        }
      } catch { Write-Host "The previous app window is no longer available." }
    }
    # A pre-update or manually started server cannot own/close a browser window.
    Start-Process $url
  }
  Write-Host "Serpo is ready at $url" -ForegroundColor Green
}

# Reuse the server created by an earlier shortcut launch when it is still healthy.
if (Test-Path $statePath) {
  try {
    $state = Get-Content -Raw $statePath | ConvertFrom-Json
    $statePort = [int]$state.port
    if ($statePort -gt 0 -and (Test-Serpo $statePort)) {
      Write-Host "Reusing the existing Serpo server on port $statePort." -ForegroundColor Cyan
      Open-Workspace $statePort
      exit 0
    }
  } catch {
    Remove-Item $statePath -Force -ErrorAction SilentlyContinue
  }
}

# A manually started copy on the preferred port is safe to reuse.
if ((Test-PortInUse $PreferredPort) -and (Test-Serpo $PreferredPort)) {
  Write-Host "Serpo is already running on port $PreferredPort." -ForegroundColor Cyan
  Open-Workspace $PreferredPort
  exit 0
}

# A fresh machine reaches this point (nothing running to reuse): install
# whatever is missing before booting. Up to date, this passes in seconds.
# Machines set up by the installer carry an app-private portable Node.
$portableNode = Join-Path $stateRoot "node"
if (Test-Path (Join-Path $portableNode "node.exe")) {
  $env:Path = "$portableNode;$env:Path"
}
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install the LTS release from https://nodejs.org, then run this shortcut again."
}
& node.exe (Join-Path $PSScriptRoot "setup.mjs")
if ($LASTEXITCODE -ne 0) { throw "Setup did not complete; see the messages above." }

$selectedPort = $null
for ($port = $PreferredPort; $port -le $maxPort; $port++) {
  if (-not (Test-PortInUse $port)) {
    $selectedPort = $port
    break
  }
  Write-Host "Port $port is already in use; leaving its process untouched." -ForegroundColor Yellow
}

if ($null -eq $selectedPort) {
  throw "No free localhost port was found from $PreferredPort through $maxPort."
}

if ($selectedPort -ne $PreferredPort) {
  Write-Host "Using available port $selectedPort instead." -ForegroundColor Cyan
}

$windowStyle = "Hidden"
$runnerArguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$runnerPath`"",
  "-Port", $selectedPort
)
$runnerArguments += "-NonInteractive"
if ($SkipBrowser) { $runnerArguments += "-SkipBrowser" }
$launchStartedAt = Get-Date
$serverProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $runnerArguments -WorkingDirectory $projectRoot -WindowStyle $windowStyle -PassThru

$deadline = (Get-Date).AddSeconds(120)
function Test-ManagedReady([int]$Port) {
  $hostStatePath = Join-Path $stateRoot "host-state.json"
  try {
    if (-not (Test-Path $hostStatePath)) { return $false }
    if ((Get-Item $hostStatePath).LastWriteTime -lt $launchStartedAt) { return $false }
    $hostState = Get-Content -Raw $hostStatePath | ConvertFrom-Json
    return [int]$hostState.port -eq $Port -and $hostState.projectRoot -eq $projectRoot -and (Test-Serpo $Port)
  } catch { return $false }
}
do {
  if ($serverProcess.HasExited) {
    $logPath = Join-Path $stateRoot "server-$selectedPort.log"
    throw "The server exited before becoming ready. See $logPath"
  }
  Start-Sleep -Milliseconds 500
} until ((Test-ManagedReady $selectedPort) -or (Get-Date) -ge $deadline)

if (-not (Test-ManagedReady $selectedPort)) {
  throw "Serpo did not finish starting within 120 seconds. See the server-$selectedPort.log file."
}

@{
  port = $selectedPort
  processId = $serverProcess.Id
  projectRoot = $projectRoot
  startedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -Encoding UTF8 $statePath

# serpoHost opens and owns the app window; do not open a second browser tab.
if (-not $SkipFolder) { Start-Process -FilePath "explorer.exe" -ArgumentList @($projectRoot) }
Write-Host "Serpo is ready at http://127.0.0.1:$selectedPort/dashboard" -ForegroundColor Green
