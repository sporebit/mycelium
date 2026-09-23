#!/usr/bin/env node
/**
 * tix — Mycelium tickets from the shell (tickets spec §14.2).
 *
 *   env: MYCELIUM_URL (default https://mycelium.sporebit.com)
 *        MYCELIUM_TICKETS_TOKEN (an mtk_ token from Settings → Security)
 *
 *   tix ls [--project MYC] [--list next|doing|waiting|inbox|today|upcoming|someday|logbook|now] [--q text] [--json]
 *   tix show KEY
 *   tix new "title" [--project <id|name>] [--kind task] [--where home] [--tools pc,phone] [--points 3] [--category next] [--template slug]
 *   tix move KEY <category> [--evidence URL] [--label text]
 *   tix done KEY --evidence URL
 *   tix verify KEY
 *   tix comment KEY "text"           (session reports go here)
 *   tix link KEY URL [--kind commit] [--label text]
 *   tix answers KEY                  (steps answers; the checklists habit)
 *   tix steps KEY [--tick 1.3] [--untick 1.3] [--answer key=value] [--toggle route=direct]
 *   tix plan KEY [--body-file plan.md] (code rundown written by Claude Code)
 *   tix review                       (weekly-review counts)
 *   tix templates [--sync]
 *
 * Node ≥ 18 (global fetch). No dependencies.
 */
import { readFileSync } from "node:fs";

const BASE = (process.env.MYCELIUM_URL ?? "https://mycelium.sporebit.com").replace(/\/$/, "");
const TOKEN = process.env.MYCELIUM_TICKETS_TOKEN ?? "";
const API_SECRET = process.env.API_SECRET ?? "";

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) opts[k] = true;
      else {
        opts[k] = next;
        i++;
      }
    } else pos.push(a);
  }
  return { pos, opts };
}

async function api(method, path, body) {
  if (!TOKEN && !API_SECRET) die("Set MYCELIUM_TICKETS_TOKEN (Settings → Security → API tokens).");
  const headers = { "content-type": "application/json" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  else headers["x-api-secret"] = API_SECRET;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) die(`${method} ${path} → ${res.status} ${json.error ?? text.slice(0, 200)}`);
  return json;
}

function row(t) {
  const cat = (t.category ?? "").padEnd(9);
  const key = (t.ticket_key ?? "").padEnd(9);
  const proj = t.project_name ? `  [${t.project_name}]` : "";
  const when = t.deadline_on ? `  ⚑${t.deadline_on}` : t.scheduled_on ? `  ▸${t.scheduled_on}` : "";
  return `${key} ${cat} ${t.urgent ? "! " : ""}${t.title}${proj}${when}`;
}

async function resolveProject(nameOrId) {
  if (!nameOrId) return null;
  if (/^[0-9a-f-]{36}$/i.test(nameOrId)) return nameOrId;
  const { projects } = await api("GET", "/api/projects");
  const p = projects.find((x) => x.name.toLowerCase() === nameOrId.toLowerCase() || (x.prefix ?? "").toUpperCase() === nameOrId.toUpperCase());
  if (!p) die(`project not found: ${nameOrId}`);
  return p.id;
}

const [cmd, ...rest] = process.argv.slice(2);
const { pos, opts } = parseArgs(rest);

