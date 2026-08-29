# Mycelium PC Agent

Sends PC hardware metrics to your Mycelium dashboard every 60s.

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

Then restart the service. A Machine-scope variable is only visible to processes
started *after* it was set, so an already-running service or shell will not see
it — restart the shell too, and confirm with:

```powershell
[System.Environment]::GetEnvironmentVariable("PC_METRICS_SECRET", "Machine").Length
```

Or set it in `config.js` locally (`config.js` is gitignored).

The value must match `PC_METRICS_SECRET` on the server. The agent **refuses to
start** if the secret is missing or still the `REPLACE_WITH_YOUR_SECRET`
template placeholder, rather than running and taking a 401 on every cycle.

## config.js

`config.js` is gitignored. Its shape:

| Key | Default | Meaning |
| --- | --- | --- |
| `MYCELIUM_URL` | — | Ingest endpoint |
| `PC_METRICS_SECRET` | env var, else placeholder | Shared secret; env wins |
| `POLL_INTERVAL_MS` | `60000` | Reporting cadence |
| `MACHINE_ID` | `"desktop"` | Which machine these readings describe |

Set `MACHINE_ID` when running a second reporter, so its rows are attributable.
The dashboard shows a machine selector once more than one has reported.

## Logs

Logs are written to `pc-agent/daemon/` by node-windows —
`myceliumpcagent.out.log` for successful cycles, `.err.log` for failures.

A rejected secret logs as an explicit "Server rejected the agent secret"
message, distinct from a transport failure.

## Uninstall

`node uninstall-service.js` (run as Administrator)
