import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { extractionFromClassification } from "@/lib/quotes/server";
import { getEntityDef, isTypedKind, type FieldValues } from "@/lib/capture/registry";
import { createRoutedRow, deleteRoutedRow, PERSON_PATCH_FIELDS, recordMentions } from "@/lib/capture/materialise";
import { acceptRoutedTicket } from "@/lib/capture/queue";
import { recordApproval } from "@/lib/capture/learning";

export const runtime = "nodejs";

type ReviewAction = "approve" | "reroute" | "discard";

type ReviewBody = {
  action?: ReviewAction;
  // Classification fields the reviewer is allowed to edit. All optional —
  // any omitted field keeps its prior value.
  kind?: string;
  urgency?: string;
  title?: string;
  summary?: string;
  entities?: string[]; // freeform entity name tags
  mentions?: Array<{ raw: string; name_hint: string }>;
  date_inferred?: string | null; // YYYY-MM-DD
  scheduled_at?: string | null; // ISO 8601 timestamptz
  /** Kind "ticket" (MYC-153): the technical project the ticket is created in. */
  project_id?: string | null;
  /** Kind "person" (MYC-154): the person to update and the fields the capture gives. */
  person?: { id: string; patch: Record<string, unknown> };
  /** Quotes (spec §4.7): the reviewer's corrections to the extraction. */
  quote?: {
    text?: string;
    speaker?: string | null;
    said_by_person_id?: string | null;
    is_own?: boolean;
    context?: string | null;
    said_at_relative?: string | null;
    source?: string | null;
  };
  /** Near-duplicate merge: keep the existing quote (discard this one) or replace its text. */
  duplicate?: { id: string; action: "keep" | "replace" };
  /** Gifts (spec §4.7): the reviewer's corrections — recipient, occasion, title, reason. Never creates a person or an occasion. */
  gift?: {
    title?: string;
    person?: string | null;
    for_person_id?: string | null;
    occasion_id?: string | null;
    reason?: string | null;
    url?: string | null;
    target_price?: number | null;
  };
  /** MYC-161: the registry form's values for `kind` — validated and mapped by the registry. */
  fields?: FieldValues;
};

const ALLOWED_KINDS = new Set([
  "find",
  "task",
  "ticket",
  "person",
  "note",
  "decision",
  "idea",
  "journal",
  "capture",
  "workout",
  "purchase",
  "media",
  "quote",
  "reminder",
  "account",
  "pain_log",
  "gift_idea",
]);
const ALLOWED_URGENCIES = new Set([
  "today",
  "this_week",
  "this_month",
  "someday",
]);

