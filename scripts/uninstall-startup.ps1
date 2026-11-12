[CmdletBinding()]
param(
  [string]$TaskName = 'SharedContext',
  [switch]$KeepWrapper,
  [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  Write-Error 'Shared Context startup scripts target Windows Task Scheduler.'
  exit 1
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "Task Scheduler task '$TaskName' is not installed."
  exit 0
}

if ($VerifyOnly) {
  Write-Host "Would stop and unregister Task Scheduler task '$TaskName'."
  Write-Host 'No changes were made.'
  exit 0
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Unregistered Task Scheduler task '$TaskName'."

if (-not $KeepWrapper) {
  $localAppData = $env:LOCALAPPDATA
  if (-not $localAppData) {
    $localAppData = Join-Path $env:USERPROFILE 'AppData\Local'
  }
  # Mirrors install-startup.ps1: the default task keeps the historical wrapper,
  # and every other task has its own sanitized file name.
  $safeName = $TaskName -replace '[^A-Za-z0-9._-]', '-'
  if ($TaskName -eq 'SharedContext') {
    $wrapper = Join-Path $localAppData 'shared-context\start-shared-context.cmd'
  } else {
    $wrapper = Join-Path $localAppData ('shared-context\start-task-{0}.cmd' -f $safeName)
  }
  if (Test-Path -LiteralPath $wrapper) {
    Remove-Item -LiteralPath $wrapper -Force
    Write-Host "Removed startup wrapper $wrapper."
  }
}

Write-Host 'The daemon may still be running in this session; close it with Ctrl+C or stop the node process.'