[CmdletBinding()]
param(
  [string]$TaskName = 'SharedContext',
  [string]$DataDir,
  [string]$ConfigPath,
  [int]$Port = 4319,
  [int]$HealthTimeoutSeconds = 20,
  [switch]$NoStart,
  [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

if ($env:OS -ne 'Windows_NT') {
  Fail 'Shared Context startup scripts target Windows Task Scheduler.'
}
if (-not (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue)) {
  Fail 'The ScheduledTasks module is unavailable. Run this script in Windows PowerShell or PowerShell 7 on Windows.'
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Entry = Join-Path $RepoRoot 'dist\server\index.js'
if (-not (Test-Path -LiteralPath $Entry)) {
  Fail "Built entry point not found: $Entry. Run 'npm run build' first."
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand -or -not $nodeCommand.Source) {
  Fail 'node.exe was not found on PATH. Install Node 24 or add it to PATH.'
}
$NodePath = $nodeCommand.Source
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$localAppData = $env:LOCALAPPDATA
if (-not $localAppData) {
  $localAppData = Join-Path $env:USERPROFILE 'AppData\Local'
}
# One wrapper per task: the default task keeps the historical path, and any
# other task name gets a sanitized file name so tasks cannot overwrite each
# other's data-dir/config environment.
$safeName = $TaskName -replace '[^A-Za-z0-9._-]', '-'
if ($TaskName -eq 'SharedContext') {
  $wrapper = Join-Path $localAppData 'shared-context\start-shared-context.cmd'
} else {
  $wrapper = Join-Path $localAppData ('shared-context\start-task-{0}.cmd' -f $safeName)
}

function Resolve-FullPath([string]$Value) {
  if (-not $Value) { return $null }
  return [System.IO.Path]::GetFullPath($Value)
}

$resolvedDataDir = Resolve-FullPath $DataDir
$resolvedConfigPath = Resolve-FullPath $ConfigPath
$useWrapper = [bool]($resolvedDataDir -or $resolvedConfigPath)

if ($useWrapper) {
  $actionDescription = "cmd.exe /c `"$wrapper`""
} else {
  $actionDescription = "`"$NodePath`" `"$Entry`""
}

if ($VerifyOnly) {
  Write-Host 'Shared Context startup install (verify only)'
  Write-Host "  Repository:  $RepoRoot"
  Write-Host "  Node:        $NodePath"
  Write-Host "  Entry:       $Entry"
  Write-Host "  Working dir: $RepoRoot"
  Write-Host "  Task:        $TaskName"
  Write-Host "  User:        $currentUser"
  Write-Host "  Action:      $actionDescription"
  if ($resolvedDataDir) { Write-Host "  Data dir:    $resolvedDataDir" }
  if ($resolvedConfigPath) { Write-Host "  Config:      $resolvedConfigPath" }
  if ($useWrapper) { Write-Host "  Wrapper:     $wrapper" }
  Write-Host '  Trigger:     at logon for the current user'
  Write-Host 'No changes were made.'
  exit 0
}

if ($useWrapper) {
  $wrapperDirectory = Split-Path -Parent $wrapper
  New-Item -ItemType Directory -Force -Path $wrapperDirectory | Out-Null
  $lines = @('@echo off')
  if ($resolvedDataDir) {
    $lines += ('set "SHARED_CONTEXT_DATA_DIR={0}"' -f $resolvedDataDir.Replace('%', '%%'))
  }
  if ($resolvedConfigPath) {
    $lines += ('set "SHARED_CONTEXT_CONFIG={0}"' -f $resolvedConfigPath.Replace('%', '%%'))
  }
  $lines += ('"{0}" "{1}"' -f $NodePath, $Entry)
  Set-Content -LiteralPath $wrapper -Value ($lines -join "`r`n") -Encoding ascii
} else {
  $staleWrapper = $wrapper
  if (Test-Path -LiteralPath $staleWrapper) {
    Remove-Item -LiteralPath $staleWrapper -Force
  }
}

if ($useWrapper) {
  $action = New-ScheduledTaskAction `
    -Execute 'cmd.exe' `
    -Argument ('/c "{0}"' -f $wrapper) `
    -WorkingDirectory $RepoRoot
} else {
  $action = New-ScheduledTaskAction `
    -Execute $NodePath `
    -Argument ('"{0}"' -f $Entry) `
    -WorkingDirectory $RepoRoot
}

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal `
  -UserId $currentUser `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Trigger $trigger `
  -Action $action `
  -Principal $principal `
  -Settings $settings `
  -Description 'Runs the Shared Context local daemon at logon in the user session.' `
  -Force | Out-Null

Write-Host "Registered Task Scheduler task '$TaskName' for $currentUser."
Write-Host "  $actionDescription"
Write-Host "  Working directory: $RepoRoot"

if ($NoStart) {
  Write-Host 'Skipped starting the task (-NoStart).'
  exit 0
}

Start-ScheduledTask -TaskName $TaskName
$deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
$healthy = $false
while ((Get-Date) -lt $deadline) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 2
    if ($health.ok -eq $true) {
      $healthy = $true
      break
    }
  } catch {
    # The task may still be starting.
  }
  Start-Sleep -Milliseconds 500
}

if (-not $healthy) {
  Fail "Task '$TaskName' started but /healthz did not respond on port $Port. Check the task history and the daemon logs."
}

Write-Host "Shared Context is healthy on http://127.0.0.1:$Port/healthz"