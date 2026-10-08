param(
  [ValidateRange(1, 65535)][int]$PreferredPort = 3000,
  [switch]$SkipBrowser
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "launcherSupport.ps1")
$stateRoot = Join-Path $env:LOCALAPPDATA "Serpo"
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
$logPath = Join-Path $stateRoot "launcher.log"
$progressPath = Join-Path $stateRoot ("startup-{0}.json" -f [Guid]::NewGuid().ToString("N"))
$window = $null
$exitCode = 0
$terminalPublished = $false
Start-Transcript -Path $logPath -Append | Out-Null
try {
  Write-SerpoStartupProgress -Path $progressPath -Phase "Checking setup"
  $windowArguments = @(
    "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass",
    "-File", "`"$(Join-Path $PSScriptRoot 'showStartupProgress.ps1')`"",
    "-ProgressPath", "`"$progressPath`"", "-LauncherProcessId", "$PID",
    "-LogPath", "`"$logPath`""
  )
  $window = Start-Process -FilePath "powershell.exe" -ArgumentList $windowArguments -WindowStyle Hidden -PassThru
  & (Join-Path $PSScriptRoot "launchSerpo.ps1") -PreferredPort $PreferredPort -SkipBrowser:$SkipBrowser -SkipFolder -ProgressPath $progressPath
  $terminalPublished = Write-SerpoStartupProgress -Path $progressPath -Phase "Serpo is ready" -State "ready" -PassThru
} catch {
  Write-Error $_ -ErrorAction Continue
  $terminalPublished = Write-SerpoStartupFailure -Path $progressPath -Detail $_.Exception.Message -PassThru
  $exitCode = 1
} finally {
  if ($window) {
    # Never wait for acknowledgment of a status the window could not receive.
    # This is only our presentation process, not setup or the managed server.
    if (-not $terminalPublished -and -not $window.HasExited) { $window.Kill() }
    $window.WaitForExit()
    if ($exitCode -ne 0 -and $window.ExitCode -eq 2) { $exitCode = 2 }
    $window.Dispose()
  }
  Remove-Item -LiteralPath $progressPath -Force -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}
exit $exitCode
