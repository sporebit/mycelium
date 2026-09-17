import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import {
  countSteps,
  isStepsDefinition,
  mergeState,
  normaliseState,
  type StatePatch,
  type StepsDefinition,
} from "@/lib/tickets/steps";
import { principalUid, readJson, resolveTicketRef, ticketWriteGate } from "@/lib/tickets/server";

export const runtime = "nodejs";

const SELECT = "id, ticket_key, title, kind, steps_definition, steps_state, updated_at";

/** GET — definition + state + counts (Claude reads answers here: `tix answers KEY`). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data, error } = await supabase.from("tickets").select(SELECT).eq("id", ref.id).single();
    if (error || !data) throw error ?? new Error("not found");
    const def = (data.steps_definition as StepsDefinition | null) ?? null;
    const state = normaliseState(data.steps_state);
    return NextResponse.json({
      key: data.ticket_key,
      title: data.title,
      kind: data.kind,
      definition: def,
      state,
      counts: countSteps(def, state),
      answers: state.answers,
      updated_at: data.updated_at,
    });
  } catch (err) {
    console.error("[/api/tickets/:key/steps GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * PATCH { steps?, answers?, toggles?, definition? }
 * Per-key JSONB merge on the state (checklists §4; null deletes a key).
 * `definition` replaces the whole definition (authoring / import).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson<StatePatch & { definition?: unknown }>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  if (body.definition !== undefined && body.definition !== null && !isStepsDefinition(body.definition)) {
    return NextResponse.json({ error: "definition must have phases[] with steps[]" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Merge against the freshest row to keep concurrent ticks intact.
    const { data: cur } = await supabase
      .from("tickets")
      .select("steps_definition, steps_state")
      .eq("id", ref.id)
      .single();
    const state = mergeState(normaliseState(cur?.steps_state), body);
    const update: Record<string, unknown> = { steps_state: state, updated_at: new Date().toISOString() };
    if (body.definition !== undefined) update.steps_definition = body.definition;

    const { data, error } = await supabase.from("tickets").update(update).eq("id", ref.id).select(SELECT).single();
    if (error || !data) throw error ?? new Error("update failed");

    const tickedNow = Object.entries(body.steps ?? {}).filter(([, v]) => v === true || (v && typeof v === "object" && v.done));
    if (tickedNow.length > 0) {
      await supabase.from("ticket_activity").insert({
        ticket_id: ref.id,
        action: "step",
        field: "steps",
        from_value: null,
        to_value: tickedNow.map(([k]) => k).join(", ").slice(0, 200),
      });
    }
    const def = (data.steps_definition as StepsDefinition | null) ?? null;
    return NextResponse.json({ definition: def, state, counts: countSteps(def, state), updated_at: data.updated_at });
  } catch (err) {
    console.error("[/api/tickets/:key/steps PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
