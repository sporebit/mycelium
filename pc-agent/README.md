# Mycelium PC Agent

Sends PC hardware metrics to your Mycelium dashboard every 30s.

## Setup

1. Set the secret (see below)
2. `npm install`
3. `node install-service.js` (run as Administrator)
4. `net start MyceliumPCAgent`

## Setting the secret

Set `PC_METRICS_SECRET` as a Windows environment variable:

```powershell
[System.Environment]::SetEnvironmentVariable("PC_METRICS_SECRET", "your-secret", "Machine")
```

Then restart the service.

Or set it in `config.js` locally (`config.js` is gitignored).

## Logs

Logs are written to `pc-agent/logs/` by node-windows.

## Uninstall

`node uninstall-service.js` (run as Administrator)
