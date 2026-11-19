/**
 * hours-import — load a Four-Day Week Tracker JSON file (the seed, or a
 * JSON backup) through the app's import path, from the PC.
 *
 *   node scripts/hours-import.mjs <file.json>            dry run (default)
 *   node scripts/hours-import.mjs <file.json> --apply    apply after a fresh plan
 *
 * env: API_SECRET (from .env.local; acts as Phil), MYCELIUM_URL (default
 * https://mycelium.sporebit.com). The file is read from wherever it is and
 * posted; nothing is copied into the repo. Node ≥ 18, no dependencies.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const BASE = (process.env.MYCELIUM_URL ?? "https://mycelium.sporebit.com").replace(/\/$/, "");
const SECRET = process.env.API_SECRET ?? "";

if (!file) {
  console.error("usage: node scripts/hours-import.mjs <file.json> [--apply]");
  process.exit(1);
}
if (!SECRET) {
  console.error("Set API_SECRET (the value in .env.local).");
  process.exit(1);
}

const json = JSON.parse(readFileSync(file, "utf8"));
const res = await fetch(`${BASE}/api/hours/import`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-secret": SECRET },
  body: JSON.stringify({ file: json, filename: basename(file), format: "json", dryRun: !apply }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`${res.status}`, body.error ?? body);
  if (body.conflicts?.length) console.error("conflicts:", JSON.stringify(body.conflicts, null, 2));
  if (body.rejected?.length) console.error("rejected:", JSON.stringify(body.rejected, null, 2));
  process.exit(1);
}
console.log(apply ? "APPLIED" : "DRY RUN", JSON.stringify(body.counts));
if (body.settings_changes?.length) console.log("settings:", body.settings_changes.map((c) => c.field).join(", "));
if (body.changed?.length) console.log("changed:", JSON.stringify(body.changed.slice(0, 5), null, 2), body.changed.length > 5 ? `… ${body.changed.length} in all` : "");
if (body.conflicts?.length) console.log("conflicts:", JSON.stringify(body.conflicts, null, 2));
if (body.rejected?.length) console.log("rejected:", JSON.stringify(body.rejected, null, 2));
if (body.applied) console.log("applied:", JSON.stringify(body.applied));
