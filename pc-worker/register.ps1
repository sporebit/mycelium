# Registers the Mycelium PC worker as a scheduled task for the signed-in user.
# First time on a machine: pc-worker\setup.ps1 (the Python environment, the
# voice's model files, then this).
#
#   powershell -ExecutionPolicy Bypass -File pc-worker\register.ps1            register (or re-register) and start
#   powershell -ExecutionPolicy Bypass -File pc-worker\register.ps1 -Remove    stop and remove
#   powershell -ExecutionPolicy Bypass -File pc-worker\register.ps1 -Status    is it running, when did it last check in
#
# Why a scheduled task and not a Windows service: a service needs an
# administrator prompt to install. This needs none. It starts when you sign
# in, restarts itself if it stops, and runs without a window. It does not
# run while nobody is signed in to Windows.
#
# The worker makes outgoing connections only. Log:
#   %LOCALAPPDATA%\Mycelium\pc-worker.log
param(
	[switch]$Remove,
	[switch]$Status
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Mycelium PC worker'
$Repo = Split-Path -Parent $PSScriptRoot
$Worker = Join-Path $PSScriptRoot 'worker.mjs'
$Log = Join-Path $env:LOCALAPPDATA 'Mycelium\pc-worker.log'

if ($Status) {
	$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
	if (-not $task) { 'not registered'; exit 0 }
	$info = $task | Get-ScheduledTaskInfo
	'{0} | state {1} | last run {2} | last result {3}' -f $TaskName, $task.State, $info.LastRunTime, $info.LastTaskResult
	if (Test-Path $Log) { Get-Content $Log -Tail 5 }
	exit 0
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
	Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
	Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
if ($Remove) { 'removed'; exit 0 }

$node = (Get-Command node -ErrorAction Stop).Source
# conhost --headless runs a console program with no window at all.
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ('--headless "{0}" "{1}"' -f $node, $Worker) -WorkingDirectory $Repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
	-AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
	-RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
	-ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
	-Description 'Collects Mycelium jobs (transcription, local AI) from the cloud and posts results back. Outgoing connections only.' | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3
$task = Get-ScheduledTask -TaskName $TaskName
'registered: {0} | state {1}' -f $TaskName, $task.State
