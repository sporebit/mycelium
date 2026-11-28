/**
 * The 2026-11-28 run's tickets, into Mycelium (docs/run/2026-11-28/plan.md, step T5).
 *
 *   node scripts/create-run-tickets.ts                 show what would be created (no writes)
 *   node scripts/create-run-tickets.ts --apply         create it
 *   node scripts/create-run-tickets.ts --apply --only mail,baby   one or more epics by file stem
 *
 * Reads docs/run/2026-11-28/tickets/<epic>.json (the shape in agent-brief-t2.md)
 * and the dossiers beside them. Talks to production unless MYCELIUM_URL says
 * otherwise, as Phil through API_SECRET from .env.local (MYCELIUM_API_SECRET
 * overrides it). Against the local e2e server:
 *   MYCELIUM_URL=http://localhost:3100 MYCELIUM_API_SECRET=e2e-api-secret node scripts/create-run-tickets.ts --apply
 *
 * Safe to run again. Every ticket and epic carries a stable id as a tag
 * (`sid:mail.01`); a second run finds the tag and creates nothing. Projects
 * are matched by prefix, doc pages by title inside the RUN doc space,
 * dependencies and links answer 200 when they already exist. Nothing is
 * deleted. Existing tickets named in `existing` are re-parented under their
 * epic and have an "Unlocks" section appended once (marked so it is not
 * appended twice).
 *
 * Modelled on scripts/import-harvest.mjs. Runs with Node's own type
 * stripping (Node 23.6 or later), like the e2e support scripts.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { textToDoc, type Doc, type DocNode } from "../lib/work/doc.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const RUN_DIR = path.join(ROOT, "docs/run/2026-11-28");
const APPLY = process.argv.includes("--apply");
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(",").map((s) => s.trim())) : null;
const BASE = (process.env.MYCELIUM_URL ?? "https://mycelium.sporebit.com").replace(/\/+$/, "");
const RUN_MARK = "<!-- run:2026-11-28 -->";
const DOC_SPACE = { key: "RUN", name: "Run dossiers", description: "Research dossiers and maps from the unattended runs, linked from their epics." };

const env: Record<string, string> = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const SECRET = process.env.MYCELIUM_API_SECRET ?? env.API_SECRET;
if (!SECRET) throw new Error("API_SECRET is missing from .env.local");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Json = Record<string, unknown>;

/** One call as Phil. A 429 is the shared write budget, not a failure: wait and go again. */
async function api<T = Json>(method: string, pathname: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + pathname, {
      method,
      headers: { "x-api-secret": SECRET, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: Json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text.slice(0, 200) };
    }
    if (res.status === 429 && attempt < 24) {
      await sleep(5_000);
      continue;
    }
    if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${String(json.error ?? "")}`);
    return json as T;
  }
}

// ---------------------------------------------------------------------------
// Shapes (agent-brief-t2.md)
// ---------------------------------------------------------------------------
type StepsDefinition = Record<string, unknown>;
type TicketIn = {
  sid: string;
  title: string;
  kind: "task" | "guide" | "setup" | "audit" | "test";
  points: number;
  due: string | null;
  who?: string;
  description: string;
  after?: string[];
  links?: string[];
  tags?: string[];
  steps_definition?: StepsDefinition | null;
  /** The epic this ticket sits under when it is not its file's (an epic sid). */
  epic_sid?: string;
};
type ExistingIn = { key: string; set_epic?: boolean; append?: string };
type EpicFile = {
  epic: { sid: string; project: string; title: string; description: string; dossier?: string; links?: string[] };
  tickets: TicketIn[];
  existing?: ExistingIn[];
};

const PROJECTS: Record<string, { name: string; description: string }> = {
  MAIL: { name: "Email", description: "Email migration to the sixteen addresses on philwhelan.com and sporebit.com, the old domain's quiet year, and app mail." },
  SEC: { name: "Security", description: "Home network, blocking, keys, secrets and domains." },
  FIXF: { name: "FixForward", description: "eBay selling and repair automation for the fixforward account. Repo at A:\\Projects\\fixforward. Official API only; nothing on the live account without Phil's yes." },
  BABY: { name: "Baby", description: "Baby preparation, due June 2027. Dated tickets worked back from the due date; the Family section holds the lists." },
  SUB: { name: "Substrate", description: "The always-on home server: DNS filter and VPN first, then Home Assistant, backups, photos, media, git and the worker." },
  HOME: { name: "Home", description: "The room editor, rooms in order (bathroom, nursery, bedroom, living room, office), garden, repairs and odd jobs." },
  GLASS: { name: "Glasses", description: "Meta glasses answering to Mycelium: voice capture first, then steering Claude Code." },
  LIFE: { name: "Life", description: "One-off research, ventures behind the FixForward rule, the harvest rescue, and this run's review checklists." },
  // these exist in production and are found by prefix; the local stack creates them for the proof run
  MYC: { name: "Mycelium", description: "The app itself." },
  PHM: { name: "PhirstMaxx", description: "The PhirstMaxx app." },
  DSA: { name: "DropShipAuto", description: "DropShipAuto, kept alive." },
  SELL: { name: "Selling", description: "Selling and websites." },
  GARDN: { name: "Home Improvement", description: "The older home improvement tickets." },
};

const POINTS = new Set([1, 2, 3, 5, 8, 13]);
const KEY_RE = /^[A-Z][A-Z0-9]{1,4}-\d+$/;

// ---------------------------------------------------------------------------
// Markdown to the Work document (headings, lists, code, paragraphs)
// ---------------------------------------------------------------------------
function inline(text: string): DocNode[] {
  const out: DocNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) out.push({ type: "text", text: tok.slice(2, -2), marks: [{ type: "bold" }] });
    else out.push({ type: "text", text: tok.slice(1, -1), marks: [{ type: "code" }] });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out.length ? out : [{ type: "text", text }];
}

export function markdownToDoc(md: string): Doc {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const content: DocNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("<!--")) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      content.push({ type: "heading", attrs: { level: Math.min(h[1].length, 3) }, content: inline(h[2]) });
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      content.push({ type: "codeBlock", content: [{ type: "text", text: buf.join("\n") }] });
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      const items: DocNode[] = [];
      while (i < lines.length) {
        const b = lines[i].match(ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(.*)$/);
        if (!b) break;
        items.push({ type: "listItem", content: [{ type: "paragraph", content: inline(b[1]) }] });
        i++;
      }
      content.push({ type: ordered ? "orderedList" : "bulletList", content: items });
      continue;
    }
    if (line.startsWith("|")) {
      // tables as plain lines: the editor's table node is not worth faking
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|\s*-{2,}/.test(lines[i])) buf.push(lines[i].replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).join("  ·  "));
        i++;
      }
      for (const b of buf) content.push({ type: "paragraph", content: inline(b) });
      continue;
    }
    const buf: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*[-*]\s|\s*\d+[.)]\s|\|)/.test(lines[i])) buf.push(lines[i++].trim());
    content.push({ type: "paragraph", content: inline(buf.join(" ")) });
  }
  return content.length ? { type: "doc", content } : textToDoc(md);
}

// ---------------------------------------------------------------------------
// review.01: one row per decisions.md entry, built when the script runs so the
// ticket carries every decision made up to that moment
// ---------------------------------------------------------------------------
function decisionsGuide(base: StepsDefinition | null | undefined): StepsDefinition {
  const file = path.join(RUN_DIR, "decisions.md");
  const lines = existsSync(file)
    ? readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    : [];
  const per = 12;
  const phases: Array<Record<string, unknown>> = [];
  for (let i = 0; i < lines.length; i += per) {
    const chunk = lines.slice(i, i + per);
    const n = phases.length + 1;
    phases.push({
      id: String(n),
      title: `Decisions ${i + 1} to ${i + chunk.length}`,
      minutes: Math.min(15, chunk.length + 3),
      steps: chunk.map((line, j) => {
        const text = line.replace(/^[-*]\s*/, "");
        return {
          id: `${n}.${j + 1}`,
          title: text.length > 120 ? text.slice(0, 117) + "..." : text,
          actor: "you",
          minutes: 1,
          body_html: `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p><p>Tick to keep. If it should be undone, say so in the box and leave it unticked.</p>`,
          expect_html: "<p>Ticked means keep; a note means undo or change.</p>",
          fields: [{ key: `d${i + j + 1}`, label: "Keep, undo, or change to...", placeholder: "leave empty to keep as is" }],
        };
      }),
    });
  }
  return {
    ...(base ?? {}),
    format: "field-guide",
    kind: "guide",
    title: "Review: decisions made for me on 2026-11-28",
    version: 1,
    intro: {
      answer: `${lines.length} decisions were made for you during the unattended run of 2026-11-28. Each is one row: tick to keep, write in the box to undo or change.`,
      unlocks: ["Anything undone becomes its own ticket", "The run's assumptions are confirmed or corrected"],
      to_hand: ["docs/run/2026-11-28/decisions.md and report.md, if you want the detail"],
      time: `about ${Math.max(15, Math.ceil(lines.length / per) * 15)} minutes in ${Math.max(1, Math.ceil(lines.length / per))} sittings`,
      cost: "nothing",
      last_verified: "2026-11-28",
      sources: [],
    },
    phases,
    finish_html: "<p>Every decision has an answer. Paste the hand-back to Claude and it will raise a ticket for each undo.</p>",
    handback_prompt: "I have reviewed the decisions from the 2026-11-28 run. Read my answers on this ticket and raise one ticket per decision I asked to undo or change.",
    tested: {},
  };
}

// ---------------------------------------------------------------------------
// Load and check the files
// ---------------------------------------------------------------------------
// Every file is read so cross-epic sids resolve; --only narrows what is written.
const allFiles = readdirSync(path.join(RUN_DIR, "tickets")).filter((f) => f.endsWith(".json")).sort();
const allEpics: Array<EpicFile & { stem: string }> = allFiles.map((f) => ({ stem: f.replace(/\.json$/, ""), ...(JSON.parse(readFileSync(path.join(RUN_DIR, "tickets", f), "utf8")) as EpicFile) }));
const epics = allEpics.filter((e) => !ONLY || ONLY.has(e.stem));

const sidToFile = new Map<string, string>();
const problems: string[] = [];
for (const e of allEpics) {
  if (!PROJECTS[e.epic.project]) problems.push(`${e.stem}: unknown project ${e.epic.project}`);
  if (sidToFile.has(e.epic.sid)) problems.push(`${e.stem}: duplicate epic sid ${e.epic.sid}`);
  sidToFile.set(e.epic.sid, e.stem);
  for (const t of e.tickets) {
    if (sidToFile.has(t.sid)) problems.push(`${e.stem}: duplicate sid ${t.sid}`);
    sidToFile.set(t.sid, e.stem);
    if (!t.title?.trim()) problems.push(`${t.sid}: no title`);
    if (!POINTS.has(t.points)) problems.push(`${t.sid}: points ${t.points} not in 1,2,3,5,8,13`);
    if (t.due && !/^\d{4}-\d{2}-\d{2}$/.test(t.due)) problems.push(`${t.sid}: due ${t.due} is not YYYY-MM-DD`);
    if (!["task", "guide", "setup", "audit", "test"].includes(t.kind)) problems.push(`${t.sid}: kind ${t.kind}`);
    if (t.kind !== "task" && !t.steps_definition) problems.push(`${t.sid}: ${t.kind} without steps_definition`);
    if (/[\u2013\u2014]/.test(t.title + t.description + JSON.stringify(t.steps_definition ?? {}))) problems.push(`${t.sid}: contains an em or en dash`);
    for (const h of ["## What", "## Why", "## Done looks like", "## Unlocks", "## Depends on"]) if (!t.description.includes(h)) problems.push(`${t.sid}: description lacks "${h}"`);
  }
}
for (const e of allEpics) {
  for (const t of e.tickets) {
    for (const a of t.after ?? []) if (!sidToFile.has(a) && !KEY_RE.test(a)) problems.push(`${t.sid}: after "${a}" is neither a known sid nor a ticket key`);
    for (const l of t.links ?? []) if (!sidToFile.has(l) && !KEY_RE.test(l)) problems.push(`${t.sid}: link "${l}" is neither a known sid nor a ticket key`);
  }
}
if (problems.length) {
  console.error(`${problems.length} problem(s) in the ticket files:`);
  for (const p of problems) console.error("  " + p);
  if (!process.argv.includes("--force")) process.exit(1);
}
console.log(`${epics.length} epic files, ${epics.reduce((n, e) => n + e.tickets.length, 0)} tickets, ${epics.reduce((n, e) => n + (e.existing?.length ?? 0), 0)} existing to re-parent`);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
type Project = { id: string; name: string; prefix: string | null };
const { projects } = await api<{ projects: Project[] }>("GET", "/api/projects");
const projectByKey = new Map<string, Project>();
for (const p of projects) if (p.prefix) projectByKey.set(p.prefix.toUpperCase(), p);
const totals = { projects: 0, epics: 0, tickets: 0, steps: 0, deps: 0, links: 0, existing: 0, pages: 0, skipped: 0 };

for (const e of epics) {
  const key = e.epic.project.toUpperCase();
  if (projectByKey.has(key)) continue;
  const spec = PROJECTS[key];
  if (!spec) throw new Error(`Project ${key} does not exist and is not in the create list`);
  totals.projects += 1;
  if (!APPLY) {
    console.log(`would create project ${key} ${spec.name}`);
    projectByKey.set(key, { id: `dry-${key}`, name: spec.name, prefix: key });
    continue;
  }
  const made = await api<{ project: Project }>("POST", "/api/projects", { name: spec.name, prefix: key, status: "active", description: spec.description });
  projectByKey.set(key, made.project);
  console.log(`+ project ${key} ${spec.name}`);
}

// ---------------------------------------------------------------------------
// Existing tickets by stable id (the tag), per project
// ---------------------------------------------------------------------------
type Lite = { id: string; ticket_key: string | null; key?: string | null; title: string; tags?: string[] | null; description?: string | null };
const bySid = new Map<string, Lite>();
const loadedProjects = new Set<string>();
async function loadProject(key: string) {
  if (loadedProjects.has(key)) return;
  loadedProjects.add(key);
  const p = projectByKey.get(key);
  if (!p || p.id.startsWith("dry-")) return;
  const { tickets = [] } = await api<{ tickets: Lite[] }>("GET", `/api/tickets?project=${p.id}&list=all&limit=1000`);
  for (const t of tickets) for (const tag of t.tags ?? []) if (tag.startsWith("sid:")) bySid.set(tag.slice(4), t);
}
for (const e of epics) await loadProject(e.epic.project.toUpperCase());
console.log(`${bySid.size} tickets already carry a stable id`);

const keyOf = (t: Lite) => t.ticket_key ?? t.key ?? t.id;

// ---------------------------------------------------------------------------
// Doc space and dossier pages
// ---------------------------------------------------------------------------
type DocSpace = { id: string; key: string; name: string };
type PageLite = { id: string; title: string };
let pagesByTitle = new Map<string, PageLite>();
async function ensureDocSpace(): Promise<DocSpace | null> {
  const { spaces = [] } = await api<{ spaces: DocSpace[] }>("GET", "/api/work/docs/spaces");
  let ds = spaces.find((s) => s.key === DOC_SPACE.key) ?? null;
  if (!ds) {
    if (!APPLY) {
      console.log(`would create doc space ${DOC_SPACE.key}`);
      return null;
    }
    const made = await api<{ doc_space?: DocSpace; space?: DocSpace }>("POST", "/api/work/docs/spaces", DOC_SPACE);
    ds = made.doc_space ?? made.space ?? null;
    console.log(`+ doc space ${DOC_SPACE.key}`);
  }
  if (ds) {
    const got = await api<{ pages?: PageLite[]; tree?: PageLite[] }>("GET", `/api/work/docs/pages?doc_space=${DOC_SPACE.key}`);
    const flat: PageLite[] = [];
    const walk = (n: PageLite & { children?: PageLite[] }) => {
      flat.push({ id: n.id, title: n.title });
      for (const c of n.children ?? []) walk(c as PageLite & { children?: PageLite[] });
    };
    for (const n of got.pages ?? got.tree ?? []) walk(n as PageLite & { children?: PageLite[] });
    pagesByTitle = new Map(flat.map((p) => [p.title, p]));
  }
  return ds;
}
const docSpace = await ensureDocSpace();

async function ensurePage(title: string, markdown: string): Promise<string | null> {
  const have = pagesByTitle.get(title);
  if (have) return have.id;
  totals.pages += 1;
  if (!APPLY || !docSpace) {
    console.log(`would create page "${title}"`);
    return null;
  }
  const made = await api<{ page: PageLite }>("POST", "/api/work/docs/pages", { doc_space: DOC_SPACE.key, title, body: markdownToDoc(markdown) });
  pagesByTitle.set(title, made.page);
  console.log(`+ page "${title}"`);
  return made.page.id;
}

const pageUrl = (id: string) => `${BASE}/docs/${DOC_SPACE.key}/${id}`;
const ticketUrl = (key: string) => `${BASE}/work/browse/${encodeURIComponent(key)}`;

// ---------------------------------------------------------------------------
// Epics, then tickets, then the links between them
// ---------------------------------------------------------------------------
const createdKeyBySid = new Map<string, string>();
for (const [sid, t] of bySid) createdKeyBySid.set(sid, keyOf(t));

async function resolveRef(ref: string): Promise<string | null> {
  if (KEY_RE.test(ref)) return ref;
  return createdKeyBySid.get(ref) ?? null;
}

async function ensureLink(fromKey: string, toKey: string, label: string) {
  const have = await api<{ links: Array<{ url: string | null }> }>("GET", `/api/tickets/${encodeURIComponent(fromKey)}/links`);
  const url = ticketUrl(toKey);
  if (have.links.some((l) => l.url === url)) return;
  totals.links += 1;
  if (!APPLY) return;
  await api("POST", `/api/tickets/${encodeURIComponent(fromKey)}/links`, { url, label: `${toKey}: ${label}`.slice(0, 200), kind: "url" });
}

for (const e of epics) {
  const projectKey = e.epic.project.toUpperCase();
  const project = projectByKey.get(projectKey)!;
  console.log(`\n== ${e.epic.sid} (${projectKey}) ${e.epic.title}`);

  // the dossier page
  let dossierUrl: string | null = null;
  if (e.epic.dossier) {
    const file = path.join(RUN_DIR, e.epic.dossier);
    if (existsSync(file)) {
      const id = await ensurePage(`Dossier: ${e.epic.title}`, readFileSync(file, "utf8"));
      if (id) dossierUrl = pageUrl(id);
    } else {
      console.log(`  (dossier ${e.epic.dossier} is missing)`);
    }
  }

  // the epic
  let epicKey = createdKeyBySid.get(e.epic.sid) ?? null;
  if (!epicKey) {
    totals.epics += 1;
    const description = `${e.epic.description.trim()}\n\n${dossierUrl ? `Dossier: ${dossierUrl}\n\n` : ""}${RUN_MARK}`;
    if (APPLY) {
      const made = await api<{ key: string; ticket: { key: string } }>("POST", "/api/work/tickets", {
        title: e.epic.title,
        description,
        description_doc: markdownToDoc(description),
        project: projectKey,
        type: "epic",
        status: "Backlog",
      });
      epicKey = made.key ?? made.ticket.key;
      await api("PATCH", `/api/tickets/${encodeURIComponent(epicKey)}`, { tags: [`sid:${e.epic.sid}`, "run-2026-11-28", e.stem] });
      createdKeyBySid.set(e.epic.sid, epicKey);
      console.log(`  + epic ${epicKey}`);
    } else {
      console.log(`  would create epic`);
    }
  } else {
    console.log(`  = epic ${epicKey} exists`);
  }

  // the tickets
  for (const t of e.tickets) {
    if (createdKeyBySid.has(t.sid)) {
      totals.skipped += 1;
      continue;
    }
    totals.tickets += 1;
    if (t.steps_definition) totals.steps += 1;
    if (!APPLY) continue;
    const description = `${t.description.trim()}\n\n${RUN_MARK}`;
    const made = await api<{ ticket: Lite; key: string }>("POST", "/api/tickets", {
      title: t.title.slice(0, 200),
      description,
      project_id: project.id,
      kind: t.kind,
      category: "backlog",
      tags: [`sid:${t.sid}`, "run-2026-11-28", e.stem, ...(t.tags ?? []).filter((x) => x && !x.startsWith("sid:"))].slice(0, 20),
      points: t.points,
      ...(t.due ? { deadline_on: t.due } : {}),
    });
    const key = made.key ?? keyOf(made.ticket);
    createdKeyBySid.set(t.sid, key);
    // the rundown as a rich document, and the epic
    await api("PATCH", `/api/work/tickets/${encodeURIComponent(key)}`, {
      description,
      description_doc: markdownToDoc(description),
      ...(epicKey ? { epic: epicKey } : {}),
    });
    const definition = t.sid === "review.01" ? decisionsGuide(t.steps_definition) : t.steps_definition;
    if (definition) {
      await api("PATCH", `/api/tickets/${encodeURIComponent(key)}/steps`, { definition });
    }
    console.log(`  + ${key} ${t.title.slice(0, 70)}${t.due ? ` (${t.due})` : ""}`);
  }

  // existing tickets under this epic
  for (const x of e.existing ?? []) {
    if (!KEY_RE.test(x.key)) continue;
    totals.existing += 1;
    if (!APPLY || !epicKey) continue;
    let current: { ticket: { description: string | null; epic: { key: string | null } | null } };
    try {
      current = await api("GET", `/api/work/tickets/${encodeURIComponent(x.key)}`);
    } catch {
      console.log(`  (existing ${x.key} not found)`);
      continue;
    }
    const patch: Json = {};
    if (x.set_epic && current.ticket.epic?.key !== epicKey) patch.epic = epicKey;
    if (x.append && !(current.ticket.description ?? "").includes(RUN_MARK)) {
      const description = `${(current.ticket.description ?? "").trimEnd()}\n${x.append.trimEnd()}\n\n${RUN_MARK}`;
      patch.description = description;
      patch.description_doc = markdownToDoc(description);
    }
    if (Object.keys(patch).length) {
      await api("PATCH", `/api/work/tickets/${encodeURIComponent(x.key)}`, patch);
      console.log(`  ~ ${x.key} ${patch.epic ? "under the epic" : ""}${patch.description ? " +unlocks" : ""}`);
    }
  }

  // epic links to existing tickets
  if (epicKey && APPLY) for (const l of e.epic.links ?? []) if (KEY_RE.test(l)) await ensureLink(epicKey, l, "related");
}

// dependencies and links need every key to exist, so they come last
console.log("\n== dependencies and links");
for (const e of epics) {
  for (const t of e.tickets) {
    const key = createdKeyBySid.get(t.sid);
    // a ticket that sits under another epic than its file's (red team 50)
    if (t.epic_sid && key && APPLY) {
      const otherEpic = createdKeyBySid.get(t.epic_sid);
      if (otherEpic) {
        const cur = await api<{ ticket: { epic: { key: string | null } | null } }>("GET", `/api/work/tickets/${encodeURIComponent(key)}`);
        if (cur.ticket.epic?.key !== otherEpic) await api("PATCH", `/api/work/tickets/${encodeURIComponent(key)}`, { epic: otherEpic });
      }
    }
    for (const a of t.after ?? []) {
      const blocker = await resolveRef(a);
      if (!blocker) {
        if (!APPLY && sidToFile.has(a)) totals.deps += 1;
        else console.log(`  ? ${t.sid}: blocker ${a} has no key yet`);
        continue;
      }
      if (!key) {
        totals.deps += 1;
        continue;
      }
      const have = await api<{ blocked_by: Array<{ key: string | null }> }>("GET", `/api/tickets/${encodeURIComponent(key)}/dependencies`);
      if (have.blocked_by.some((b) => b.key === blocker)) continue;
      totals.deps += 1;
      if (!APPLY) continue;
      try {
        await api("POST", `/api/tickets/${encodeURIComponent(key)}/dependencies`, { blocker });
      } catch (err) {
        console.log(`  ! ${key} after ${blocker}: ${(err as Error).message}`);
      }
    }
    for (const l of t.links ?? []) {
      const other = await resolveRef(l);
      if (!other) continue;
      if (!key) {
        totals.links += 1;
        continue;
      }
      await ensureLink(key, other, "related");
    }
  }
}

// ---------------------------------------------------------------------------
// The map (plan step T6): one Docs page drawn from the ticket data. Epic-level
// edges are the cross-epic "after" links; each epic lists its first ticket
// with nothing in front of it, so the page reads as "start here" per thread.
// Written on every run so it follows the data; the page is replaced, not
// duplicated, by title.
// ---------------------------------------------------------------------------
function mapMarkdown(): string {
  const epicOf = new Map<string, (typeof allEpics)[number]>();
  for (const e of allEpics) {
    epicOf.set(e.epic.sid, e);
    for (const t of e.tickets) epicOf.set(t.sid, e);
  }
  const edges = new Map<string, Set<string>>();
  const firsts: string[] = [];
  const lines: string[] = [
    `# Map: the 2026-11-28 run`,
    ``,
    `Drawn from the ticket files on ${new Date().toISOString().slice(0, 10)}. An arrow means "the epic on the left has a ticket that waits for one in the epic on the right". The next unblocked ticket of each thread is listed under it; the live roadmap page (review.03) will do this from the database instead.`,
    ``,
    "```mermaid",
    "flowchart LR",
  ];
  for (const e of allEpics) lines.push(`  ${e.stem}["${e.epic.title.replace(/"/g, "'").slice(0, 48)}"]`);
  for (const e of allEpics) {
    for (const t of e.tickets) {
      for (const a of t.after ?? []) {
        const other = epicOf.get(a);
        if (other && other.stem !== e.stem) {
          if (!edges.has(e.stem)) edges.set(e.stem, new Set());
          edges.get(e.stem)!.add(other.stem);
        }
      }
    }
  }
  for (const [from, tos] of edges) for (const to of tos) lines.push(`  ${from} --> ${to}`);
  lines.push("```", "", "## Where each thread starts", "");
  for (const e of allEpics) {
    const epicKey = createdKeyBySid.get(e.epic.sid);
    const ready = e.tickets.filter((t) => (t.after ?? []).every((a) => KEY_RE.test(a) ? false : !epicOf.has(a)));
    const first = ready[0] ?? e.tickets[0];
    const firstKey = first ? createdKeyBySid.get(first.sid) : null;
    lines.push(`### ${e.epic.title}${epicKey ? ` (${epicKey})` : ""}`);
    lines.push(`${e.tickets.length} tickets, ${e.tickets.filter((t) => t.due).length} dated, ${e.tickets.filter((t) => t.steps_definition).length} with a checklist.`);
    if (first) {
      lines.push(`- Start with ${firstKey ? `${firstKey} ` : ""}${first.title}${first.due ? ` (${first.due})` : ""}${firstKey ? `: ${ticketUrl(firstKey)}` : ""}`);
      firsts.push(first.sid);
    }
    const waits = edges.get(e.stem);
    if (waits?.size) lines.push(`- Waits on: ${Array.from(waits).map((s) => allEpics.find((x) => x.stem === s)?.epic.title ?? s).join("; ")}`);
    lines.push("");
  }
  return lines.join("\n");
}
if (docSpace || !APPLY) {
  const title = "Map: the 2026-11-28 run";
  const have = pagesByTitle.get(title);
  if (have && APPLY) {
    await api("PATCH", `/api/work/docs/pages/${have.id}`, { title, body: markdownToDoc(mapMarkdown()) });
    console.log(`~ page "${title}"`);
  } else {
    await ensurePage(title, mapMarkdown());
  }
}

console.log(
  `\n${APPLY ? "created" : "would create"}: ${totals.projects} projects, ${totals.epics} epics, ${totals.tickets} tickets (${totals.steps} with checklists), ${totals.deps} dependencies, ${totals.links} links, ${totals.pages} doc pages; ${totals.existing} existing re-parented; ${totals.skipped} already there`,
);
