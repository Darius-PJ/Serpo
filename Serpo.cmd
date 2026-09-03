@echo off
rem Double-clickable launcher. Windows opens .ps1 files in an editor instead
rem of running them, so this wrapper starts the real launcher; %~dp0 is this
rem file's own folder, so it works from any clone location and any shortcut.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launchSerpo.ps1" %*
