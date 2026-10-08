param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Serpo.lnk"
$shell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $shortcutPath) {
  if ((Get-Item -LiteralPath $shortcutPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing linked desktop shortcut: $shortcutPath" }
  $existing = $shell.CreateShortcut($shortcutPath)
  $expectedTarget = Join-Path $env:WINDIR "System32\wscript.exe"
  $expectedArguments = '"' + (Join-Path $ProjectRoot "Serpo.vbs") + '"'
  if ($existing.TargetPath -ne $expectedTarget -or $existing.Arguments -ne $expectedArguments -or $existing.WorkingDirectory -ne $ProjectRoot) {
    throw "An unrelated Serpo.lnk already exists; it was not overwritten."
  }
}
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$shortcut.Arguments = "`"$(Join-Path $ProjectRoot 'Serpo.vbs')`""
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.IconLocation = (Join-Path $ProjectRoot "public\Rokuro.ico") + ",0"
$shortcut.Description = "Open Serpo with its server running in the background"
$shortcut.Save()
Write-Host "Updated Serpo desktop shortcut (no console window)."