switch (cmd) {
  case "ls": {
    const sp = new URLSearchParams();
    const GTD = ["now", "inbox", "today", "upcoming", "next", "waiting", "someday", "logbook"];
    // --list takes a GTD list or a category (doing, backlog, verify, done, cancelled) or a csv of categories
    if (opts.list) {
      const v = String(opts.list);
      if (GTD.includes(v)) sp.set("list", v);
      else sp.set("category", v);
    }
    if (opts.surface) sp.set("surface", String(opts.surface));
    if (opts.q) sp.set("q", String(opts.q));
    if (opts.limit) sp.set("limit", String(opts.limit));
    if (opts.project) sp.set("project", await resolveProject(String(opts.project)));
    if (opts.list === "now") {
      sp.set("where", String(opts.where ?? "home"));
      sp.set("tools", String(opts.tools ?? "pc,phone"));
      if (opts.backlog) sp.set("include_backlog", "1");
    }
    const { tickets } = await api("GET", `/api/tickets?${sp}`);
    if (opts.json) console.log(JSON.stringify(tickets, null, 2));
    else {
      for (const t of tickets) console.log(row(t));
      console.log(`— ${tickets.length} tickets`);
    }
    break;
  }
  case "show": {
    const key = pos[0] ?? die("tix show KEY");
    const j = await api("GET", `/api/tickets/${encodeURIComponent(key)}`);
    if (opts.json) console.log(JSON.stringify(j, null, 2));
    else {
      const t = j.task;
      console.log(row(t));
      if (t.key_aliases?.length) console.log(`formerly ${t.key_aliases.join(", ")} (old keys still resolve)`);
      if (t.description) console.log(`\n${t.description}\n`);
      console.log(`where ${t.where_ctx} · tools ${(t.tools ?? []).join(",")} · ${t.time_window} · ${t.points ?? "-"} pts · ${t.status_name ?? t.category}`);
      if (j.sub_tasks?.length) {
        console.log("\nsub-tasks:");
        for (const s of j.sub_tasks) console.log("  " + row(s));
      }
      if (j.links?.length) {
        console.log("\nlinks:");
        for (const l of j.links) console.log(`  ${l.kind.padEnd(10)} ${l.url ?? l.ref ?? ""} ${l.label ? `(${l.label})` : ""}`);
      }
      if (t.rundown_md) console.log(`\nrundown:\n${t.rundown_md}`);
      if (j.comments?.length) {
        console.log("\ncomments:");
        for (const c of j.comments) console.log(`  [${c.created_at.slice(0, 16)}] ${c.body}`);
      }
    }
    break;
  }
  case "new": {
    const title = pos[0];
    const body = { title };
    if (opts.template) body.template = String(opts.template);
    if (!title && !body.template) die('tix new "title"');
    if (opts.project) body.project_id = await resolveProject(String(opts.project));
    for (const k of ["kind", "where", "time_window", "scheduled_on", "deadline_on", "description", "category"]) {
      if (opts[k] !== undefined) body[k === "where" ? "where_ctx" : k] = String(opts[k]);
    }
    if (opts.tools) body.tools = String(opts.tools).split(",");
    if (opts.points) body.points = Number(opts.points);
    body.source = "claude";
    const j = await api("POST", "/api/tickets", body);
    console.log(j.key);
    break;
  }
  case "move":
  case "done": {
    const key = pos[0] ?? die(`tix ${cmd} KEY …`);
    const category = cmd === "done" ? "done" : pos[1] ?? die("tix move KEY <category>");
    if (cmd === "done" && !opts.evidence) die("tix done needs --evidence <url> (never close a ticket without evidence)");
    const j = await api("POST", `/api/tickets/${encodeURIComponent(key)}/move`, {
      category,
      evidence: opts.evidence ? String(opts.evidence) : undefined,
      evidence_label: opts.label ? String(opts.label) : undefined,
      forward_only: true,
    });
    console.log(`${j.task.ticket_key}: ${j.from} → ${j.to}`);
    break;
  }
  case "verify": {
    const key = pos[0] ?? die("tix verify KEY");
    const j = await api("POST", `/api/tickets/${encodeURIComponent(key)}/verify`, {});
    console.log(`${j.task.ticket_key}: verified ${j.task.verified_at}`);
    break;
  }
  case "comment": {
    const key = pos[0] ?? die('tix comment KEY "text"');
    const text = pos[1] ?? (opts.file ? readFileSync(String(opts.file), "utf8") : die("text or --file"));
    await api("POST", `/api/tickets/${encodeURIComponent(key)}/comments`, { body: text });
    console.log("ok");
    break;
  }
  case "link": {
    const key = pos[0] ?? die("tix link KEY URL");
    const url = pos[1] ?? die("tix link KEY URL");
    const j = await api("POST", `/api/tickets/${encodeURIComponent(key)}/links`, { url, kind: opts.kind, label: opts.label });
    console.log(`${j.link.kind} ${j.link.url}`);
    break;
  }
  case "answers": {
    const key = pos[0] ?? die("tix answers KEY");
    const j = await api("GET", `/api/tickets/${encodeURIComponent(key)}/steps`);
    console.log(JSON.stringify({ counts: j.counts, toggles: j.state.toggles, answers: j.answers }, null, 2));
    break;
  }
  case "steps": {
    const key = pos[0] ?? die("tix steps KEY …");
    const patch = { steps: {}, answers: {}, toggles: {} };
    const many = (v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
    for (const id of many(opts.tick)) patch.steps[String(id)] = true;
    for (const id of many(opts.untick)) patch.steps[String(id)] = null;
    for (const kv of many(opts.answer)) {
      const [k, ...v] = String(kv).split("=");
      patch.answers[k] = v.join("=");
    }
    for (const kv of many(opts.toggle)) {
      const [k, v] = String(kv).split("=");
      patch.toggles[k] = v;
    }
    const j = await api("PATCH", `/api/tickets/${encodeURIComponent(key)}/steps`, patch);
    console.log(`${j.counts.done}/${j.counts.total}`);
    break;
  }
  case "plan": {
    const key = pos[0] ?? die("tix plan KEY [--body-file plan.md]");
    const body = opts["body-file"] ? { body: readFileSync(String(opts["body-file"]), "utf8"), model: "claude-code" } : {};
    const j = await api("POST", `/api/tickets/${encodeURIComponent(key)}/plan`, body);
    console.log(j.rundown ?? JSON.stringify(j));
    break;
  }
  case "review": {
    const j = await api("GET", "/api/tickets/review");
    console.log(`${j.week}${j.sealed_at ? " (sealed)" : ""}: inbox ${j.inbox.length} · waiting ${j.waiting.length} · projects w/o next ${j.projectsWithoutNext.length} · someday ${j.someday.length} · stale ${j.stale.length} · done-unverified ${j.doneUnverified.length} · week ahead ${j.weekAhead.length}`);
    break;
  }
  case "templates": {
    if (opts.sync) console.log(JSON.stringify(await api("POST", "/api/tickets/templates?sync=1", {})));
    const { templates } = await api("GET", "/api/tickets/templates");
    for (const t of templates) console.log(`${t.slug.padEnd(20)} ${t.kind.padEnd(8)} v${t.version} ${t.origin}  ${t.name}`);
    break;
  }
  default:
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 24).join("\n").replace(/^ \*\s?/gm, ""));
}