function mergeClassification(
  existing: Record<string, unknown> | null,
  body: ReviewBody,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };
  if (body.kind !== undefined && ALLOWED_KINDS.has(body.kind)) {
    merged.kind = body.kind;
  }
  if (body.urgency !== undefined && ALLOWED_URGENCIES.has(body.urgency)) {
    merged.urgency = body.urgency;
  }
  if (typeof body.title === "string") merged.title = body.title;
  if (typeof body.summary === "string") merged.summary = body.summary;
  if (Array.isArray(body.entities)) {
    const cleaned = body.entities
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean);
    merged.entities = cleaned;
    // entity_name keeps the first one for back-compat with the existing
    // router pipeline that reads classification.entity_name.
    merged.entity_name = cleaned[0] ?? null;
  }
  if (Array.isArray(body.mentions)) {
    merged.mentions = body.mentions
      .map((m) => ({
        raw: typeof m?.raw === "string" ? m.raw.trim() : "",
        name_hint:
          typeof m?.name_hint === "string" ? m.name_hint.trim() : "",
      }))
      .filter((m) => m.raw && m.name_hint);
  }
  if (body.quote && typeof body.quote === "object") {
    const prev = (merged.quote as Record<string, unknown> | null | undefined) ?? {};
    const q: Record<string, unknown> = { ...prev };
    const b = body.quote;
    if (typeof b.text === "string" && b.text.trim()) q.text = b.text.trim();
    if (b.speaker !== undefined) q.speaker = typeof b.speaker === "string" && b.speaker.trim() ? b.speaker.trim() : null;
    if (typeof b.is_own === "boolean") q.is_own = b.is_own;
    if (b.context !== undefined) q.context = typeof b.context === "string" && b.context.trim() ? b.context.trim() : null;
    if (b.said_at_relative !== undefined) q.said_at_relative = typeof b.said_at_relative === "string" && b.said_at_relative.trim() ? b.said_at_relative.trim() : null;
    if (b.source !== undefined) q.source = typeof b.source === "string" && b.source.trim() ? b.source.trim() : null;
    if (q.is_own === true) q.speaker = null;
    merged.quote = q;
    if (b.said_by_person_id !== undefined) merged.quote_person_id = q.is_own === true ? null : b.said_by_person_id;
    if (typeof q.text === "string") merged.title = q.text;
  }
  if (body.gift && typeof body.gift === "object") {
    const prev = (merged.gift as Record<string, unknown> | null | undefined) ?? {};
    const g: Record<string, unknown> = { ...prev };
    const b = body.gift;
    const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    if (text(b.title)) g.title = text(b.title);
    if (b.person !== undefined) g.person = text(b.person);
    if (b.reason !== undefined) g.reason = text(b.reason);
    if (b.url !== undefined) g.url = text(b.url);
    if (b.target_price !== undefined) g.target_price = typeof b.target_price === "number" && Number.isFinite(b.target_price) ? b.target_price : null;
    merged.gift = g;
    if (b.for_person_id !== undefined) merged.gift_person_id = typeof b.for_person_id === "string" && b.for_person_id ? b.for_person_id : null;
    if (b.occasion_id !== undefined) merged.gift_occasion_id = typeof b.occasion_id === "string" && b.occasion_id ? b.occasion_id : null;
    if (typeof g.title === "string") merged.title = g.title;
  }
  // MYC-161: a registry form's values become the classification for that
  // kind, and stay on the capture as typed_fields for the next edit.
  const fieldsKind = typeof merged.kind === "string" ? merged.kind : null;
  if (body.fields && typeof body.fields === "object" && isTypedKind(fieldsKind)) {
    const def = getEntityDef(fieldsKind);
    if (def) {
      Object.assign(merged, def.toClassification(body.fields, typeof merged.raw_text === "string" ? merged.raw_text : ""));
      merged.kind = fieldsKind;
      merged.typed = true;
      merged.typed_kind = fieldsKind;
      merged.typed_fields = body.fields;
    }
  }
  if (body.date_inferred === null) {
    delete merged.date_inferred;
  } else if (
    typeof body.date_inferred === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.date_inferred)
  ) {
    merged.date_inferred = body.date_inferred;
  }
  return merged;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: ReviewBody;
  try {
    body = (await req.json()) as ReviewBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "approve" && action !== "reroute" && action !== "discard") {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("raw_captures")
      .select(
        "id, source, raw_text, audio_url, classification, routed_to, routed_id, reviewed_at, discarded_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (fetchErr || !existing) {
      return NextResponse.json(
        { error: fetchErr?.message ?? "not found" },
        { status: 404 },
      );
    }
    if (existing.discarded_at) {
      return NextResponse.json(
        { error: "capture already discarded" },
        { status: 409 },
      );
    }

    if (action === "discard") {
      const { data, error } = await supabase
        .from("raw_captures")
        .update({ discarded_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, discarded_at")
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "discard failed" },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, action: "discard", capture: data });
    }

    // MYC-161: the registry validates a typed form before anything is written,
    // and the person / project it names are what the create needs.
    const typedKind = typeof body.kind === "string" ? body.kind : (existing.classification as Record<string, unknown> | null)?.kind;
    if (body.fields && typeof body.fields === "object" && isTypedKind(typedKind)) {
      const def = getEntityDef(typedKind);
      const errors = def ? def.validate(body.fields) : {};
      if (Object.keys(errors).length) {
        return NextResponse.json({ error: Object.values(errors)[0], errors }, { status: 400 });
      }
      if (typedKind === "person" && !body.person) {
        const patch: Record<string, unknown> = {};
        for (const k of PERSON_PATCH_FIELDS) if (typeof body.fields[k] === "string" && (body.fields[k] as string).trim()) patch[k] = (body.fields[k] as string).trim();
        body.person = { id: String(body.fields.person_id ?? ""), patch };
      }
      if (typedKind === "ticket" && !body.project_id && typeof body.fields.project_id === "string") body.project_id = body.fields.project_id;
      if (typeof body.fields.scheduled_at === "string" && body.fields.scheduled_at && body.scheduled_at === undefined) {
        body.scheduled_at = new Date(body.fields.scheduled_at).toISOString();
      }
    }

    const mergedClassification = mergeClassification(
      existing.classification as Record<string, unknown> | null,
      body,
    );

    if (action === "approve") {
      // Quotes are materialised on approve (spec §4 step 7), not at capture.
      let quoteRoute: { routed_to: string; routed_id: string } | null = null;
      // MYC-161: a typed capture was never materialised; APPROVE is where its
      // row is created, whatever the kind. Runs first so the older branches
      // below see it as done.
      const approvedTypedKind = String(mergedClassification.kind ?? "");
      const typedDef = mergedClassification.typed === true ? getEntityDef(mergedClassification.typed_kind ?? approvedTypedKind) : null;
      const notYetMaterialised = (existing.routed_to ?? "raw_captures") === "raw_captures";
      if (typedDef && typedDef.materialises && notYetMaterialised) {
        try {
          const r = await createRoutedRow(supabase, uid, id, existing.raw_text ?? "", existing.audio_url ?? null, mergedClassification, body.scheduled_at, body.project_id, body.person);
          quoteRoute = { routed_to: r.routedTo, routed_id: r.routedId };
          if (r.routedTo === "tickets") await recordMentions(supabase, mergedClassification, "task", r.routedId, id, existing.raw_text ?? null);
        } catch (err) {
          return NextResponse.json({ error: err instanceof Error ? err.message : "approve failed" }, { status: 400 });
        }
      } else if (mergedClassification.held === true && notYetMaterialised) {
        // An item out of a long dump was held as an idea with the guess
        // attached (research rule 19). Accepting its card is what turns it
        // into the thing the guess says. If the guess needs something the
        // dump did not give (a reminder with no time), it stays an idea
        // and the card is answered.
        try {
          const r = await createRoutedRow(supabase, uid, id, existing.raw_text ?? "", existing.audio_url ?? null, mergedClassification, body.scheduled_at, body.project_id, body.person);
          quoteRoute = { routed_to: r.routedTo, routed_id: r.routedId };
          if (r.routedTo === "tickets") await recordMentions(supabase, mergedClassification, "task", r.routedId, id, existing.raw_text ?? null);
        } catch {
          mergedClassification.suggested_kind = mergedClassification.kind;
          mergedClassification.kind = "idea";
        }
        mergedClassification.held = false;
      } else if (mergedClassification.kind === "gift_idea" && existing.routed_to !== "gifts") {
        // Gifts (spec §4.7): keep the existing idea (this capture is reviewed and points at it) or make the row.
        const dup = body.duplicate;
        if (dup && typeof dup.id === "string" && dup.action === "keep") {
          quoteRoute = { routed_to: "gifts", routed_id: dup.id };
        } else {
          try {
            const r = await createRoutedRow(supabase, uid, id, existing.raw_text ?? "", existing.audio_url ?? null, mergedClassification, body.scheduled_at, body.project_id, body.person);
            quoteRoute = { routed_to: r.routedTo, routed_id: r.routedId };
          } catch (err) {
            return NextResponse.json({ error: err instanceof Error ? err.message : "approve failed" }, { status: 400 });
          }
        }
      } else if (mergedClassification.kind === "quote" && existing.routed_to !== "quotes") {
        const dup = body.duplicate;
        if (dup && typeof dup.id === "string" && (dup.action === "keep" || dup.action === "replace")) {
          if (dup.action === "replace") {
            const ex = extractionFromClassification(mergedClassification);
            const { error: repErr } = await supabase
              .from("quotes")
              .update({ text: ex.text, raw_text: existing.raw_text ?? null, updated_at: new Date().toISOString() })
              .eq("id", dup.id);
            if (repErr) return NextResponse.json({ error: repErr.message }, { status: 500 });
          }
          quoteRoute = { routed_to: "quotes", routed_id: dup.id };
        } else {
          const r = await createRoutedRow(supabase, uid, id, existing.raw_text ?? "", existing.audio_url ?? null, mergedClassification, body.scheduled_at, body.project_id, body.person);
          quoteRoute = { routed_to: r.routedTo, routed_id: r.routedId };
        }
      }
      // Tickets and person updates are materialised on approve too (MYC-153,
      // MYC-154): the card's APPROVE is where the project or the person is
      // chosen, so a kind change to either must act, not just be recorded.
      const approvedKind = String(mergedClassification.kind ?? "");
      const priorApprovedKind = typeof (existing.classification as Record<string, unknown> | null)?.kind === "string"
        ? String((existing.classification as Record<string, unknown>).kind)
        : null;
      if (!quoteRoute && (approvedKind === "ticket" || approvedKind === "person") && approvedKind !== priorApprovedKind) {
        try {
          // Create first, then drop the old row, so a refused ticket (no
          // project) leaves the original task in place.
          const r = await createRoutedRow(supabase, uid, id, existing.raw_text ?? "", existing.audio_url ?? null, mergedClassification, body.scheduled_at, body.project_id, body.person);
          await deleteRoutedRow(supabase, existing.routed_to, existing.routed_id);
          quoteRoute = { routed_to: r.routedTo, routed_id: r.routedId };
        } catch (err) {
          return NextResponse.json({ error: err instanceof Error ? err.message : "approve failed" }, { status: 400 });
        }
      }
      const { data, error } = await supabase
        .from("raw_captures")
        .update({
          classification: mergedClassification,
          reviewed_at: new Date().toISOString(),
          ...(quoteRoute ?? {}),
        })
        .eq("id", id)
        .select(
          "id, classification, routed_to, routed_id, reviewed_at, discarded_at",
        )
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "approve failed" },
          { status: 500 },
        );
      }
      // The card and the ticket are one decision: accepting the card takes
      // the ticket out of the Inbox with its suggestions applied.
      const acceptedTicket = (quoteRoute?.routed_to ?? existing.routed_to) === "tickets" ? (quoteRoute?.routed_id ?? existing.routed_id) : null;
      if (acceptedTicket) await acceptRoutedTicket(supabase, acceptedTicket);
      // MYC-161: the approval is the learning signal.
      await recordApproval(
        supabase,
        id,
        String(mergedClassification.kind ?? "capture"),
        (mergedClassification.typed_fields as Record<string, unknown> | undefined) ?? { title: mergedClassification.title, urgency: mergedClassification.urgency },
      );
      return NextResponse.json({ ok: true, action: "approve", capture: data });
    }

    // action === "reroute"
    const priorKind =
      typeof (existing.classification as Record<string, unknown> | null)?.kind ===
      "string"
        ? String((existing.classification as Record<string, unknown>).kind)
        : null;
    const newKind = String(mergedClassification.kind ?? "capture");
    const kindChanged = priorKind !== newKind;

    if (kindChanged) {
      await deleteRoutedRow(
        supabase,
        existing.routed_to,
        existing.routed_id,
      );
    }

    let routedTo = existing.routed_to ?? "raw_captures";
    let routedId = existing.routed_id ?? id;
    if (kindChanged) {
      const result = await createRoutedRow(
        supabase,
        uid,
        id,
        existing.raw_text ?? "",
        existing.audio_url ?? null,
        mergedClassification,
        body.scheduled_at,
        body.project_id,
        body.person,
      );
      routedTo = result.routedTo;
      routedId = result.routedId;

      const mentionSource: "capture" | "task" | "journal" =
        newKind === "task" || newKind === "ticket"
          ? "task"
          : newKind === "journal"
            ? "journal"
            : "capture";
      const mentionSourceId =
        mentionSource === "capture" ? id : routedId;
      await recordMentions(
        supabase,
        mergedClassification,
        mentionSource,
        mentionSourceId,
        id,
        existing.raw_text ?? null,
      );
    }

    const { data, error } = await supabase
      .from("raw_captures")
      .update({
        classification: mergedClassification,
        routed_to: routedTo,
        routed_id: routedId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        "id, classification, routed_to, routed_id, reviewed_at, discarded_at",
      )
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "reroute failed" },
        { status: 500 },
      );
    }
    await recordApproval(
      supabase,
      id,
      newKind,
      (mergedClassification.typed_fields as Record<string, unknown> | undefined) ?? { title: mergedClassification.title, urgency: mergedClassification.urgency },
    );
    return NextResponse.json({ ok: true, action: "reroute", capture: data });
  } catch (err) {
    console.error("[/api/captures/:id/review PATCH]", err);
    return NextResponse.json({ error: "review failed" }, { status: 500 });
  }
}
