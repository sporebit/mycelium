# Weekly Gousto cookbook refresh, run by Windows Task Scheduler on the PC.
#
# Gousto's edge refuses cloud egress, so the sync has to run here. This
# wrapper reads API_SECRET from the repo's .env.local (never stored in the
# task itself), runs scripts/gousto-sync.mjs with --stale-days 30 so details
# older than a month are refreshed, and appends a dated log under
# $env:LOCALAPPDATA\Mycelium\gousto-sync.log.
#
# Register (once, from the repo root; weekly Sunday 03:00, catches up if the
# PC was off):
#   powershell -ExecutionPolicy Bypass -File scripts\gousto-sync-weekly.ps1 -Register
# Remove:
#   Unregister-ScheduledTask -TaskName "Mycelium Gousto sync" -Confirm:$false
# Run now by hand:
#   powershell -ExecutionPolicy Bypass -File scripts\gousto-sync-weekly.ps1

param([switch]$Register)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$taskName = "Mycelium Gousto sync"

if ($Register) {
    $ps = (Get-Command powershell.exe).Source
    $action = New-ScheduledTaskAction -Execute $ps `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`"" `
        -WorkingDirectory $repo
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3am
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
        -MultipleInstances IgnoreNew -RunOnlyIfNetworkAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
        -Description "Refreshes the Mycelium Gousto cookbook (scripts/gousto-sync.mjs --stale-days 30). Gousto blocks cloud egress, so this runs on the PC." `
        -Force | Out-Null
    Write-Host "Registered '$taskName' (weekly, Sunday 03:00, catches up when missed)."
    exit 0
}

$envFile = Join-Path $repo ".env.local"
if (-not (Test-Path $envFile)) { throw ".env.local not found at $envFile" }
$line = Get-Content $envFile | Where-Object { $_ -match '^API_SECRET=' } | Select-Object -First 1
if (-not $line) { throw "API_SECRET is not set in .env.local" }
$env:API_SECRET = ($line -replace '^API_SECRET=', '').Trim().Trim('"')

$logDir = Join-Path $env:LOCALAPPDATA "Mycelium"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "gousto-sync.log"

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "C:\Program Files\nodejs\node.exe" }

"=== $(Get-Date -Format s) start (stale-days 30)" | Out-File -Append -FilePath $log -Encoding utf8
& $node (Join-Path $repo "scripts\gousto-sync.mjs") --stale-days 30 2>&1 | Out-File -Append -FilePath $log -Encoding utf8
"=== $(Get-Date -Format s) exit $LASTEXITCODE" | Out-File -Append -FilePath $log -Encoding utf8
exit $LASTEXITCODE
