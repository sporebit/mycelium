/**
 * Tickets — rundowns (spec §9.1, Q19). Life kinds get an app-generated plan
 * from Sonnet with Anthropic's web search tool (opening hours, the exact
 * page to book on, documents needed, cost, a suggested sub-task list). Code
 * plans are NOT generated here — the Claude Code skill writes them as a
 * comment with repo context. Cost is recorded in api_usage under
 * `tickets.rundown` and capped per month (£10 default: alert at 80 %, stop
 * at 100 %).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODEL_CHAT } from "@/lib/config/models";
import { checkCap, costPence, recordUsage } from "@/lib/ai/usage";
import { alreadyLogged, logOnce, sendToPhil } from "./notify";
import { resolveTicketRef } from "./server";
import { addDays } from "./recur";

export const RUNDOWN_TAG = "tickets.rundown";
export const RUNDOWN_CAP_PENCE = Number(process.env.TICKETS_RUNDOWN_CAP_PENCE ?? "1000");
const LOCATION = process.env.USER_LOCATION ?? "Doncaster, UK";

type TicketForPlan = {
  id: string;
  ticket_key: string | null;
  title: string;
  description: string | null;
  kind: string;
  where_ctx: string;
  tools: string[];
  time_window: string;
  points: number | null;
  scheduled_on: string | null;
  deadline_on: string | null;
  rundown_md: string | null;
  projects: { name: string } | { name: string }[] | null;
  waiting_on: { display_name: string | null } | { display_name: string | null }[] | null;
};

const PLAN_SELECT =
  "id, ticket_key, title, description, kind, where_ctx, tools, time_window, points, scheduled_on, deadline_on, rundown_md, projects(name), waiting_on:people(display_name)";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Code-ish tickets are planned by the skill, not the app. */
export function isCodeTicket(t: { title: string; description: string | null; projects: TicketForPlan["projects"]; tools: string[] }): boolean {
  const proj = one(t.projects)?.name ?? "";
  const text = `${t.title} ${t.description ?? ""} ${proj}`;
  return /\b(mycelium|next\.js|supabase|vercel|migration|api|refactor|deploy|typescript|react|bug|pr\b|commit|repo)\b/i.test(text) && t.tools.includes("pc");
}

type Result = { ok: true; rundown: string; model: string; input: number; output: number; searches: number } | { ok: false; error: string; status: number };

