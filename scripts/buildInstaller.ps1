# Builds dist\Install-Serpo.cmd: a single shareable file that carries a
# snapshot of the committed tree (git archive HEAD, so nothing untracked or
# ignored - no data, no .env.local) as base64 behind a marker. Double-clicked,
# its stub extracts the app into the user's Documents\Serpo and runs
# scripts\install.ps1 from the installed copy. Rebuild after each release:
# npm run build:installer
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $projectRoot "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$appZip = Join-Path $dist "app-snapshot.zip"
git -C $projectRoot archive --format=zip -o $appZip HEAD
if ($LASTEXITCODE -ne 0) { throw "git archive failed with exit code $LASTEXITCODE." }

# The marker is concatenated at runtime so the stub's own command line never
# matches it; only the real payload divider line does.
$stub = @'
@echo off
title Serpo installer
echo Installing Serpo into your Documents folder...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $marker=':::'+'PAYLOAD'+':::'; $lines=[IO.File]::ReadAllLines('%~f0'); $at=[Array]::IndexOf($lines,$marker); $b64=[string]::Concat($lines[($at+1)..($lines.Length-1)]); $zip=Join-Path $env:TEMP 'Serpo-app.zip'; [IO.File]::WriteAllBytes($zip,[Convert]::FromBase64String($b64)); $dest=Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Serpo'; New-Item -ItemType Directory -Force -Path $dest | Out-Null; Expand-Archive -Path $zip -DestinationPath $dest -Force; Remove-Item $zip; & (Join-Path $dest 'scripts\install.ps1') %*"
if errorlevel 1 (
  echo.
  echo Something went wrong - the messages above say what.
  pause
)
exit /b %ERRORLEVEL%
:::PAYLOAD:::
'@

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($appZip))
$chunks = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $b64.Length; $i += 400) {
  $chunks.Add($b64.Substring($i, [Math]::Min(400, $b64.Length - $i)))
}

$installer = Join-Path $dist "Install-Serpo.cmd"
# CRLF and ASCII keep cmd.exe happy regardless of what edits this file later.
[IO.File]::WriteAllText($installer, ($stub -replace "`r?`n", "`r`n") + "`r`n" + ($chunks -join "`r`n") + "`r`n", [Text.Encoding]::ASCII)
Remove-Item $appZip

$size = [Math]::Round((Get-Item $installer).Length / 1MB, 2)
Write-Host "Built $installer ($size MB) from commit $(git -C $projectRoot rev-parse --short HEAD)." -ForegroundColor Green
