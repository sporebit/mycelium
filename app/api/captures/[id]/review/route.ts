import { todayLondon, whenFromUrgency } from "@/lib/tickets/when";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/user";
import { resolveEntityId } from "@/lib/router/resolveEntity";
import { recordMention, resolveMention } from "@/lib/people/resolve-mention";
import { createQuoteFromExtraction, extractionFromClassification } from "@/lib/quotes/server";
import { researchQuote } from "@/lib/quotes/research";
import { appendCapture } from "@/lib/daylog/engine";
import { technicalProjectIds } from "@/lib/tickets/surface";
import { moveTicket } from "@/lib/tickets/server";
import { rruleFromRecurrence } from "@/lib/tickets/reminderShape";
import { getEntityDef, isTypedKind, londonToUtcIso, type FieldValues } from "@/lib/capture/registry";
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
  /** MYC-161: the registry form's values for `kind` — validated and mapped by the registry. */
  fields?: FieldValues;
};

const ALLOWED_KINDS = new Set([
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
]);
/** Person fields a capture may set (MYC-154); names and needs_review stay with the People drawer. */
const PERSON_PATCH_FIELDS = ["birthday", "address", "phone", "email", "relationship", "where_we_met", "mutual_interests", "notes"] as const;
const ALLOWED_URGENCIES = new Set([
  "today",
  "this_week",
  "this_month",
  "someday",
]);

const CATEGORY_KEYWORDS: [string[], string][] = [
  [["milk", "eggs", "bread", "chicken", "vegetable", "fruit", "cheese", "butter", "rice", "pasta", "flour", "sugar", "cereal"], "groceries"],
  [["phone", "laptop", "tablet", "headphone", "keyboard", "mouse", "monitor", "cable", "charger", "speaker", "camera"], "electronics"],
  [["shirt", "shoes", "jacket", "jeans", "trainer", "socks", "coat", "hoodie", "hat", "gloves"], "clothing"],
  [["furniture", "rug", "lamp", "shelf", "desk", "chair", "curtain", "pillow", "bedding", "towel", "cleaning"], "home"],
  [["supplement", "vitamin", "medication", "prescription", "medicine", "toothpaste", "shampoo"], "health"],
  [["gym", "weights", "dumbbell", "protein", "creatine", "resistance band", "yoga mat"], "fitness"],
  [["subscription", "netflix", "spotify", "membership", "renewal"], "subscriptions"],
  [["game", "movie", "concert", "ticket", "book", "album"], "entertainment"],
  [["fuel", "petrol", "diesel", "car", "bus", "train", "uber", "taxi", "parking", "mot", "tyre"], "transport"],
  [["restaurant", "takeaway", "coffee shop", "nandos"], "dining"],
  [["gift", "present", "birthday", "christmas"], "gifts"],
];

function inferPurchaseCategory(title: string): string | null {
  const t = title.toLowerCase();
  for (const [keywords, cat] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => t.includes(k))) return cat;
  }
  return null;
}

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

/** Remove whatever row this capture is currently routed to (if any). */
async function deleteRoutedRow(
  supabase: SupabaseClient,
  routedTo: string | null,
  routedId: string | null,
): Promise<void> {
  if (!routedTo || !routedId) return;
  // raw_captures is its own routing target for "decision"/"note"/"capture";
  // we never delete the audit row itself.
  if (routedTo === "raw_captures") return;
  // a day-log day is append-only and shared by every capture that day
  if (routedTo === "daylog_days") return;
  // a person row was updated by the capture, not created by it
  if (routedTo === "people") return;
  const table = routedTo;
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", routedId);
  if (error) {
    console.error(
      `[review reroute] delete from ${table} ${routedId} failed:`,
      error,
    );
  }
}

/** Create the appropriate downstream row for the corrected classification.
 *  Returns the new (routed_to, routed_id) tuple — defaults to the raw
 *  capture itself when the kind is one we don't materialise. */
