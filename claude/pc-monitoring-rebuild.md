# PC Monitoring Rebuild — Spec & Decisions

*Aug 2026. Dashboard at mycelium.sporebit.com/studio/pc. Canonical build plan now lives in the mycelium repo at `docs/pc-monitoring-plan.md` (kept current by the build sessions); this doc is the cross-session summary.*

## What actually happened (recon findings, corrected premise)

The agent survived — `pc-agent/` is tracked in the mycelium repo (agent.js, node-windows service installer, systeminformation ^5). It died 2026-08-06 23:54 with `fetch failed` (transport); Windows was reinstalled 07/08 and the service was never reinstalled. The local `config.js` turned out to hold only the template placeholder — the real secret died with the old install. Old logs also held 128 historical 401s rendered identically to transport errors (fixed: distinct 401 branch + startup guard).

## Root causes (all confirmed)

1. GPU always null: `controllers[0]` picked the Amyuni virtual display on the old install; real NVIDIA data sat unused at index 1 in `raw` (service context read it fine — no Session 0 issue). Fixed: vendor-based selection + per-cycle controller warning.
2. cpu_temp always null: no temp/fan access on Windows without LHM's kernel driver (confirmed empty via WMI even elevated).
3. "32600m ago": formatter had no h/d branch. Fixed.
4. `Number(x) || 0` flattened null→0. Fixed: nulls are chart gaps; server emits explicit null buckets so Recharts can't draw across outages.

## Build status (as of 29 Aug)

- **M1** agent fixes done (caa0779, 95a0e49): GPU selection, startup guard (exits on missing/placeholder secret, names source; 401 gets its own message), raw slimmed to diagnostics, 60s default, formatter + null-gap + 3×interval offline threshold.
- **M2** done (f0e8c30, 743e7f0): migration 0094 machine_id (default 'desktop') + composite index + explicit deny-all RLS policy + machines view; GET now requires session OR bearer (was public, serving 552KB incl. raw dumps — verified 401 in production now). Auth in middleware, path-scoped. Side finds repaired: remote 0093 recovered verbatim into the repo; RLS was already enabled (zero policies) so premise corrected.
- **M3** done (0644998): pg_cron 1.6.4; delete-on-POST removed; pc_metrics_hourly (avg+max per metric per machine) seeded from history; raw 48h / rollup 90d; rollup runs before prune (independently recoverable); ?range=live|24h|7d with explicit null gap buckets.
- **M4.1** done: LHM 0.9.6 via winget, elevated at logon (scheduled task), web server on 8085. LHM ignored listenerIp and bound :: — mitigated with an explicit inbound firewall block (block outranks any future allow).
- **M4.2** checkpoint passed. Sensor inventory: Tctl/Tdie + CCD1, GPU package power / hot spot / mem junction, 2 GPU fans (zero-fan idle = genuine 0), 3 of 7 board fan headers real (duty% reported even on empty headers — RPM is the only truth), 6 storage temps, NCT6798D temp channels unidentifiable from LHM alone (#3 reads implausible 96°C — classic unconnected-channel garbage).
- **M1.5 NOT DONE — blocked on PC_METRICS_SECRET**, absent from the machine (never set after Windows reinstall; Vercel value unverified). Entire chain end-to-end unverified until set. Dashboard dead since 06 Aug.

## Checkpoint decisions (Phil, 29 Aug)

NCT channels stored raw in temps jsonb under LHM names — no labels/thresholds/colours until Phil cross-refs BIOS/HWiNFO, then a config map adds display labels. Storage temps included (temps jsonb by device name). Both GPU fans in fans jsonb, gpu_fan_percent = max, 0% renders as "passive" (distinct from null). All 7 fan headers sent; UI shows only RPM>0 and never duty% without RPM. Also captured: GPU hot spot, mem junction, CCD1, CPU package power.

## Remaining

Secret set → M1.5 end-to-end verification → M4.3–4.5 (agent reads data.json, migration for gpu_power_w/gpu_fan_percent + temps/fans jsonb, LHM failure isolation, dashboard temp/fan cards) → M5 (interval from POST response + settings UI; offline IT-joke card with real last-seen). Deferred: per-process network top-talkers, Ubuntu VM agent. Side note flagged to Phil: RAM at 2133 (DOCP off); Tctl 76.8°C at near-idle worth an airflow look once history is live.
