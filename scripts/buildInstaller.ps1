# Builds a self-contained installer from committed source only. The bootstrap
# validates/extracts into a unique temporary source tree; install.ps1 prepares a
# separate staged app and never expands an archive over live user data.
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $projectRoot "dist"
if (-not (Test-Path -LiteralPath $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }
if ((Get-Item -LiteralPath $dist -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing linked installer output directory." }
$appZip = Join-Path $dist ("app-snapshot-" + [Guid]::NewGuid().ToString("N") + ".zip")
& git -C $projectRoot archive --format=zip -o $appZip HEAD
if ($LASTEXITCODE -ne 0) { throw "git archive failed with exit code $LASTEXITCODE." }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$snapshot = [IO.Compression.ZipFile]::OpenRead($appZip)
try {
  $names = @($snapshot.Entries | ForEach-Object { $_.FullName })
  foreach ($required in @('LICENSE', '.node-version', 'package.json', 'package-lock.json', 'scripts/install.ps1', 'scripts/installation.mjs', 'scripts/workspaceLock.mjs', 'scripts/runtime.mjs')) {
    if ($names -notcontains $required) { throw "Incomplete committed release source: $required. Commit the release files before packaging; no installer was generated." }
  }
  foreach ($name in $names) {
    $first = $name.Replace('\', '/').Split('/')[0].ToLowerInvariant()
    if ($first -in @('data', '.git') -or ($first.StartsWith('.env') -and $first -ne '.env.example') -or $first.StartsWith('.serpo-')) {
      throw "Committed source contains private workspace state: $name. Refusing to embed it in a shareable installer."
    }
  }
} catch {
  $snapshot.Dispose()
  Remove-Item -LiteralPath $appZip
  throw
} finally { $snapshot.Dispose() }

$bootstrap = @'
param(
  [string]$ProjectRoot = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Serpo"),
  [switch]$SkipLaunch
)
$ErrorActionPreference = "Stop"
function Assert-NoReparse([string]$Path) {
  $current = [IO.Path]::GetFullPath($Path)
  while ($current) {
    if (Test-Path -LiteralPath $current) {
      if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing junction/symbolic link: $current" }
    }
    $parent = Split-Path -Parent $current
    if ($parent -eq $current) { break }
    $current = $parent
  }
}
$lines = [IO.File]::ReadAllLines($env:SERPO_INSTALLER_FILE)
$marker = ':::' + 'PAYLOAD' + ':::'
$at = [Array]::IndexOf($lines, $marker)
if ($at -lt 0 -or $at -ge ($lines.Length - 1)) { throw "Missing installer payload." }
$bytes = [Convert]::FromBase64String([string]::Concat($lines[($at + 1)..($lines.Length - 1)]))
if ($bytes.Length -gt 512MB) { throw "Installer payload exceeds the extraction limit." }
$sha = [Security.Cryptography.SHA256]::Create()
try { $actual = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
finally { $sha.Dispose() }
if ($actual -ne '@SOURCE_SHA256@') { throw "Installer source payload failed its SHA-256 integrity check." }
$work = Join-Path ([IO.Path]::GetTempPath()) ("serpo-install-source-" + [Guid]::NewGuid().ToString("N"))
Assert-NoReparse $work
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $zip = Join-Path $work "source.zip"
  $source = Join-Path $work "source"
  [IO.File]::WriteAllBytes($zip, $bytes)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($zip)
  try {
    if ($archive.Entries.Count -gt 100000) { throw "Too many installer archive entries." }
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    [long]$total = 0
    foreach ($entry in $archive.Entries) {
      $name = $entry.FullName.Replace('\', '/').TrimEnd('/')
      if (-not $name -or [IO.Path]::IsPathRooted($name) -or -not $seen.Add($name)) { throw "Unsafe/duplicate installer archive entry." }
      foreach ($part in $name.Split('/')) {
        if (-not $part -or $part -in @('.', '..') -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)') { throw "Unsafe installer archive path: $name" }
      }
      $first = $name.Split('/')[0].ToLowerInvariant()
      if ($first -in @('data', '.git') -or ($first.StartsWith('.env') -and $first -ne '.env.example') -or $first.StartsWith('.serpo-')) { throw "Installer source contains private workspace state: $name" }
      $kind = ($entry.ExternalAttributes -shr 16) -band 0xF000
      if ($kind -ne 0 -and $kind -ne 0x8000 -and $kind -ne 0x4000) { throw "Installer archive contains a link/device: $name" }
      $total += $entry.Length
      if ($total -gt 512MB) { throw "Expanded installer source exceeds 512 MiB." }
    }
    foreach ($required in @('LICENSE', '.node-version', 'package.json', 'package-lock.json', 'scripts/install.ps1', 'scripts/installation.mjs', 'scripts/workspaceLock.mjs', 'scripts/runtime.mjs')) {
      if (-not $seen.Contains($required)) { throw "Incomplete committed installer source: $required. Commit the release files before packaging." }
    }
  } finally { $archive.Dispose() }
  Expand-Archive -LiteralPath $zip -DestinationPath $source
  & (Join-Path $source 'scripts\install.ps1') -ProjectRoot $ProjectRoot -SkipLaunch:$SkipLaunch
} finally {
  Assert-NoReparse $work
  foreach ($item in Get-ChildItem -LiteralPath $work -Recurse -Force) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Temporary installer tree acquired a link; preserved for manual review: $work" }
  }
  Remove-Item -LiteralPath $work -Recurse -Force
}
'@

try {
  $bootstrap = $bootstrap.Replace('@SOURCE_SHA256@', (Get-FileHash -Algorithm SHA256 -LiteralPath $appZip).Hash.ToLowerInvariant())
  $bootstrap64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bootstrap))
  $payload64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($appZip))
  $stub = @'
@echo off
setlocal DisableDelayedExpansion
title Serpo installer
set "SERPO_INSTALLER_FILE=%~f0"
set "SERPO_PROJECT_ROOT="
set "SERPO_SKIP_LAUNCH="
:arguments
if "%~1"=="" goto install
if /i "%~1"=="-SkipLaunch" (
  set "SERPO_SKIP_LAUNCH=1"
  shift
  goto arguments
)
if /i "%~1"=="-ProjectRoot" (
  if "%~2"=="" exit /b 2
  set "SERPO_PROJECT_ROOT=%~2"
  shift
  shift
  goto arguments
)
echo Usage: Install-Serpo.cmd [-SkipLaunch] [-ProjectRoot "new-or-managed-directory"]
exit /b 2
:install
echo Preparing a verified, staged Serpo installation...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $lines=[IO.File]::ReadAllLines($env:SERPO_INSTALLER_FILE); $a=[Array]::IndexOf($lines,':::'+'BOOTSTRAP'+':::'); $b=[Array]::IndexOf($lines,':::'+'PAYLOAD'+':::'); if($a -lt 0 -or $b -le $a){throw 'Missing installer bootstrap'}; $code=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]::Concat($lines[($a+1)..($b-1)]))); $options=@{SkipLaunch=($env:SERPO_SKIP_LAUNCH -eq '1')}; if($env:SERPO_PROJECT_ROOT){$options.ProjectRoot=$env:SERPO_PROJECT_ROOT}; & ([ScriptBlock]::Create($code)) @options; exit 0 } catch { Write-Error $_; exit 1 }"
set "result=%ERRORLEVEL%"
if not "%result%"=="0" (
  echo Installation failed safely. Review the messages and retained paths above.
  pause
)
exit /b %result%
:::BOOTSTRAP:::
'@
  $chunks = New-Object System.Collections.Generic.List[string]
  $chunks.Add($stub -replace "`r?`n", "`r`n")
  for ($i = 0; $i -lt $bootstrap64.Length; $i += 400) { $chunks.Add($bootstrap64.Substring($i, [Math]::Min(400, $bootstrap64.Length - $i))) }
  $chunks.Add(':::PAYLOAD:::')
  for ($i = 0; $i -lt $payload64.Length; $i += 400) { $chunks.Add($payload64.Substring($i, [Math]::Min(400, $payload64.Length - $i))) }
  $installer = Join-Path $dist "Install-Serpo.cmd"
  if ((Test-Path -LiteralPath $installer) -and ((Get-Item -LiteralPath $installer -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Refusing linked installer output file." }
  [IO.File]::WriteAllText($installer, ($chunks -join "`r`n") + "`r`n", [Text.Encoding]::ASCII)
  $size = [Math]::Round((Get-Item -LiteralPath $installer).Length / 1MB, 2)
  Write-Host "Built $installer ($size MB) from committed source, including LICENSE. No updater or private workspace data." -ForegroundColor Green
} finally { Remove-Item -LiteralPath $appZip }
