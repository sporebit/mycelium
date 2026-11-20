/**
 * Turning a capture into the thing it is: a ticket, a purchase, a reminder,
 * a quote, a line in the Day log, an update to a person.
 *
 * One implementation, used by the review route (approve and re-route) and
 * by the capture pipeline (lib/capture/pipeline.ts). Moved here unchanged
 * from app/api/captures/[id]/review/route.ts on 2026-11-20 so the two cannot
 * drift: before that, the automatic path had its own copy in
 * lib/router/writeCapture.ts with no reminder branch, which is why "remind
 * me to…" never became a reminder.
 */
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayLondon, whenFromUrgency } from "@/lib/tickets/when";
import { resolveEntityId } from "@/lib/router/resolveEntity";
import { queuePendingPerson, recordMention, resolveMention } from "@/lib/people/resolve-mention";
import { ignoredTermKeys } from "@/lib/people/ignored";
import { aliasKey } from "@/lib/people/normalise";
import { createQuoteFromExtraction, extractionFromClassification } from "@/lib/quotes/server";
import { researchQuote } from "@/lib/quotes/research";
import { appendCapture } from "@/lib/daylog/engine";
import { technicalProjectIds } from "@/lib/tickets/area";
import { moveTicket } from "@/lib/tickets/server";
import { rruleFromRecurrence } from "@/lib/tickets/reminderShape";
import { reminderDueIso } from "@/lib/capture/reminderDue";
import { applyPersonPatch } from "@/lib/people/contacts";

/** Person fields a capture may set (MYC-154); names and needs_review stay with the People drawer. */
export const PERSON_PATCH_FIELDS = ["birthday", "address", "phone", "email", "relationship", "where_we_met", "mutual_interests", "notes"] as const;

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

export function inferPurchaseCategory(title: string): string | null {
  const t = title.toLowerCase();
  for (const [keywords, cat] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => t.includes(k))) return cat;
  }
  return null;
}


/** Remove whatever row this capture is currently routed to (if any). */
export async function deleteRoutedRow(
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
export async function createRoutedRow(
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
    const { data: current, error: readErr } = await supabase.from("people").select("id, notes").eq("id", person.id).is("deleted_at", null).maybeSingle();
    if (readErr || !current) throw new Error("person not found");
    if (typeof patch.notes === "string") {
      // Notes accumulate — a capture adds a dated line rather than replacing what is there.
      const line = `${new Date().toISOString().slice(0, 10)}: ${patch.notes}`;
      patch.notes = current.notes ? `${current.notes}\n${line}` : line;
    }
    if (Object.keys(patch).length === 0) throw new Error("nothing to update on the person");
    // phone / email land in person_phones / person_emails (0140); the rest on the row
    const updated = await applyPersonPatch(supabase, person.id, patch);
    if (!updated) throw new Error("people update failed");
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
    // "tomorrow at 9", "at 8pm", "in 30 minutes", "Friday at 3": the classifier's own terms, not only an ISO date
    if (!dueIso) dueIso = reminderDueIso(r);
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

export async function recordMentions(
  supabase: SupabaseClient,
  classification: Record<string, unknown>,
  sourceType: "capture" | "task" | "journal",
  sourceId: string,
  captureId: string,
  snippet: string | null,
): Promise<void> {
  const mentions = classification.mentions;
  if (!Array.isArray(mentions)) return;
  const ignored = await ignoredTermKeys(supabase);
  for (const m of mentions as Array<Record<string, unknown>>) {
    const hint =
      (typeof m?.name_hint === "string" && m.name_hint.trim()) ||
      (typeof m?.raw === "string" && m.raw.trim()) ||
      "";
    if (!hint || ignored.has(aliasKey(hint))) continue;
    try {
      const res = await resolveMention(supabase, hint);
      await recordMention(supabase, res, {
        type: sourceType,
        id: sourceId,
      });
      // An unknown name goes to the review queue, never straight to People (people-review R1).
      await queuePendingPerson(supabase, res, { captureId, sourceKind: String(classification.kind ?? sourceType), snippet, ticketId: sourceType === "task" ? sourceId : null });
    } catch (err) {
      console.error("[review reroute] mention soft-fail:", err);
    }
  }
}

