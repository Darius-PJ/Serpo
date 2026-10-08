# Removes only unchanged, manifest-owned application files. User data/config,
# browser profiles, shared Node/uv/Python and recovery copies are never purged.
param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
$helper = Join-Path $PSScriptRoot "installation.mjs"
$pinFile = Join-Path $ProjectRoot ".node-version"
if (-not (Test-Path -LiteralPath $pinFile -PathType Leaf)) { throw "A complete installed copy with .node-version is required." }
$current = $ProjectRoot
while ($current) {
  if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing junction/symbolic link: $current" }
  $parent = Split-Path -Parent $current
  if ($parent -eq $current) { break }
  $current = $parent
}
if ((Get-Item -LiteralPath $pinFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing linked Node pin." }
$pin = ([IO.File]::ReadAllText($pinFile)).Trim()
if ($pin -notmatch '^24\.\d+\.\d+$') { throw "Invalid installed Node pin." }
$nodeExe = $null
$systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($systemNode) {
  $version = (& $systemNode.Source -v 2>$null)
  if ($LASTEXITCODE -eq 0 -and $version -eq "v$pin") { $nodeExe = $systemNode.Source }
}
if (-not $nodeExe) {
  $nodeExe = Join-Path $env:LOCALAPPDATA "Serpo\node-$pin\node.exe"
  if (-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) { throw "Pinned Node $pin is required; no runtime was downloaded or deleted." }
  $version = (& $nodeExe -v 2>$null)
  if ($LASTEXITCODE -ne 0 -or $version -ne "v$pin") { throw "Private runtime does not match .node-version; preserved." }
}
& $nodeExe $helper uninstall --root $ProjectRoot
if ($LASTEXITCODE -ne 0) { throw "Uninstall refused/failed; review the error above. No shared runtime/profile purge was attempted." }

# A desktop shortcut is removed only when all three ownership fields match;
# an unrelated Serpo.lnk is preserved even if it happens to share the name.
$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Serpo.lnk"
if (Test-Path -LiteralPath $shortcutPath) {
  if ((Get-Item -LiteralPath $shortcutPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Write-Warning "Linked desktop shortcut preserved: $shortcutPath"
  } else {
    try {
      $shell = New-Object -ComObject WScript.Shell
      $shortcut = $shell.CreateShortcut($shortcutPath)
      $ownedTarget = Join-Path $env:WINDIR "System32\wscript.exe"
      $ownedArguments = '"' + (Join-Path $ProjectRoot "Serpo.vbs") + '"'
      if ($shortcut.TargetPath -eq $ownedTarget -and $shortcut.Arguments -eq $ownedArguments -and $shortcut.WorkingDirectory -eq $ProjectRoot) {
        Remove-Item -LiteralPath $shortcutPath
        Write-Host "Removed the owned desktop shortcut."
      } else { Write-Warning "Unrelated desktop shortcut preserved: $shortcutPath" }
    } catch { Write-Warning "Desktop shortcut preserved (ownership could not be verified): $_" }
  }
}
Write-Host "Residual shared state was not touched: $(Join-Path $env:LOCALAPPDATA 'Serpo')"
Write-Host "Portable backups and .serpo-before-upgrade-* / data.pre-restore-* recovery copies remain where created. Uninstall is not a data wipe."
