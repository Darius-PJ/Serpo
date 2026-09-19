param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Serpo.lnk"))
$shortcut.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$shortcut.Arguments = "`"$(Join-Path $ProjectRoot 'Serpo.vbs')`""
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.IconLocation = (Join-Path $ProjectRoot "public\Rokuro.ico") + ",0"
$shortcut.Description = "Open Serpo with its server running in the background"
$shortcut.Save()
Write-Host "Updated Serpo desktop shortcut (no console window)."
