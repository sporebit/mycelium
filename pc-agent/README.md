# Mycelium PC Agent

Sends PC hardware metrics to your Mycelium dashboard every 30s.

## Setup

1. Edit `config.js` — set `PC_METRICS_SECRET` to your actual secret
2. `npm install`
3. `node install-service.js` (run as Administrator)
4. `net start MyceliumPCAgent`

## Logs

Logs are written to `pc-agent/logs/` by node-windows.

## Uninstall

`node uninstall-service.js` (run as Administrator)
