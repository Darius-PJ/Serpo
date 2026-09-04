# First-run installer, executed from the installed copy by the self-extracting
# Install-Serpo.cmd (see scripts/buildInstaller.ps1). Provides Node.js if
# the machine has none (official portable build, app-private, no admin rights),
# creates a desktop shortcut, and hands off to the normal launcher.
param([switch]$SkipLaunch)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateRoot = Join-Path $env:LOCALAPPDATA "Serpo"
$portableNode = Join-Path $stateRoot "node"

function Test-NodeVersion {
  try {
    $parts = ((& node.exe -v) -replace "^v", "").Split(".")
    return ([int]$parts[0] -gt 20) -or (([int]$parts[0] -eq 20) -and ([int]$parts[1] -ge 9))
  } catch {
    return $false
  }
}

# A portable Node from an earlier run takes effect before probing.
if (Test-Path (Join-Path $portableNode "node.exe")) {
  $env:Path = "$portableNode;$env:Path"
}

if (Test-NodeVersion) {
  Write-Host "Node.js found." -ForegroundColor Green
} else {
  Write-Host "Downloading Node.js (one time, official nodejs.org build)..." -ForegroundColor Cyan
  $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
  $lts = ($index | Where-Object { $_.lts }) | Select-Object -First 1
  $version = $lts.version
  $zipPath = Join-Path $env:TEMP "node-$version-win-x64.zip"
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$version/node-$version-win-x64.zip" -OutFile $zipPath

  # The published checksum must match before anything from the download runs.
  $shasums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$version/SHASUMS256.txt" -UseBasicParsing).Content
  $expected = ($shasums -split "`n" | Where-Object { $_ -match "node-$version-win-x64\.zip" }) -split "\s+" | Select-Object -First 1
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLower()
  if ($actual -ne $expected) {
    throw "Node.js download failed its checksum (expected $expected, got $actual)."
  }

  $staging = Join-Path $env:TEMP "node-portable-staging"
  if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
  Expand-Archive -Path $zipPath -DestinationPath $staging
  New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
  if (Test-Path $portableNode) { Remove-Item -Recurse -Force $portableNode }
  Move-Item -Path (Join-Path $staging "node-$version-win-x64") -Destination $portableNode
  Remove-Item $zipPath
  Remove-Item -Recurse -Force $staging
  $env:Path = "$portableNode;$env:Path"

  if (-not (Test-NodeVersion)) { throw "The downloaded Node.js did not run correctly." }
  Write-Host "Node.js $version ready (private to Serpo, nothing installed system-wide)." -ForegroundColor Green
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Serpo.lnk"))
$shortcut.TargetPath = Join-Path $projectRoot "Serpo.cmd"
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = (Join-Path $projectRoot "public\Rokuro.ico") + ",0"
$shortcut.Save()
Write-Host "Desktop shortcut created." -ForegroundColor Green

# JobSpy (the LinkedIn/Indeed/Glassdoor/ZipRecruiter/Google source) provisions
# itself in the background - the app is usable immediately, and searches pick
# the source up automatically once this finishes. Log: jobspy-setup.log.
$jobSpyScript = Join-Path $projectRoot "scripts\setupJobSpy.ps1"
$jobSpyLog = Join-Path $stateRoot "jobspy-setup.log"
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
  "-NoProfile", "-ExecutionPolicy", "Bypass",
  "-Command", "Start-Transcript -Path '$jobSpyLog' -Append | Out-Null; try { & '$jobSpyScript' } finally { Stop-Transcript | Out-Null }"
)
Write-Host "JobSpy (extra job source) is installing in the background; see $jobSpyLog if curious." -ForegroundColor Cyan

if ($SkipLaunch) {
  Write-Host "Install finished (launch skipped)." -ForegroundColor Green
} else {
  Write-Host "Starting Serpo - the first run installs its packages and can take a few minutes." -ForegroundColor Cyan
  & cmd.exe /c (Join-Path $projectRoot "Serpo.cmd")
}