async function createRoutedRow(
  supabase: SupabaseClient,
  userId: string,
  rawCaptureId: string,
  rawText: string,
  audioUrl: string | null,
  classification: Record<string, unknown>,
  scheduledAt?: string | null,
  projectId?: string | null,
  person?: { id: string; patch: Record<string, unknown> } | null,
): Promise<{ routedTo: string; routedId: string }> {
  const kind = String(classification.kind ?? "capture");

  if (kind === "person") {
    if (!person?.id) {
      const pu = classification.person_update as { id?: string; patch?: Record<string, unknown> } | undefined;
      if (pu?.id) person = { id: pu.id, patch: pu.patch ?? {} };
    }
    if (!person?.id) throw new Error("a person update needs a person");
    const patch: Record<string, unknown> = {};
    for (const k of PERSON_PATCH_FIELDS) {
      const v = person.patch?.[k];
      if (typeof v === "string" && v.trim()) patch[k] = v.trim();
    }
    if (typeof patch.birthday === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(patch.birthday)) throw new Error("birthday must be YYYY-MM-DD");
    const { data: current, error: readErr } = await supabase.from("people").select("id, notes").eq("id", person.id).maybeSingle();
    if (readErr || !current) throw new Error("person not found");
    if (typeof patch.notes === "string") {
      // Notes accumulate — a capture adds a dated line rather than replacing what is there.
      const line = `${new Date().toISOString().slice(0, 10)}: ${patch.notes}`;
      patch.notes = current.notes ? `${current.notes}\n${line}` : line;
    }
    if (Object.keys(patch).length === 0) throw new Error("nothing to update on the person");
    const { error } = await supabase.from("people").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", person.id);
    if (error) throw new Error(`people update failed: ${error.message}`);
    return { routedTo: "people", routedId: person.id };
  }
  const title = String(classification.title ?? "Capture");
  const summary =
    typeof classification.summary === "string" ? classification.summary : null;
  const urgency =
    typeof classification.urgency === "string"
      ? classification.urgency
      : "someday";
  const tagsRaw = classification.tags;
  const tags: string[] = Array.isArray(tagsRaw)
    ? (tagsRaw as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const keyFlag = classification.key === true;
  const entityName =
    typeof classification.entity_name === "string"
      ? classification.entity_name
      : null;
  const entityId = await resolveEntityId(supabase, entityName);

  if (kind === "task" || kind === "ticket") {
    // A ticket is a task in a technical project (the Tickets surface, 0121);
    // the key trigger gives it the project's prefix (0135).
    let project_id: string | null = null;
    if (kind === "ticket") {
      if (!projectId) throw new Error("a ticket needs a project");
      const technical = await technicalProjectIds(supabase);
      if (!technical.includes(projectId)) throw new Error("project is not a Tickets project");
      project_id = projectId;
    }
    const { data, error } = await supabase
      .from("tickets")
      .insert({ title,
        description: summary,
        // the label becomes a When at the insert (tickets spec §18); `urgency` is no longer written
        ...whenFromUrgency(urgency, todayLondon()),
        key: keyFlag,
        priority_score: 0.5,
        tags: tags.length ? tags : null,
        entity_id: entityId,
        owner: userId,
        scheduled_at: scheduledAt ?? null,
        project_id,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`tickets insert failed: ${error?.message ?? "no row"}`);
    }
    return { routedTo: "tickets", routedId: data.id };
  }

  if (kind === "journal") {
    // Day log (0127): appended to today's transcript; never a journal_entries row.
    const day = await appendCapture(supabase, rawText, { audioUrl });
    return { routedTo: "daylog_days", routedId: day.id };
  }

  if (kind === "purchase") {
    const purchaseRaw =
      (classification.purchase as Record<string, unknown> | undefined) ?? {};
    const amount =
      typeof purchaseRaw.amount === "number" &&
      Number.isFinite(purchaseRaw.amount)
        ? (purchaseRaw.amount as number)
        : null;
    const currency =
      typeof purchaseRaw.currency === "string" && purchaseRaw.currency.trim()
        ? purchaseRaw.currency.trim().toUpperCase()
        : "GBP";
    const wonRaw = purchaseRaw.want_or_need;
    const wantOrNeed =
      wonRaw === "want" || wonRaw === "need" || wonRaw === "unclear"
        ? wonRaw
        : "unclear";
    const ltRaw = purchaseRaw.list_type;
    const listType = ltRaw === "wishlist" ? "wishlist" : "shopping";
    const VALID_CATS = [
      "groceries", "electronics", "clothing", "home", "health",
      "fitness", "subscriptions", "entertainment", "transport",
      "dining", "gifts", "other",
    ];
    const catRaw = purchaseRaw.category;
    const category =
      typeof catRaw === "string" && VALID_CATS.includes(catRaw)
        ? catRaw
        : inferPurchaseCategory(title);
    const { data, error } = await supabase
      .from("purchases")
      .insert({ title,
        amount,
        currency,
        want_or_need: wantOrNeed,
        urgency,
        list_type: listType,
        category,
        raw_capture_id: rawCaptureId,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(
        `purchases insert failed: ${error?.message ?? "no row"}`,
      );
    }
    return { routedTo: "purchases", routedId: data.id };
  }

  if (kind === "media") {
    const mediaObj = (classification.media as Record<string, unknown> | undefined) ?? {};
    const mediaType =
      mediaObj.media_type === "watch" || mediaObj.media_type === "listen" || mediaObj.media_type === "read"
        ? mediaObj.media_type
        : "watch";
    const creator =
      typeof mediaObj.creator === "string" && mediaObj.creator.trim()
        ? mediaObj.creator.trim()
        : null;
    const mediaExtra = (classification.media_extra as Record<string, unknown> | undefined) ?? {};
    const { data, error } = await supabase
      .from("media_items")
      .insert({ title,
        creator,
        media_type: mediaType,
        media_status: typeof mediaExtra.media_status === "string" ? mediaExtra.media_status : "backlog",
        tags: tags.length ? tags : null,
        url: typeof mediaExtra.url === "string" ? mediaExtra.url : null,
        notes: typeof mediaExtra.notes === "string" ? mediaExtra.notes : null,
        raw_capture_id: rawCaptureId,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`media_items insert failed: ${error?.message ?? "no row"}`);
    }
    return { routedTo: "media_items", routedId: data.id };
  }

  if (kind === "reminder") {
    // A reminder is a ticket of kind reminder (0125): the typed form or the
    // classifier gives a London date + time; the row goes straight to Next.
    const r = (classification.reminder as Record<string, unknown> | undefined) ?? {};
    let dueIso = typeof classification.due_at === "string" && !Number.isNaN(Date.parse(classification.due_at)) ? new Date(classification.due_at).toISOString() : null;
    if (!dueIso && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      dueIso = londonToUtcIso(r.date, typeof r.time === "string" && /^\d{2}:\d{2}$/.test(r.time) ? r.time : "09:00");
    }
    if (!dueIso) throw new Error("a reminder needs a date and time");
    const message = (typeof r.reminder_message === "string" && r.reminder_message.trim()) || title;
    const due = new Date(dueIso);
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        title: message,
        kind: "reminder",
        remind_at: due.toISOString(),
        scheduled_on: due.toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
        recurrence_rrule: rruleFromRecurrence(typeof r.recurrence === "string" ? r.recurrence : null),
        recurrence_mode: null,
        source: "ui",
        owner: userId,
        urgency: "this_week",
        priority_score: 0.5,
        meta: { legacy_recurrence: typeof r.recurrence === "string" && r.recurrence ? r.recurrence : null, capture_id: rawCaptureId },
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`reminder insert failed: ${error?.message ?? "no row"}`);
    await moveTicket(supabase, data.id, "next");
    return { routedTo: "tickets", routedId: data.id };
  }

  if (kind === "pain_log") {
    // Standalone pain log (no session), the same row writeCapture makes on the auto path.
    const pain = (classification.pain as Record<string, unknown> | undefined) ?? {};
    const regions = Array.isArray(pain.pain_regions) ? (pain.pain_regions as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const severity = typeof pain.severity === "number" ? pain.severity : 0;
    const feel = typeof pain.feel_rating === "string" ? pain.feel_rating : null;
    const { data, error } = await supabase
      .from("exercise_pain_logs")
      .insert({
        session_id: null,
        session_exercise_id: null,
        exercise_name: "standalone",
        severity,
        feel_rating: feel,
        pain_regions: regions,
        notes: (summary ?? rawText).trim() || null,
        logged_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`pain log insert failed: ${error?.message ?? "no row"}`);
    return { routedTo: "exercise_pain_logs", routedId: data.id };
  }

  if (kind === "account") {
    const acct = (classification.account as Record<string, unknown> | undefined) ?? {};
    const extra = (classification.account_extra as Record<string, unknown> | undefined) ?? {};
    const { data, error } = await supabase
      .from("accounts")
      .insert({
        name: title,
        status: typeof acct.status === "string" ? acct.status : "active",
        cost_amount: typeof acct.cost_amount === "number" ? acct.cost_amount : null,
        cost_currency: typeof extra.cost_currency === "string" ? extra.cost_currency : "GBP",
        cost_period: typeof acct.cost_period === "string" ? acct.cost_period : null,
        category: typeof extra.category === "string" ? extra.category : "Other",
        email: typeof extra.email === "string" ? extra.email : null,
        url: typeof extra.url === "string" ? extra.url : null,
        renewal_date: typeof extra.renewal_date === "string" ? extra.renewal_date : null,
        payment_method: typeof extra.payment_method === "string" ? extra.payment_method : null,
        opened_date: typeof extra.opened_date === "string" ? extra.opened_date : null,
        notes: typeof extra.notes === "string" ? extra.notes : rawText.trim() || null,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`accounts insert failed: ${error?.message ?? "no row"}`);
    return { routedTo: "accounts", routedId: data.id };
  }

  if (kind === "quote") {
    const ex = extractionFromClassification(classification);
    if (!ex.text) throw new Error("quote text required");
    const pid = typeof classification.quote_person_id === "string" ? classification.quote_person_id : undefined;
    const row = await createQuoteFromExtraction(supabase, ex, { raw_text: rawText, capture_id: rawCaptureId, said_by_person_id: pid });
    if (row.research_status === "pending") after(() => researchQuote(supabase, row.id).catch((e) => console.error("[quotes research]", e)));
    return { routedTo: "quotes", routedId: row.id };
  }

  // decision / note / capture / workout / other — leave in raw_captures.
  return { routedTo: "raw_captures", routedId: rawCaptureId };
}

async function recordMentions(
  supabase: SupabaseClient,
  classification: Record<string, unknown>,
  sourceType: "capture" | "task" | "journal",
  sourceId: string,
): Promise<void> {
  const mentions = classification.mentions;
  if (!Array.isArray(mentions)) return;
  for (const m of mentions as Array<Record<string, unknown>>) {
    const hint =
      (typeof m?.name_hint === "string" && m.name_hint.trim()) ||
      (typeof m?.raw === "string" && m.raw.trim()) ||
      "";
    if (!hint) continue;
    try {
      const res = await resolveMention(supabase, hint);
      await recordMention(supabase, res, {
        type: sourceType,
        id: sourceId,
      });
    } catch (err) {
      console.error("[review reroute] mention soft-fail:", err);
    }
  }
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
          if (r.routedTo === "tickets") await recordMentions(supabase, mergedClassification, "task", r.routedId);
        } catch (err) {
          return NextResponse.json({ error: err instanceof Error ? err.message : "approve failed" }, { status: 400 });
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
