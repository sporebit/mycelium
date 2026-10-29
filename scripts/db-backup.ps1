# Nightly backup of the hosted Mycelium database, run by Windows Task Scheduler
# on the PC (the Supabase Free plan keeps no backups of its own).
#
# Needs, once: SUPABASE_DB_URL in .env.local — the *session pooler* URL from
# the dashboard (Project Settings -> Database -> Connection string, mode
# Session, port 5432; reset the database password there if it is unknown):
#   SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
# Until it is set, every run logs "SUPABASE_DB_URL is not set" and exits 1.
# (The Supabase CLI's own `db dump` needs Docker and a temporary role it
# mints through the Management API, so it cannot run unattended here.)
#
# What a run does
#   1. pg_dump (native PostgreSQL install, no Docker) into
#      A:\Backups\mycelium\nightly\<yyyy-MM-dd>\
#        schema.sql   schema-only, public + app (plain SQL, diffable)
#        data.dump    data-only, public + auth + storage metadata, custom
#                     format (compressed; `pg_restore -t <table>` restores one)
#        manifest.txt what `pg_restore --list` sees in data.dump (integrity check)
#   2. Retention: every day for 7 days, Sundays for 4 weeks, the 1st of the
#      month for 12 months; other dated folders under nightly\ are deleted.
#   3. Appends to $env:LOCALAPPDATA\Mycelium\db-backup.log.
#
# Not covered: Storage bucket *files* (only their metadata rows) and off-site
# copies — point a synced folder at A:\Backups\mycelium\nightly for that.
#
# Register (once; daily 02:30, catches up if the PC was off):
#   powershell -ExecutionPolicy Bypass -File scripts\db-backup.ps1 -Register
# Remove:  Unregister-ScheduledTask -TaskName "Mycelium DB backup" -Confirm:$false
# Run now: powershell -ExecutionPolicy Bypass -File scripts\db-backup.ps1
# Restore one table from a dump (into the local stack or a fresh project):
#   pg_restore -d "<url>" --data-only -t workout_sets data.dump

param(
    [switch]$Register,
    [string]$BackupRoot = "A:\Backups\mycelium\nightly",
    [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$taskName = "Mycelium DB backup"

if ($Register) {
    $ps = (Get-Command powershell.exe).Source
    $action = New-ScheduledTaskAction -Execute $ps `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`"" `
        -WorkingDirectory $repo
    $trigger = New-ScheduledTaskTrigger -Daily -At 2:30am
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
        -MultipleInstances IgnoreNew -RunOnlyIfNetworkAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
        -Description "Nightly pg_dump of the hosted Mycelium database to $BackupRoot with 7d/4w/12m retention (scripts/db-backup.ps1). Needs SUPABASE_DB_URL in .env.local." `
        -Force | Out-Null
    Write-Host "Registered '$taskName' (daily 02:30, catches up when missed)."
    exit 0
}

$logDir = Join-Path $env:LOCALAPPDATA "Mycelium"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "db-backup.log"
function Log([string]$msg) { "$(Get-Date -Format s) $msg" | Out-File -Append -FilePath $log -Encoding utf8; Write-Host $msg }

try {
    # ---- 1. connection -------------------------------------------------------
    $envFile = Join-Path $repo ".env.local"
    $url = $null
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^SUPABASE_DB_URL=' } | Select-Object -First 1
        if ($line) { $url = ($line -replace '^SUPABASE_DB_URL=', '').Trim().Trim('"') }
    }
    if (-not $url) { throw "SUPABASE_DB_URL is not set in .env.local (session-pooler URL with the database password; see the header of this script)" }

    $pgDump = Join-Path $PgBin "pg_dump.exe"
    $pgRestore = Join-Path $PgBin "pg_restore.exe"
    if (-not (Test-Path $pgDump)) { throw "pg_dump not found at $pgDump" }

    # ---- 2. dump -------------------------------------------------------------
    $stamp = Get-Date -Format "yyyy-MM-dd"
    $dir = Join-Path $BackupRoot $stamp
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Log "start $stamp -> $dir"

    $common = @("--no-owner", "--no-privileges", "--no-password", "-d", $url)
    & $pgDump @common --schema-only -n public -n app -f (Join-Path $dir "schema.sql")
    if ($LASTEXITCODE -ne 0) { throw "pg_dump schema failed ($LASTEXITCODE)" }
    & $pgDump @common --data-only -Fc -n public -n auth -n storage `
        --exclude-table-data "auth.audit_log_entries" -f (Join-Path $dir "data.dump")
    if ($LASTEXITCODE -ne 0) { throw "pg_dump data failed ($LASTEXITCODE)" }

    # ---- integrity: the archive must list cleanly and hold the whole schema --
    $manifest = Join-Path $dir "manifest.txt"
    & $pgRestore --list (Join-Path $dir "data.dump") | Out-File -FilePath $manifest -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "pg_restore --list failed ($LASTEXITCODE): the archive is not readable" }
    $tables = (Select-String -Path $manifest -Pattern ' TABLE DATA ' | Measure-Object).Count
    $schemaKb = [math]::Round((Get-Item (Join-Path $dir "schema.sql")).Length / 1KB)
    $dataKb = [math]::Round((Get-Item (Join-Path $dir "data.dump")).Length / 1KB)
    if ($tables -lt 100) { throw "only $tables TABLE DATA entries in the archive; the public schema alone has ~145 tables" }
    Log "ok: $tables tables, schema.sql ${schemaKb} KB, data.dump ${dataKb} KB"

    # ---- 3. retention --------------------------------------------------------
    $today = (Get-Date).Date
    $kept = 0; $removed = 0
    foreach ($d in Get-ChildItem -Path $BackupRoot -Directory) {
        $parsed = [datetime]::MinValue
        if (-not [datetime]::TryParseExact($d.Name, "yyyy-MM-dd", $null, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) { continue }
        $age = ($today - $parsed.Date).Days
        $keep = ($age -le 7) -or
                ($parsed.DayOfWeek -eq [DayOfWeek]::Sunday -and $age -le 28) -or
                ($parsed.Day -eq 1 -and $age -le 366)
        if ($keep) { $kept++ } else { Remove-Item -Recurse -Force $d.FullName; $removed++ }
    }
    Log "retention: kept $kept, removed $removed"
    exit 0
} catch {
    Log "FAILED: $($_.Exception.Message)"
    exit 1
}
