param(
  [Parameter(Mandatory = $true)][string]$ProgressPath,
  [Parameter(Mandatory = $true)][int]$LauncherProcessId,
  [Parameter(Mandatory = $true)][string]$LogPath
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SerpoStartupWindow {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr window, int command);
}
"@
[System.Windows.Forms.Application]::EnableVisualStyles()
$launcher = Get-Process -Id $LauncherProcessId -ErrorAction Stop
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$script:finished = $false
$script:failed = $false

$form = New-Object System.Windows.Forms.Form
$form.Text = "Starting Serpo"
$form.ClientSize = New-Object System.Drawing.Size(520, 300)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.AutoScaleMode = "Dpi"
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)
# The hidden PowerShell startup flag also hides its first form unless explicitly shown.
$form.Add_Shown({ [void][SerpoStartupWindow]::ShowWindow($form.Handle, 1) })

$heading = New-Object System.Windows.Forms.Label
$heading.Text = "Starting Serpo"
$heading.Font = New-Object System.Drawing.Font("Segoe UI", 16)
$heading.SetBounds(24, 20, 472, 36)
$form.Controls.Add($heading)

$phase = New-Object System.Windows.Forms.Label
$phase.Text = "Checking setup..."
$phase.SetBounds(24, 68, 472, 28)
$form.Controls.Add($phase)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Style = "Marquee"
$progress.MarqueeAnimationSpeed = 30
$progress.SetBounds(24, 104, 472, 12)
$form.Controls.Add($progress)

$detail = New-Object System.Windows.Forms.TextBox
$detail.Multiline = $true
$detail.ReadOnly = $true
$detail.BorderStyle = "None"
$detail.BackColor = $form.BackColor
$detail.ScrollBars = "Vertical"
$detail.Text = "First-time setup or an update can take a few minutes. You can minimize this window; Serpo will open when ready."
$detail.SetBounds(24, 132, 472, 72)
$form.Controls.Add($detail)
$defaultDetail = $detail.Text

$elapsed = New-Object System.Windows.Forms.Label
$elapsed.SetBounds(24, 216, 472, 24)
$form.Controls.Add($elapsed)

$logs = New-Object System.Windows.Forms.Button
$logs.Text = "View logs"
$logs.SetBounds(24, 252, 110, 30)
$logs.Add_Click({ Start-Process -FilePath "explorer.exe" -ArgumentList @((Split-Path -Parent $LogPath)) })
$form.Controls.Add($logs)

$close = New-Object System.Windows.Forms.Button
$close.Text = "Close"
$close.SetBounds(386, 252, 110, 30)
$close.Visible = $false
$close.Add_Click({ $form.Close() })
$form.Controls.Add($close)

function Show-StartupFailure([string]$Message) {
  $script:finished = $true
  $script:failed = $true
  $clock.Stop()
  $heading.Text = "Serpo could not start"
  $form.Text = "Serpo startup failed"
  $progress.Style = "Blocks"
  $progress.Value = 0
  $detail.Text = "$Message`r`n`r`nLogs: $LogPath"
  $close.Visible = $true
  $form.AcceptButton = $close
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
  $elapsed.Text = "Elapsed: {0:mm\:ss}" -f $clock.Elapsed
  if ($script:finished) { return }
  try {
    # A writer may be replacing the file; keep the last good phase until next tick.
    $stream = [System.IO.File]::Open($ProgressPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete))
    $reader = New-Object System.IO.StreamReader($stream)
    try { $json = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $status = $json | ConvertFrom-Json
    if ($status.phase) { $phase.Text = $status.phase }
    if ($status.state -eq "ready") {
      $script:finished = $true
      $form.Close()
      return
    }
    if ($status.state -eq "failed") {
      Show-StartupFailure $status.detail
      return
    }
    $detail.Text = if ($status.detail) { $status.detail } else { $defaultDetail }
  } catch { }
  $launcher.Refresh()
  if ($launcher.HasExited) {
    Show-StartupFailure "The launcher stopped before startup completed. Open the logs for details."
  }
})
$form.Add_FormClosing({ param($sender, $eventArgs)
  # Closing a progress window must not abandon an in-flight database upgrade.
  if (-not $script:finished) { $eventArgs.Cancel = $true; $form.WindowState = "Minimized" }
})
try {
  $timer.Start()
  [System.Windows.Forms.Application]::Run($form)
} finally {
  $timer.Stop()
  $timer.Dispose()
  $form.Dispose()
  $launcher.Dispose()
}
# The wrapper/VBS uses this to avoid showing a second error dialog.
if ($script:failed) { exit 2 }
exit 0
