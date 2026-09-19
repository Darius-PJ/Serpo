param(
  [ValidateRange(1, 65535)][int]$PreferredPort = 3000,
  [switch]$SkipBrowser
)
$ErrorActionPreference = "Stop"
$stateRoot = Join-Path $env:LOCALAPPDATA "Serpo"
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
Start-Transcript -Path (Join-Path $stateRoot "launcher.log") -Append | Out-Null
try {
  & (Join-Path $PSScriptRoot "launchSerpo.ps1") -PreferredPort $PreferredPort -SkipBrowser:$SkipBrowser -SkipFolder
} catch {
  Write-Error $_ -ErrorAction Continue
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
