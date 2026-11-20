# Sets up what the Mycelium PC worker needs on this machine, then registers it.
#
#   powershell -ExecutionPolicy Bypass -File pc-worker\setup.ps1            everything below, then register.ps1
#   powershell -ExecutionPolicy Bypass -File pc-worker\setup.ps1 -NoRegister  the environment only
#
# Steps, each safe to run again:
#   1. Python environment at pc-worker\.venv with requirements.txt
#      (Whisper on the graphics card; Kokoro for the spoken voice).
#   2. Kokoro's two model files, about 340 MB together, Apache 2.0, into
#      %LOCALAPPDATA%\Mycelium\models\kokoro. Fetched once; skipped when present.
#   3. A one-line self-test of the voice (writes and deletes a small WAV).
#   4. The reference store folder (%LOCALAPPDATA%\Mycelium; the SQLite file is
#      made by the worker on first use, with Node's own node:sqlite).
#   5. register.ps1 (the scheduled task at sign-in).
#
# Nothing here costs money and nothing leaves the PC except the downloads.
# Ollama (the local language model) is installed separately from ollama.com.
param([switch]$NoRegister)

$ErrorActionPreference = 'Stop'
$Here = $PSScriptRoot
$Venv = Join-Path $Here '.venv'
$Python = Join-Path $Venv 'Scripts\python.exe'
$Models = Join-Path $env:LOCALAPPDATA 'Mycelium\models\kokoro'
$Base = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'

# 1. Python environment
if (-not (Test-Path $Python)) {
	$py = (Get-Command python -ErrorAction Stop).Source
	& $py -m venv $Venv
	if ($LASTEXITCODE -ne 0) { throw 'python -m venv failed' }
}
& $Python -m pip install --quiet --upgrade pip
& $Python -m pip install --quiet -r (Join-Path $Here 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }
'python environment: ok'

# 2. Kokoro model files
New-Item -ItemType Directory -Force -Path $Models | Out-Null
foreach ($name in 'kokoro-v1.0.onnx', 'voices-v1.0.bin') {
	$target = Join-Path $Models $name
	if ((Test-Path $target) -and ((Get-Item $target).Length -gt 1MB)) { "model file present: $name"; continue }
	"fetching $name ..."
	Invoke-WebRequest -Uri ($Base + $name) -OutFile $target -UseBasicParsing
	"fetched $name ({0:N0} bytes)" -f (Get-Item $target).Length
}

# 3. The voice, once
$probe = Join-Path $env:TEMP 'mycelium-voice-check.wav'
$result = 'Hello. The voice is ready.' | & $Python (Join-Path $Here 'speak.py') --out $probe
if ($LASTEXITCODE -ne 0) { throw "voice self-test failed: $result" }
"voice: $result"
Remove-Item $probe -ErrorAction SilentlyContinue

# 4. The reference store folder
New-Item -ItemType Directory -Force -Path (Join-Path $env:LOCALAPPDATA 'Mycelium') | Out-Null
'reference store folder: ok'

# 5. Register the worker
if (-not $NoRegister) { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Here 'register.ps1') }
