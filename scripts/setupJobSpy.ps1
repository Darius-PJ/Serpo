# Provisions the JobSpy job-source: an app-private uv, a managed Python 3.12,
# and python-jobspy in <project>\.venv-jobspy - the conventional path the
# adapter probes when JOBSPY_PYTHON is unset. No admin rights, nothing touches
# the system. Idempotent: a working venv short-circuits. install.ps1 runs this
# hidden in the background so the app is usable while it downloads.
param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$stateRoot = Join-Path $env:LOCALAPPDATA "RokuroSerpo"
$venv = Join-Path $ProjectRoot ".venv-jobspy"
$venvPython = Join-Path $venv "Scripts\python.exe"

function Test-JobSpyReady {
  if (-not (Test-Path $venvPython)) { return $false }
  & $venvPython -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('jobspy') else 1)" 2>$null
  return $LASTEXITCODE -eq 0
}

if (Test-JobSpyReady) {
  Write-Host "JobSpy is already provisioned at $venv."
  exit 0
}

# App-private uv (single binary; manages its own Python downloads).
$uvDir = Join-Path $stateRoot "uv"
$uvExe = Join-Path $uvDir "uv.exe"
if (-not (Test-Path $uvExe)) {
  Write-Host "Downloading uv (official Astral build)..."
  $uvZip = Join-Path $env:TEMP "uv-win64.zip"
  $base = "https://github.com/astral-sh/uv/releases/latest/download"
  Invoke-WebRequest -Uri "$base/uv-x86_64-pc-windows-msvc.zip" -OutFile $uvZip

  # Published checksum must match before the binary runs. GitHub serves the
  # .sha256 as octet-stream, which PowerShell 5.1 returns as a byte array.
  $shaRaw = (Invoke-WebRequest -Uri "$base/uv-x86_64-pc-windows-msvc.zip.sha256" -UseBasicParsing).Content
  if ($shaRaw -is [byte[]]) { $shaRaw = [Text.Encoding]::ASCII.GetString($shaRaw) }
  $expected = ($shaRaw.Trim() -split "\s+")[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $uvZip).Hash.ToLower()
  if ($actual -ne $expected) { throw "uv download failed its checksum (expected $expected, got $actual)." }

  $staging = Join-Path $env:TEMP "uv-staging"
  if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
  Expand-Archive -Path $uvZip -DestinationPath $staging
  New-Item -ItemType Directory -Force -Path $uvDir | Out-Null
  Get-ChildItem $staging -Recurse -Filter "uv*.exe" | ForEach-Object { Copy-Item $_.FullName $uvDir -Force }
  Remove-Item $uvZip
  Remove-Item -Recurse -Force $staging
}

# Keep uv's Python downloads and cache app-private too.
$env:UV_CACHE_DIR = Join-Path $stateRoot "uv-cache"
$env:UV_PYTHON_INSTALL_DIR = Join-Path $stateRoot "uv-python"

# python-jobspy pins numpy 1.26.3, which has no wheel past Python 3.12.
# uv reliably downloads and extracts the interpreter but can exit nonzero on a
# cosmetic version-link step afterwards (seen with uv 0.12.9), so its exit code
# is ignored: python.exe existing is the real success signal, and the venv is
# made by python -m venv directly - no uv interpreter discovery involved.
Write-Host "Downloading Python 3.12 (app-private)..."
& $uvExe python install 3.12 | Out-Null
$pythonDir = Get-ChildItem (Join-Path $env:UV_PYTHON_INSTALL_DIR "cpython-3.12*") -Directory -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName "python.exe") } |
  Select-Object -First 1
if (-not $pythonDir) { throw "uv python install did not produce a Python 3.12 interpreter." }

Write-Host "Creating the JobSpy Python environment..."
# A stale venv is purged with robocopy /MIR from an empty folder: numpy ships
# DLL names long enough that a deep install path exceeds MAX_PATH, which
# Remove-Item and even python -m venv --clear fail on (long-path support is
# off by default in Windows), while robocopy handles any depth.
if (Test-Path $venv) {
  $emptyDir = Join-Path $env:TEMP "rokuroserpo-empty"
  New-Item -ItemType Directory -Force -Path $emptyDir | Out-Null
  robocopy $emptyDir $venv /MIR /NJH /NJS /NDL /NFL | Out-Null
  Remove-Item -Recurse -Force $venv
  Remove-Item -Force $emptyDir
}
& (Join-Path $pythonDir.FullName "python.exe") -m venv $venv
if ($LASTEXITCODE -ne 0) { throw "python -m venv failed with exit code $LASTEXITCODE." }

Write-Host "Installing python-jobspy (a few hundred MB of scientific packages - takes a few minutes)..."
& $uvExe pip install --python $venvPython python-jobspy
if ($LASTEXITCODE -ne 0) { throw "uv pip install failed with exit code $LASTEXITCODE." }

if (-not (Test-JobSpyReady)) { throw "python-jobspy installed but the import probe still fails." }
Write-Host "JobSpy is ready. Searches pick it up automatically within a few minutes (no restart needed)." -ForegroundColor Green
