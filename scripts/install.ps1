# Executed from a freshly extracted source tree, never over an existing app.
param(
  [string]$ProjectRoot = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Serpo"),
  [switch]$SkipLaunch
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$sourceRoot = Split-Path -Parent $PSScriptRoot
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)

function Assert-NoReparse([string]$Path) {
  $current = [IO.Path]::GetFullPath($Path)
  while ($current) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing junction/symbolic link: $current" }
    }
    $parent = Split-Path -Parent $current
    if ($parent -eq $current) { break }
    $current = $parent
  }
}

function Test-PinnedNode([string]$Executable, [string]$Pin) {
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
  Assert-NoReparse $Executable
  try { $version = (& $Executable -v 2>$null); return ($LASTEXITCODE -eq 0 -and $version -eq "v$Pin") }
  catch { return $false }
}

Assert-NoReparse $sourceRoot
Assert-NoReparse $ProjectRoot
Assert-NoReparse (Join-Path $sourceRoot ".node-version")
$pin = ([IO.File]::ReadAllText((Join-Path $sourceRoot ".node-version"))).Trim()
if ($pin -notmatch '^24\.\d+\.\d+$') { throw "Missing/invalid shared Node 24 LTS pin in .node-version." }
if (-not $env:LOCALAPPDATA) { throw "LOCALAPPDATA is required for the app-private runtime." }
$stateRoot = Join-Path $env:LOCALAPPDATA "Serpo"
Assert-NoReparse $stateRoot
$portableNode = Join-Path $stateRoot "node-$pin"
$nodeExe = $null
$systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($systemNode -and (Test-PinnedNode $systemNode.Source $pin)) { $nodeExe = $systemNode.Source }
elseif (Test-Path -LiteralPath $portableNode) {
  $candidate = Join-Path $portableNode "node.exe"
  if (-not (Test-PinnedNode $candidate $pin)) { throw "Existing private runtime is not the pinned Node $pin; it was preserved, not overwritten: $portableNode" }
  $receipt = Join-Path $portableNode ".serpo-node-executable.sha256"
  Assert-NoReparse $receipt
  if (-not (Test-Path -LiteralPath $receipt -PathType Leaf) -or
      ([IO.File]::ReadAllText($receipt)).Trim() -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $candidate).Hash.ToLowerInvariant()) {
    throw "Existing private Node runtime failed its saved integrity check; preserved at $portableNode."
  }
  $nodeExe = $candidate
} else {
  Write-Host "Downloading pinned Node.js $pin from nodejs.org..." -ForegroundColor Cyan
  $downloadRoot = Join-Path ([IO.Path]::GetTempPath()) ("serpo-node-" + [Guid]::NewGuid().ToString("N"))
  Assert-NoReparse $downloadRoot
  New-Item -ItemType Directory -Path $downloadRoot | Out-Null
  try {
    $filename = "node-v$pin-win-x64.zip"
    $zipPath = Join-Path $downloadRoot $filename
    $baseUri = "https://nodejs.org/dist/v$pin"
    Invoke-WebRequest -Uri "$baseUri/$filename" -OutFile $zipPath -UseBasicParsing
    $shasums = (Invoke-WebRequest -Uri "$baseUri/SHASUMS256.txt" -UseBasicParsing).Content
    $matches = @($shasums -split "`n" | Where-Object { $_ -match ("^([a-fA-F0-9]{64})\s+" + [regex]::Escape($filename) + "\s*$") })
    if ($matches.Count -ne 1) { throw "Official checksum list has no unique checksum for $filename." }
    $expected = ($matches[0] -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "Node.js download failed official SHA-256 verification." }
    $expanded = Join-Path $downloadRoot "expanded"
    Expand-Archive -LiteralPath $zipPath -DestinationPath $expanded
    $verifiedNode = Join-Path $expanded "node-v$pin-win-x64"
    $verifiedExe = Join-Path $verifiedNode "node.exe"
    if (-not (Test-PinnedNode $verifiedExe $pin)) { throw "Verified Node archive did not run the pinned version." }
    [IO.File]::WriteAllText((Join-Path $verifiedNode ".serpo-node-executable.sha256"), (Get-FileHash -Algorithm SHA256 -LiteralPath $verifiedExe).Hash.ToLowerInvariant())
    Assert-NoReparse $stateRoot
    if (-not (Test-Path -LiteralPath $stateRoot)) { New-Item -ItemType Directory -Path $stateRoot | Out-Null }
    if (Test-Path -LiteralPath $portableNode) { throw "Private runtime destination appeared during download; refusing overwrite." }
    Move-Item -LiteralPath $verifiedNode -Destination $portableNode
    $nodeExe = Join-Path $portableNode "node.exe"
  } finally {
    # This unique directory contains only our verified download, never an app,
    # user config or shared runtime. Reparse points are refused before cleanup.
    Assert-NoReparse $downloadRoot
    Remove-Item -LiteralPath $downloadRoot -Recurse -Force
  }
}
$env:Path = "$(Split-Path -Parent $nodeExe);$env:Path"

# Dependencies, migrations and the production build happen in staging. The
# helper holds the destination lease through a rollback-capable child cutover.
& $nodeExe (Join-Path $sourceRoot "scripts\installation.mjs") install --source $sourceRoot --root $ProjectRoot
if ($LASTEXITCODE -ne 0) { throw "Staged installation failed; see the retained/recovery paths above. Prior app/data/config were not discarded." }

try {
  & (Join-Path $ProjectRoot "scripts\createShortcut.ps1") -ProjectRoot $ProjectRoot
} catch { Write-Warning "The app is installed, but the desktop shortcut was not changed: $_" }

# Optional JobSpy provision is outside app cutover. Its shared Python/uv state
# is not deleted by upgrade/uninstall. Failure does not discard a working app.
$jobSpyScript = Join-Path $ProjectRoot "scripts\setupJobSpy.ps1"
$jobSpyLog = Join-Path $stateRoot "jobspy-setup.log"
if (Test-Path -LiteralPath $jobSpyScript) {
  $quotedScript = $jobSpyScript.Replace("'", "''")
  $quotedLog = $jobSpyLog.Replace("'", "''")
  Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
    "Start-Transcript -Path '$quotedLog' -Append | Out-Null; try { & '$quotedScript' } finally { Stop-Transcript | Out-Null }"
  )
  Write-Host "Optional JobSpy setup is running; log: $jobSpyLog" -ForegroundColor Cyan
}
if ($SkipLaunch) { Write-Host "Install finished (launch skipped)." -ForegroundColor Green }
else { & cmd.exe /c (Join-Path $ProjectRoot "Serpo.cmd") }
