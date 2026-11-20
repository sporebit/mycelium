/**
 * Phil's other apps, into Work (master run §12, "Other apps into Work").
 *
 * Reads docs/run/other-apps-harvest.json (one entry per repo under
 * A:\Projects, with its open items and where each was found) and makes each
 * repo a Work project with those items in its Backlog.
 *
 *   node scripts/import-harvest.mjs            show what would be created (no writes)
 *   node scripts/import-harvest.mjs --apply    create it
 *
 * Safe to run again: a project is matched by its key or name, and an item
 * is skipped when a ticket with the same title is already in the project.
 * Nothing is edited or deleted, in Mycelium or in the other repos.
 *
 * Items land in the Backlog, undated. The daily proposal never draws from
 * an undated Backlog, so importing a hundred of them changes nothing about
 * tomorrow: they are a record to choose from, not commitments.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APPLY = process.argv.includes("--apply");
// The production address is fixed here on purpose: .env.local's
// PUBLIC_BASE_URL has pointed at a dev tunnel before.
const BASE = (process.env.MYCELIUM_URL ?? "https://mycelium.sporebit.com").replace(/\/+$/, "");

const env = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const SECRET = process.env.MYCELIUM_API_SECRET ?? env.API_SECRET;
if (!SECRET) throw new Error("API_SECRET is missing from .env.local");

async function api(method, pathname, body) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { "x-api-secret": SECRET, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${json.error ?? ""}`);
  return json;
}

const POINTS = { S: 1, M: 3, L: 8 };
const STATUS = { alive: "active", paused: "paused", abandoned: "paused" };
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function projectDescription(repo) {
  const lines = [repo.summary, "", `Stack: ${repo.stack}`, `Folder: ${repo.path}`];
  if (repo.state?.last_commit) lines.push(`Last commit: ${repo.state.last_commit} — ${repo.state.last_commit_message ?? ""}`.trim());
  lines.push(`State when harvested (2026-11-20): ${repo.state?.status ?? "unknown"}${repo.state?.dirty ? ", with uncommitted changes" : ""}.`);
  if (repo.notes?.length) lines.push("", "Notes from the harvest:", ...repo.notes.map((n) => `- ${n}`));
  if (repo.left_out?.count) lines.push("", `Left out of the import: ${repo.left_out.count} (${repo.left_out.what}).`);
  return lines.join("\n");
}

function ticketDescription(item) {
  const lines = [item.detail];
  if (item.source) lines.push("", `Source: ${item.source}`);
  if (item.inferred) lines.push("Inferred from the code, not written down as a task in the repo.");
  return lines.join("\n");
}

const harvest = JSON.parse(readFileSync(path.join(ROOT, "docs/run/other-apps-harvest.json"), "utf8"));
const { projects } = await api("GET", "/api/projects");
const totals = { projects: 0, tickets: 0, skipped: 0 };

for (const repo of harvest.repos) {
  const key = String(repo.suggested_key).toUpperCase();
  let project = projects.find((p) => (p.prefix ?? "").toUpperCase() === key) ?? projects.find((p) => norm(p.name) === norm(repo.name) || norm(p.name) === norm(repo.folder));

  if (!project) {
    totals.projects += 1;
    if (APPLY) {
      const created = await api("POST", "/api/projects", { name: repo.name, prefix: key, status: STATUS[repo.state?.status] ?? "paused", description: projectDescription(repo) });
      project = created.project;
      console.log(`+ project ${key} ${repo.name}`);
    } else {
      console.log(`would create project ${key} ${repo.name} (${STATUS[repo.state?.status] ?? "paused"})`);
    }
  } else {
    console.log(`= project ${project.prefix ?? "-"} ${project.name} exists`);
  }

  let existing = new Set();
  if (project?.id) {
    const cats = "inbox,backlog,next,doing,waiting,verify,done,cancelled";
    const { tickets = [] } = await api("GET", `/api/tickets?project=${project.id}&category=${cats}&limit=500`);
    existing = new Set(tickets.map((t) => norm(t.title)));
  }

  let added = 0;
  for (const item of repo.items) {
    if (existing.has(norm(item.title))) {
      totals.skipped += 1;
      continue;
    }
    totals.tickets += 1;
    added += 1;
    if (!APPLY) continue;
    await api("POST", "/api/tickets", {
      title: item.title.slice(0, 200),
      description: ticketDescription(item),
      project_id: project.id,
      kind: "task",
      category: "backlog",
      tags: ["harvest", item.type].filter(Boolean),
      ...(POINTS[item.size] ? { points: POINTS[item.size] } : {}),
    });
    existing.add(norm(item.title));
  }
  console.log(`  ${repo.items.length} items: ${added} ${APPLY ? "imported" : "to import"}, ${repo.items.length - added} already there`);
}

console.log(`${APPLY ? "created" : "would create"}: ${totals.projects} projects, ${totals.tickets} tickets; ${totals.skipped} already there`);
if (harvest.not_found?.length) console.log(`not found on disk: ${harvest.not_found.join(", ")}`);
