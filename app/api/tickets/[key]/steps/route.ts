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
import { fetchTicketByKey, principalUid, readJson, resolveTicketRef, ticketWriteGate } from "@/lib/tickets/server";
import { syncTicketToGoogle } from "@/lib/google/sync";
import { flightPlan, overall, phaseProgress, resumePoint, tomorrowLondon } from "@/lib/guides/progress";
import { isSecretLike, SECRET_REFUSAL } from "@/lib/guides/secret";
import { validateDefinition } from "@/lib/guides/validate";

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
    // The Field guide's derived view (lib/guides/progress.ts), so `tix guide KEY` and the list need no second copy of the maths.
    const phases = def ? phaseProgress(def, state) : [];
    return NextResponse.json({
      key: data.ticket_key,
      title: data.title,
      kind: data.kind,
      definition: def,
      state,
      counts: countSteps(def, state),
      answers: state.answers,
      updated_at: data.updated_at,
      guide: def
        ? { overall: overall(def, state, phases), plan: flightPlan(def, state, phases), resume: resumePoint(def, state, new Date(), phases) }
        : null,
    });
  } catch (err) {
    console.error("[/api/tickets/:key/steps GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * PATCH { steps?, answers?, toggles?, failures?, park?, definition? }
 * Per-key JSONB merge on the state (checklists §4; null deletes a key).
 * `definition` replaces the whole definition (authoring / import); a Field
 * guide (`format: "field-guide"`) must pass lib/guides/validate.ts.
 * `park` with a step sets the ticket's scheduled_on to tomorrow (London) and
 * logs a "park" activity row; `park: null` clears scheduled_on only when it
 * still holds the date that park set (Field guide design §4, D7).
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
  if (body.definition) {
    const v = validateDefinition(body.definition);
    if (!v.ok) return NextResponse.json({ error: "this Field guide is missing parts", errors: v.errors }, { status: 400 });
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
      .select("steps_definition, steps_state, scheduled_on")
      .eq("id", ref.id)
      .single();
    const before = normaliseState(cur?.steps_state);

    // The secret guard (D6): a Field guide never stores anything shaped like a key, in an answer or a note.
    const effectiveDef = (body.definition !== undefined ? body.definition : cur?.steps_definition) as StepsDefinition | null;
    if (effectiveDef?.format === "field-guide") {
      const written = [
        ...Object.values(body.answers ?? {}),
        ...Object.values(body.failures ?? {}).map((f) => f?.note),
        body.park?.note,
      ];
      if (written.some((v) => typeof v === "string" && isSecretLike(v))) {
        return NextResponse.json({ error: SECRET_REFUSAL }, { status: 400 });
      }
    }

    const now = new Date();
    const state = mergeState(before, body, now);
    const update: Record<string, unknown> = { steps_state: state, updated_at: now.toISOString() };
    if (body.definition !== undefined) update.steps_definition = body.definition;

    // Park puts the guide on tomorrow's list; unpark takes it off only if nothing else moved the date since.
    let parkLog: string | null = null;
    if (body.park && typeof body.park.step_id === "string") {
      update.scheduled_on = tomorrowLondon(now);
      parkLog = `${body.park.step_id}${body.park.note ? `: ${body.park.note}` : ""}`.slice(0, 200);
    } else if (body.park === null && before.park) {
      const setBy = tomorrowLondon(new Date(before.park.at));
      if (cur?.scheduled_on === setBy) update.scheduled_on = null;
    }

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
    if (parkLog !== null) {
      await supabase.from("ticket_activity").insert({
        ticket_id: ref.id,
        action: "park",
        field: "scheduled_on",
        from_value: (cur?.scheduled_on as string | null) ?? null,
        to_value: `${update.scheduled_on} · ${parkLog}`.slice(0, 200),
      });
    }
    if ("scheduled_on" in update) {
      const task = await fetchTicketByKey(supabase, key);
      if (task) void syncTicketToGoogle(supabase, task);
    }
    const def = (data.steps_definition as StepsDefinition | null) ?? null;
    return NextResponse.json({
      definition: def,
      state,
      counts: countSteps(def, state),
      updated_at: data.updated_at,
      scheduled_on: "scheduled_on" in update ? update.scheduled_on : (cur?.scheduled_on ?? null),
    });
  } catch (err) {
    console.error("[/api/tickets/:key/steps PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
