param(
  [ValidateRange(1, 65535)]
  [int]$PreferredPort = 3000,
  [switch]$SkipBrowser,
  [switch]$SkipFolder,
  [switch]$HiddenServerWindow
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "startRokuroSerpoServer.ps1"
$stateRoot = Join-Path $env:LOCALAPPDATA "RokuroSerpo"
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

function Test-RokuroSerpo([int]$Port) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/dashboard" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -match "RokuroSerpo"
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
    Start-Process $url
  }
  Write-Host "RokuroSerpo is ready at $url" -ForegroundColor Green
}

# Reuse the server created by an earlier shortcut launch when it is still healthy.
if (Test-Path $statePath) {
  try {
    $state = Get-Content -Raw $statePath | ConvertFrom-Json
    $statePort = [int]$state.port
    if ($statePort -gt 0 -and (Test-RokuroSerpo $statePort)) {
      Write-Host "Reusing the existing RokuroSerpo server on port $statePort." -ForegroundColor Cyan
      Open-Workspace $statePort
      exit 0
    }
  } catch {
    Remove-Item $statePath -Force -ErrorAction SilentlyContinue
  }
}

# A manually started copy on the preferred port is safe to reuse.
if ((Test-PortInUse $PreferredPort) -and (Test-RokuroSerpo $PreferredPort)) {
  Write-Host "RokuroSerpo is already running on port $PreferredPort." -ForegroundColor Cyan
  Open-Workspace $PreferredPort
  exit 0
}

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

$windowStyle = if ($HiddenServerWindow) { "Hidden" } else { "Normal" }
$runnerArguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$runnerPath`"",
  "-Port", $selectedPort
)
if ($HiddenServerWindow) { $runnerArguments += "-NonInteractive" }
$serverProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $runnerArguments -WorkingDirectory $projectRoot -WindowStyle $windowStyle -PassThru

$deadline = (Get-Date).AddSeconds(120)
do {
  if ($serverProcess.HasExited) {
    $logPath = Join-Path $stateRoot "server-$selectedPort.log"
    throw "The server exited before becoming ready. See $logPath"
  }
  Start-Sleep -Milliseconds 500
} until ((Test-RokuroSerpo $selectedPort) -or (Get-Date) -ge $deadline)

if (-not (Test-RokuroSerpo $selectedPort)) {
  throw "The server did not become ready within 120 seconds. It is still running on port $selectedPort; inspect its window or log."
}

@{
  port = $selectedPort
  processId = $serverProcess.Id
  projectRoot = $projectRoot
  startedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -Encoding UTF8 $statePath

Open-Workspace $selectedPort