export async function generateRundown(db: SupabaseClient, ref: string, opts: { force?: boolean } = {}): Promise<Result> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY missing", status: 500 };
  const r = await resolveTicketRef(db, ref);
  if (!r) return { ok: false, error: "not found", status: 404 };
  const { data } = await db.from("tickets").select(PLAN_SELECT).eq("id", r.id).single();
  const t = data as unknown as TicketForPlan | null;
  if (!t) return { ok: false, error: "not found", status: 404 };
  if (isCodeTicket(t)) return { ok: false, error: "code tickets are planned by the Claude Code skill (tix plan)", status: 422 };

  const cap = await checkCap(db, RUNDOWN_TAG, RUNDOWN_CAP_PENCE);
  if (!cap.allowed && !opts.force) {
    return { ok: false, error: `monthly rundown cap reached (£${(cap.spent_pence / 100).toFixed(2)} of £${(cap.cap_pence / 100).toFixed(2)})`, status: 429 };
  }

  const today = new Date().toISOString().slice(0, 10);
  const project = one(t.projects)?.name;
  const person = one(t.waiting_on)?.display_name;
  const system = [
    "You write short, practical rundowns for a personal to-do ticket. British English. Markdown.",
    `The user lives in ${LOCATION}; today is ${today}.`,
    "Use web search when real-world facts matter (opening hours, the exact page to book on, documents needed, typical cost). Cite the source URL inline after any fact you looked up.",
    "Output sections: **Plan** (3–7 numbered steps, each one action), **Need** (documents / details to have ready), **Cost & time** (one line), **Book / go here** (the exact link or place), **Sub-tasks** (a bullet list of 2–6 short titles suitable as sub-tasks).",
    "Never invent phone numbers or prices; say 'check' when unsure. Under 250 words.",
  ].join("\n");
  const user = [
    `Ticket ${t.ticket_key ?? ""}: ${t.title}`,
    t.description ? `Notes: ${t.description}` : "",
    project ? `Project: ${project}` : "",
    person ? `Waiting on: ${person}` : "",
    `Contexts: ${t.where_ctx}, tools ${t.tools.join("/")}, ${t.time_window}${t.points ? `, ${t.points} points` : ""}`,
    t.scheduled_on ? `Scheduled: ${t.scheduled_on}` : "",
    t.deadline_on ? `Deadline: ${t.deadline_on}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL_CHAT,
        max_tokens: 900,
        system,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: user }],
      }),
    });
    const j = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, error: j.error?.message ?? `anthropic ${res.status}`, status: 502 };
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
    if (!text) return { ok: false, error: "empty response", status: 502 };
    const input = j.usage?.input_tokens ?? 0;
    const output = j.usage?.output_tokens ?? 0;
    const searches = j.usage?.server_tool_use?.web_search_requests ?? 0;
    const pence = costPence(MODEL_CHAT, input, output, searches * 0.01); // $10 / 1000 searches
    await db
      .from("tickets")
      .update({ rundown_md: text, rundown_generated_at: new Date().toISOString(), rundown_model: MODEL_CHAT, updated_at: new Date().toISOString() })
      .eq("id", t.id);
    await recordUsage(db, { tag: RUNDOWN_TAG, model: MODEL_CHAT, input_tokens: input, output_tokens: output, cost_pence: pence, meta: { ticket: t.ticket_key, searches } });
    await db.from("ticket_activity").insert({ ticket_id: t.id, action: "rundown", field: "rundown_md", from_value: null, to_value: `${MODEL_CHAT} · ${searches} searches` });

    // 80 % alert, once per month
    const after = await checkCap(db, RUNDOWN_TAG, RUNDOWN_CAP_PENCE);
    const month = today.slice(0, 7);
    if (after.warn && !(await alreadyLogged(db, "tickets_rundown_cap_warn", "month", month))) {
      await sendToPhil(`⚠️ Rundowns have used £${(after.spent_pence / 100).toFixed(2)} of the £${(after.cap_pence / 100).toFixed(2)} monthly cap.`);
      await logOnce(db, "tickets_rundown_cap_warn", { month });
    }
    return { ok: true, rundown: text, model: MODEL_CHAT, input, output, searches };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "failed", status: 502 };
  } finally {
    clearTimeout(timer);
  }
}

/** Nightly: rundowns for tomorrow's scheduled life tickets lacking one. */
export async function generateMissingRundowns(db: SupabaseClient, opts: { forDate: string; dry?: boolean }): Promise<{ candidates: number; generated: number; skipped: string[] }> {
  const tomorrow = addDays(opts.forDate, 1);
  const { data } = await db
    .from("tickets")
    .select(`${PLAN_SELECT}, ticket_status:ticket_statuses!inner(category)`)
    .eq("scheduled_on", tomorrow)
    .is("rundown_md", null)
    .is("deleted_at", null)
    .in("kind", ["task"])
    .in("ticket_status.category", ["next", "doing", "backlog"])
    .limit(5);
  const rows = (data ?? []) as unknown as TicketForPlan[];
  const skipped: string[] = [];
  let generated = 0;
  for (const t of rows) {
    if (isCodeTicket(t)) {
      skipped.push(`${t.ticket_key} (code)`);
      continue;
    }
    if (opts.dry) {
      skipped.push(`${t.ticket_key} (dry)`);
      continue;
    }
    const r = await generateRundown(db, t.id);
    if (r.ok) generated += 1;
    else skipped.push(`${t.ticket_key} (${r.error})`);
  }
  return { candidates: rows.length, generated, skipped };
}
