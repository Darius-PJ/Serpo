param(
  [ValidateRange(1, 65535)]
  [int]$PreferredPort = 3000,
  [switch]$SkipBrowser,
  [switch]$SkipFolder,
  [string]$ProgressPath
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "launcherSupport.ps1")
Write-SerpoStartupProgress -Path $ProgressPath -Phase "Checking for a running Serpo"
$projectRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "startSerpoServer.ps1"
$stateRoot = Join-Path $env:LOCALAPPDATA "Serpo"
$statePath = Join-Path $stateRoot "launcher-state.json"
$maxPort = [Math]::Min(65535, $PreferredPort + 99)

New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null


function Test-Serpo([int]$Port) {
  if (-not (Test-PortInUse $Port)) { return $false }
  Add-Type -AssemblyName System.Net.Http
  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.UseProxy = $false
  $handler.AllowAutoRedirect = $false
  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(2)
  $response = $null
  try {
    $response = $client.GetAsync("http://127.0.0.1:$Port/api/health").GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) { return $false }
    $health = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    return $health.app -ceq "serpo" -and $health.status -ceq "ok" -and $health.database -ceq "ok"
  } catch {
    return $false
  } finally {
    if ($response) { $response.Dispose() }
    $client.Dispose()
    $handler.Dispose()
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
$statePort = $null
if (Test-Path $statePath) {
  try {
    $state = Get-Content -Raw $statePath | ConvertFrom-Json
    $statePort = [int]$state.port
    if ($statePort -gt 0 -and (Test-Serpo $statePort)) {
      Write-Host "Reusing the existing Serpo server on port $statePort." -ForegroundColor Cyan
      Open-Workspace $statePort
      return
    }
  } catch {
    $statePort = $null
    Remove-Item $statePath -Force -ErrorAction SilentlyContinue
  }
}

# A manually started copy on the preferred port is safe to reuse.
if ($statePort -ne $PreferredPort -and (Test-Serpo $PreferredPort)) {
  Write-Host "Serpo is already running on port $PreferredPort." -ForegroundColor Cyan
  Open-Workspace $PreferredPort
  return
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

$windowStyle = "Hidden"
$runnerArguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$runnerPath`"",
  "-Port", $selectedPort
)
$runnerArguments += "-NonInteractive"
if ($SkipBrowser) { $runnerArguments += "-SkipBrowser" }
if ($ProgressPath) { $runnerArguments += @("-ProgressPath", "`"$ProgressPath`"") }
$startupEventName = "Local\SerpoStartup-$([Guid]::NewGuid().ToString('N'))"
$startupEvent = New-Object System.Threading.EventWaitHandle($false, [System.Threading.EventResetMode]::ManualReset, $startupEventName)
$runnerArguments += @("-StartupEventName", $startupEventName)
function Test-ManagedReady([int]$Port) {
  $hostStatePath = Join-Path $stateRoot "host-state.json"
  try {
    if (-not (Test-Path $hostStatePath)) { return $false }
    if ((Get-Item $hostStatePath).LastWriteTime -lt $launchStartedAt) { return $false }
    $hostState = Get-Content -Raw $hostStatePath | ConvertFrom-Json
    # The host publishes this only after its health check and app-window launch.
    return [int]$hostState.port -eq $Port -and $hostState.projectRoot -eq $projectRoot
  } catch { return $false }
}
try {
  $launchStartedAt = Get-Date
  $serverProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $runnerArguments -WorkingDirectory $projectRoot -WindowStyle $windowStyle -PassThru
  $deadline = $null
  do {
    if ($serverProcess.HasExited) {
      $logPath = Join-Path $stateRoot "server-$selectedPort.log"
      throw "The server exited before becoming ready. See $logPath"
    }
    # Installation/build time is not part of the runtime startup allowance.
    # A native event, unlike advisory progress, must be delivered before boot.
    if (-not $deadline -and $startupEvent.WaitOne(0)) { $deadline = (Get-Date).AddSeconds(120) }
    $managedReady = Test-ManagedReady $selectedPort
    if (-not $managedReady) { Start-Sleep -Milliseconds 500 }
  } until ($managedReady -or ($deadline -and (Get-Date) -ge $deadline))
  if (-not $managedReady) {
    throw "Serpo did not finish starting within 120 seconds after setup. See the server-$selectedPort.log file."
  }
} finally {
  $startupEvent.Dispose()
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
