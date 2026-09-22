import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { logTaskActivity } from "@/lib/task-activity";
import { syncTicketToGoogle, type TicketForCalendar } from "@/lib/google/sync";
import {
  isTicketCategory,
  principalUid,
  readJson,
  resolveTicketRef,
  statusIdFor,
  ticketFieldsFromBody,
  ticketWriteGate,
} from "@/lib/tickets/server";

export const runtime = "nodejs";

/** Fields a bulk edit may touch (spec §11): status, project, contexts, dates, assignee. */
const BULK_FIELDS = new Set([
  "project_id",
  "where_ctx",
  "tools",
  "time_window",
  "time_from",
  "time_to",
  "days",
  "points",
  "scheduled_on",
  "deadline_on",
  "assignee_id",
  "someday",
  "urgent",
  "kind",
  "sprint_id",
]);

const MAX = 200;

/**
 * POST /api/tickets/bulk  { keys: string[], set: {...} }
 *
 * All-or-nothing: every key must resolve before anything is written, then
 * one UPDATE per space (a category resolves to that space's status row).
 * Activity is logged per ticket. Long-press → bulk on mobile uses this.
 */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  const body = await readJson<{ keys?: unknown; set?: unknown }>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const keys = Array.isArray(body.keys)
    ? Array.from(new Set(body.keys.filter((k): k is string => typeof k === "string" && k.trim().length > 0)))
    : [];
  if (keys.length === 0) return NextResponse.json({ error: "keys required" }, { status: 400 });
  if (keys.length > MAX) return NextResponse.json({ error: `at most ${MAX} keys` }, { status: 400 });
  const setRaw = body.set && typeof body.set === "object" ? (body.set as Record<string, unknown>) : null;
  if (!setRaw) return NextResponse.json({ error: "set required" }, { status: 400 });

  const picked = ticketFieldsFromBody(setRaw);
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(picked)) if (BULK_FIELDS.has(k)) set[k] = v;
  const category = isTicketCategory(setRaw.category) ? setRaw.category : null;
  if (Object.keys(set).length === 0 && !category) {
    return NextResponse.json({ error: "no valid fields in set" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;

    // Resolve everything first (all-or-nothing).
    const refs = await Promise.all(keys.map((k) => resolveTicketRef(supabase, k)));
    const missing = keys.filter((_, i) => !refs[i]);
    if (missing.length > 0) {
      return NextResponse.json({ error: "not found", missing }, { status: 404 });
    }
    const found = refs.filter((r): r is NonNullable<typeof r> => !!r);

    const bySpace = new Map<string, typeof found>();
    for (const r of found) bySpace.set(r.space_id, [...(bySpace.get(r.space_id) ?? []), r]);

    const statusBySpace = new Map<string, string>();
    if (category) {
      for (const spaceId of bySpace.keys()) {
        const sid = await statusIdFor(supabase, spaceId, category);
        if (!sid) {
          return NextResponse.json({ error: `no ${category} status in a target space` }, { status: 500 });
        }
        statusBySpace.set(spaceId, sid);
      }
    }

    const ids = found.map((r) => r.id);
    const beforeCols = ["id", "space_id", ...Object.keys(set), ...(category ? ["status_id"] : [])].join(", ");
    const { data: beforeRows } = await supabase.from("tickets").select(beforeCols).in("id", ids);
    const before = new Map<string, Record<string, unknown>>();
    for (const r of (beforeRows ?? []) as unknown as Array<Record<string, unknown>>) {
      before.set(r.id as string, r);
    }

    const now = new Date().toISOString();
    let updated = 0;
    for (const [spaceId, rows] of bySpace) {
      const update: Record<string, unknown> = { ...set, updated_at: now };
      if (category) update.status_id = statusBySpace.get(spaceId);
      const { data, error } = await supabase
        .from("tickets")
        .update(update)
        .in(
          "id",
          rows.map((r) => r.id),
        )
        .select("id");
      if (error) throw error;
      updated += data?.length ?? 0;
    }

    // Google Calendar (MYC-40): a scheduled_on or a close changes the event
    if ("scheduled_on" in set || category === "done" || category === "cancelled") {
      const { data: after } = await supabase.from("tickets").select("id, title, description, scheduled_at, scheduled_on, google_event_id, completed_at, cancelled_at, ticket_status:ticket_statuses(category)").in("id", found.map((r) => r.id));
      for (const t of (after ?? []) as Array<TicketForCalendar & { ticket_status: { category: string } | { category: string }[] | null }>) {
        const st = Array.isArray(t.ticket_status) ? t.ticket_status[0] : t.ticket_status;
        void syncTicketToGoogle(supabase, { ...t, category: st?.category ?? null });
      }
    }

    // Activity per ticket, categories logged by name.
    await Promise.all(
      found.map((r) => {
        const b = { ...(before.get(r.id) ?? {}) };
        const a: Record<string, unknown> = { ...set };
        if (category) {
          b.status_id = r.category ?? r.status_id;
          a.status_id = category;
        }
        return logTaskActivity(supabase, r.id, b, a);
      }),
    );

    return NextResponse.json({ ok: true, updated, keys });
  } catch (err) {
    console.error("[/api/tickets/bulk POST]", err);
    return NextResponse.json({ error: "bulk update failed" }, { status: 500 });
  }
}
