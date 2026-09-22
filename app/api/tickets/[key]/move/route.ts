import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { syncTicketToGoogle } from "@/lib/google/sync";
import {
  isLinkKind,
  isTicketCategory,
  linkKindFor,
  moveTicket,
  principalUid,
  readJson,
  ticketWriteGate,
} from "@/lib/tickets/server";

export const runtime = "nodejs";

/**
 * POST /api/tickets/[key]/move
 *   { category, evidence?, evidence_label?, forward_only?,
 *     waiting_on_person_id?, someday?, scheduled_on? }
 *
 * Transition by category (spec §11). `evidence` (a URL) is written as a
 * ticket_links row so a Done / Verify move carries its proof. `forward_only`
 * is the automation rule (spec §6): a system caller never moves a ticket
 * backwards and never closes one without evidence; the UI may do both.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson(req);
  if (!body || !isTicketCategory(body.category)) {
    return NextResponse.json({ error: "category required" }, { status: 400 });
  }
  const evidence = typeof body.evidence === "string" ? body.evidence.trim() : null;
  const forwardOnly = body.forward_only === true;
  if ((body.category === "done" || body.category === "verify") && forwardOnly && !evidence) {
    return NextResponse.json(
      { error: "evidence url required for automation to close a ticket" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;

    const extra: Record<string, unknown> = {};
    if (typeof body.someday === "boolean") extra.someday = body.someday;
    if (body.waiting_on_person_id === null || typeof body.waiting_on_person_id === "string") {
      extra.waiting_on_person_id = body.waiting_on_person_id;
    }
    if (
      body.scheduled_on === null ||
      (typeof body.scheduled_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.scheduled_on))
    ) {
      extra.scheduled_on = body.scheduled_on;
    }

    const moved = await moveTicket(supabase, key, body.category, { forwardOnly, extra });
    if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status });

    if (evidence && /^https?:\/\//i.test(evidence)) {
      await supabase.from("ticket_links").insert({
        ticket_id: moved.task.id,
        kind: isLinkKind(body.evidence_kind) ? body.evidence_kind : linkKindFor(evidence),
        url: evidence,
        label: typeof body.evidence_label === "string" ? body.evidence_label : null,
        meta: { via: "move", to: moved.to },
      });
    }
    // Google Calendar (MYC-40): a close removes the event, a scheduled_on on the move creates or moves it
    if (moved.to === "done" || moved.to === "cancelled" || "scheduled_on" in extra) void syncTicketToGoogle(supabase, moved.task);
    return NextResponse.json({ task: moved.task, ticket: moved.task, from: moved.from, to: moved.to });
  } catch (err) {
    console.error("[/api/tickets/:key/move POST]", err);
    return NextResponse.json({ error: "move failed" }, { status: 500 });
  }
}
