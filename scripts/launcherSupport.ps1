# Status is scoped to one shortcut launch, never to the setup cache environment.
function Write-SerpoStartupProgress {
  param([string]$Path, [string]$Phase, [string]$State = "running", [string]$Detail = "", [switch]$PassThru)
  if (-not $Path) { if ($PassThru) { return $false }; return }
  try {
    $status = @{ state = $State; phase = $Phase; detail = $Detail }
    [System.IO.File]::WriteAllText($Path, ($status | ConvertTo-Json -Compress))
    if ($PassThru) { return $true }
  } catch {
    Write-Warning "Could not update the startup window: $($_.Exception.Message)"
    if ($PassThru) { return $false }
  }
}

function Write-SerpoStartupFailure {
  param([string]$Path, [string]$Detail, [switch]$PassThru)
  if (-not $Path) { if ($PassThru) { return $false }; return }
  # A child may have already reported a more specific setup/startup failure.
  try {
    $previous = [System.IO.File]::ReadAllText($Path) | ConvertFrom-Json
    if ($previous.state -eq "failed") { if ($PassThru) { return $true }; return }
  } catch { }
  Write-SerpoStartupProgress -Path $Path -Phase "Serpo could not start" -State "failed" -Detail $Detail -PassThru:$PassThru
}

function Test-PortInUse([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync("127.0.0.1", $Port)
    if (-not $task.Wait(350)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}
