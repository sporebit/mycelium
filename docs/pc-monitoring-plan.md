# PC Monitoring — Milestone Plan

Live hardware telemetry from the desktop into the Mycelium studio dashboard.

**Components**

| Piece | Location |
| --- | --- |
| Agent (Windows service) | `pc-agent/` — `agent.js`, `config.js` (gitignored), node-windows wrapper |
| Ingest + read API | `app/api/studio/pc-metrics/route.ts` |
| Table | `supabase/migrations/0074_pc_metrics.sql` |
| Dashboard | `lib/studio/pcMetrics.ts` + studio UI |

**Status key** — ✅ done · 🔒 blocked · ⬜ not started · ✋ checkpoint

---

## M1 — GPU SELECTION, PAYLOAD SLIMMING, CADENCE ✅

Done in `caa0779`.

1. ✅ **GPU picked by vendor, not by index.** `controllers[0]` was the Amyuni
   "USB Mobile Monitor Virtual Display", which reports no utilisation, so every
   GPU column went to the database as null while the RTX 4070 sat at
   `controllers[1]` reporting normally. Selection now prefers an NVIDIA
   controller reporting utilisation, then any controller reporting utilisation,
   then nothing — and warns loudly when it lands on nothing.
2. ✅ **`raw` slimmed.** Was the entire `systeminformation` dump every cycle
   (~8 KB of jsonb per row, 2,880 rows/day, never read). Now a diagnostic
   subset: controller inventory, selected GPU, CPU temp variants, active
   interface.
3. ✅ **Cadence 30s → 60s.**
4. ✅ **Dashboard null-handling and threshold fixes.**

### M1 addendum — startup secret guard ✅

Done in `95a0e49`.

The agent previously started happily with the `REPLACE_WITH_YOUR_SECRET`
placeholder, POSTed every cycle, took a 401, and logged it through the same
`✗ Failed to send metrics:` prefix as a network failure. The service reported
"Running" throughout. The historical service log holds **128 auth 401s
interleaved with 76 transport failures and 6 500s**, all visually identical.

The agent now resolves and trims the secret at startup and exits non-zero
before polling if it is empty or still the placeholder, printing the
remediation. A 401/403 at runtime gets its own explicit message naming which
source the secret came from. The startup banner logs the secret's source and
length, never its value.

---

## M1.5 — LIVE BRING-UP 🔒

Blocked: `PC_METRICS_SECRET` is not present in the Machine (or User)
environment on this machine. Verified against the HKLM registry key directly
via two independent APIs. Until it is set, the agent cannot authenticate and
the guard above will correctly refuse to start.

1. 🔒 Test POST with the real secret from a fresh elevated shell (a
   Machine-scope variable is only visible to processes started after it was
   set).
2. 🔒 Install the service.
3. 🔒 Verify rows arriving with non-null `gpu_usage` / `gpu_temp`.
4. 🔒 Confirm the live dashboard.

**Expectation, from recon:** GPU fields populate normally under the service
account. The last service-written row (2026-08-06) carries full NVIDIA
telemetry inside `raw` at `controllers[1]` — utilisation 5, temp 50, VRAM
12282 — proving the SYSTEM context reads the GPU fine; the old install simply
had the Amyuni virtual display at index 0. That display is now gone entirely:
the machine currently reports a single controller, the RTX 4070, at index 0.
No workaround is warranted. Report the first-cycle controller warning only if
it contradicts this.

---

## M2 — MIGRATION: machine_id, RLS, GET auth ⬜

1. ⬜ **Migration.** Add `machine_id text NOT NULL DEFAULT 'desktop'` to
   `pc_metrics`. Composite index on `(machine_id, recorded_at DESC)`. Enable
   RLS with deny-all + `service_role` grant, matching the neighbouring tables'
   pattern exactly — `0074` is currently the only table in the schema without
   RLS.
2. ⬜ **Agent** sends `machine_id` from config, defaulting to `'desktop'`.
3. ⬜ **GET auth.** `GET /api/studio/pc-metrics` requires *either* the site's
   session auth *or* `Authorization: Bearer PC_METRICS_SECRET`. No anonymous
   access — it is currently fully public via `PUBLIC_PREFIXES` and leaks the
   raw dump. The bearer path exists because a headless Raspberry Pi device will
   consume this endpoint later. Support a `?machine=` filter; the response
   includes the list of known `machine_id`s.
4. ⬜ **Dashboard** machine selector, rendered only when more than one machine
   exists.

---

## M3 — RETENTION & HISTORY ⬜

1. ⬜ Check whether `pg_cron` is available on this Supabase project.
2. ⬜ Remove the delete-on-POST. Retention: raw rows kept 48h; a new
   `pc_metrics_hourly` rollup table (avg + max per metric, per machine) kept
   90d. Both maintained by `pg_cron` — or a Vercel cron route if `pg_cron` is
   unavailable. **Flag which was used.**
3. ⬜ GET gains `?range=live|24h|7d`. `live` returns raw rows; `24h` and `7d`
   return bucketed series from the rollup.
4. ⬜ Dashboard range toggle on the charts. Null gaps stay gaps — do not
   interpolate across missing samples.

---

## M4 — TEMPS, FANS, POWER ⬜

1. ⬜ Install LibreHardwareMonitor (winget if packaged, else the latest GitHub
   release). Run elevated at startup, Remote Web Server bound to
   `127.0.0.1:8085` only.
2. ✋ **CHECKPOINT — STOP HERE.** Dump `data.json` and report which sensors
   this ROG STRIX B550-F actually exposes (CPU temp, VRM, chipset, fan RPMs)
   before designing any UI.
3. ⬜ *After the checkpoint:* agent reads `data.json` each cycle. Supplies
   `cpu_temp` (fixing the always-null column) plus new columns `gpu_power_w`,
   `gpu_fan_percent` (numeric), `temps` jsonb, `fans` jsonb. Migration
   included. **GPU temp already flows from the M1 fix — `data.json` is a
   fallback only, do not double-source.**
4. ⬜ Dashboard: temps on the CPU/GPU rings; the fans/power card designed from
   what the checkpoint actually shows exists.
5. ⬜ **Failure isolation.** LHM not running → log once per session, null only
   the LHM-sourced fields, everything else keeps flowing.

---

## M5 — CONFIG FROM SITE + OFFLINE STATE ⬜

1. ⬜ Settings row in Supabase for `interval_s`. The POST response returns
   `{ interval_s }`; the agent adjusts its next timer accordingly. Site UI: a
   small interval control, 60s default, with a custom option.
2. ⬜ **Offline state.** Past 3× the interval, replace the stat panels with a
   dry IT-helpdesk error card (rotating messages are fine, e.g.
   `ERR_PC_UNREACHABLE: have you tried turning it on?`) with the real
   last-seen time underneath. **The joke never hides the timestamp.**

---

## DEFERRED — do not build

- Per-process network top-talkers.
- The Ubuntu VM agent.

The contract is multi-machine ready as of M2; that is all these need.
