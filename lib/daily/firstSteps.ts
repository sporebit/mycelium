/**
 * First steps, written the night before (research rules 16 and 4: the
 * morning needs no thinking; every item carries a step small enough to
 * start).
 *
 * A ticket with no `next_step` shows a generic line on the focus card
 * ("Open it and write down the very next action"), which hands the hard
 * part back to the person at the worst time of day. The PC's own model
 * writes a concrete one instead: the first physical action, under five
 * minutes, as an if-then where a cue is natural.
 *
 * Only the PC does this. Ticket titles never go to a cloud model for it,
 * and it costs nothing; if the PC is off the generic line stays, and the
 * job runs when the PC is next on.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/queue";
import { registerJobHandler } from "@/lib/jobs/handlers";
import { todayLondon } from "@/lib/tickets/when";
import { bannedIn } from "./words";

export const FIRST_STEPS_KIND = "first_steps";
export const MAX_STEP_CHARS = 110;

export type StepTicket = { id: string; title: string; notes?: string | null };

export const FIRST_STEP_SYSTEM = [
  "You turn tasks into their first physical action. For each task write ONE step.",
  "Rules for a step:",
  "- It is something a person does with their hands in under five minutes: open, find, write, ring, put, measure, send.",
  "- It names the actual object from the task (the email, the form, the drawer), never 'the task' or 'it'.",
  "- Where a natural cue exists, write it as when-then: 'When the kettle is on, find the boiler quote email.'",
  "- Never 'think about', 'plan', 'consider', 'decide', 'research', 'start working on' or 'make a list'.",
  "- Never a reproach or a reminder: no 'don't forget', no 'you still need to', no 'overdue'.",
  "- British English. Fourteen words or fewer. One sentence. No quotation marks.",
  "If a task is too vague to know its first action, give: Write one line saying what done looks like for <the task's own words>.",
  'Answer with JSON only: {"steps":[{"id":"<the id given>","step":"<the step>"}]} with one entry per task, in the order given.',
].join("\n");

/** The user half of the prompt: the tasks, numbered by their own ids. Pure. */
export function firstStepPrompt(tickets: readonly StepTicket[]): string {
  return tickets
    .map((t) => {
      const notes = (t.notes ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
      return `id: ${t.id}\ntask: ${t.title.replace(/\s+/g, " ").trim().slice(0, 160)}${notes ? `\nnotes: ${notes}` : ""}`;
    })
    .join("\n\n");
}

/**
 * Read the model's answer. Pure, and strict: a step is kept only if it is
 * for a ticket that was asked about, is a plausible sentence, and breaks
 * none of the wording rules. Anything else is dropped (the generic line
 * stays for that ticket), never repaired.
 */
export function parseFirstSteps(text: string, askedIds: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return out;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return out;
    }
  }
  const list = (parsed as { steps?: unknown })?.steps;
  if (!Array.isArray(list)) return out;
  const asked = new Set(askedIds);
  for (const entry of list) {
    const id = typeof (entry as { id?: unknown })?.id === "string" ? (entry as { id: string }).id.trim() : "";
    const raw = typeof (entry as { step?: unknown })?.step === "string" ? (entry as { step: string }).step : "";
    if (!asked.has(id) || out.has(id)) continue;
    const step = raw
      .replace(/\s+/g, " ")
      .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
      .trim();
    if (step.length < 8 || step.length > MAX_STEP_CHARS) continue;
    if (step.split(" ").length < 3) continue;
    if (bannedIn(step)) continue;
    if (/\b(think about|consider|decide (?:on|whether|what)|research\b|plan (?:out|how|to)|start working on|make a list)\b/i.test(step)) continue;
    out.set(id, /[.!?]$/.test(step) ? step : `${step}.`);
  }
  return out;
}

type Row = { id: string; title: string; description: string | null };

/**
 * Queue first steps for what is likely to be on tomorrow's card: things
 * lined up or in progress, and things dated in the next two days, that have
 * no step yet. One job a night per person; a second call the same night is
 * the same job. Returns how many tickets were asked about.
 */
export async function queueFirstSteps(db: SupabaseClient, uid: string, opts: { limit?: number; now?: Date } = {}): Promise<number> {
  const today = todayLondon(opts.now ?? new Date());
  const soon = new Date(Date.parse(`${today}T12:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("tickets")
    .select("id, title, description, scheduled_on, deadline_on, ticket_status:ticket_statuses!inner(category)")
    .eq("created_by", uid)
    .is("next_step", null)
    .is("deleted_at", null)
    .is("parent_task_id", null)
    .in("ticket_status.category", ["next", "doing", "inbox", "backlog"])
    .or(`scheduled_on.lte.${soon},deadline_on.lte.${soon},scheduled_on.is.null`)
    .order("deadline_on", { ascending: true, nullsFirst: false })
    .limit(60);
  if (error) throw new Error(`first steps: ${error.message}`);
  type Wide = Row & { scheduled_on: string | null; deadline_on: string | null; ticket_status: { category: string } | Array<{ category: string }> };
  const category = (r: Wide) => (Array.isArray(r.ticket_status) ? r.ticket_status[0]?.category : r.ticket_status?.category) ?? "";
  // Lined up or in progress, or dated soon. An undated backlog item is not on tomorrow's card.
  const rows = ((data ?? []) as unknown as Wide[])
    .filter((r) => ["next", "doing"].includes(category(r)) || (r.scheduled_on && r.scheduled_on <= soon) || (r.deadline_on && r.deadline_on <= soon))
    .slice(0, opts.limit ?? 8);
  if (!rows.length) return 0;
  const tickets: StepTicket[] = rows.map((r) => ({ id: r.id, title: r.title, notes: plain(r.description) }));
  const res = await enqueueJob(db, {
    kind: FIRST_STEPS_KIND,
    lane: "pc",
    dedupeKey: `first_steps:${uid}:${today}`,
    maxAttempts: 2,
    payload: { system: FIRST_STEP_SYSTEM, user: firstStepPrompt(tickets), json: true, max_tokens: 700, ticket_ids: tickets.map((t) => t.id) },
  });
  return res.duplicate ? 0 : tickets.length;
}

function plain(html: string | null): string | null {
  if (!html) return null;
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() || null;
}

/** Write the steps that passed: onto the ticket if it still has none, and onto today's card for it if that is still blank. */
export async function applyFirstSteps(db: SupabaseClient, steps: Map<string, string>): Promise<number> {
  let written = 0;
  for (const [id, step] of steps) {
    const { data } = await db.from("tickets").update({ next_step: step }).eq("id", id).is("next_step", null).select("id");
    if (!data?.length) continue;
    written += 1;
    await db.from("day_plan_items").update({ first_step: step }).eq("ticket_id", id).is("first_step", null).in("state", ["planned", "started"]);
  }
  return written;
}

registerJobHandler(FIRST_STEPS_KIND, {
  apply: async (job, result, db) => {
    const asked = Array.isArray((job.payload as { ticket_ids?: unknown })?.ticket_ids) ? ((job.payload as { ticket_ids: unknown[] }).ticket_ids.filter((x) => typeof x === "string") as string[]) : [];
    const steps = parseFirstSteps(typeof result.text === "string" ? result.text : "", asked);
    await applyFirstSteps(db, steps);
  },
});
