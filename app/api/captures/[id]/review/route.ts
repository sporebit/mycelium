import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/user";
import { resolveEntityId } from "@/lib/router/resolveEntity";
import { recordMention, resolveMention } from "@/lib/people/resolve-mention";
import { localDateKey } from "@/lib/util/date";
import { createQuoteFromExtraction, extractionFromClassification } from "@/lib/quotes/server";
import { researchQuote } from "@/lib/quotes/research";

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
};

const ALLOWED_KINDS = new Set([
  "task",
  "note",
  "decision",
  "journal",
  "capture",
  "workout",
  "purchase",
  "media",
  "quote",
]);
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
): Promise<{ routedTo: string; routedId: string }> {
  const kind = String(classification.kind ?? "capture");
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

  if (kind === "task") {
    const { data, error } = await supabase
      .from("tickets")
      .insert({ title,
        description: summary,
        urgency,
        key: keyFlag,
        priority_score: 0.5,
        tags: tags.length ? tags : null,
        entity_id: entityId,
        owner: userId,
        scheduled_at: scheduledAt ?? null,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`tickets insert failed: ${error?.message ?? "no row"}`);
    }
    return { routedTo: "tickets", routedId: data.id };
  }

  if (kind === "journal") {
    const mood =
      typeof classification.mood === "string" ? classification.mood : null;
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({ entry_date: localDateKey(),
        raw_text: rawText,
        audio_url: audioUrl,
        summary: summary ? summary.slice(0, 40) : null,
        tags: tags.length ? tags : null,
        mood,
        raw_capture_id: rawCaptureId,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(
        `journal_entries insert failed: ${error?.message ?? "no row"}`,
      );
    }
    return { routedTo: "journal_entries", routedId: data.id };
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
    const { data, error } = await supabase
      .from("media_items")
      .insert({ title,
        creator,
        media_type: mediaType,
        media_status: "backlog",
        tags: tags.length ? tags : null,
        raw_capture_id: rawCaptureId,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`media_items insert failed: ${error?.message ?? "no row"}`);
    }
    return { routedTo: "media_items", routedId: data.id };
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

    const mergedClassification = mergeClassification(
      existing.classification as Record<string, unknown> | null,
      body,
    );

    if (action === "approve") {
      // Quotes are materialised on approve (spec §4 step 7), not at capture.
      let quoteRoute: { routed_to: string; routed_id: string } | null = null;
      if (mergedClassification.kind === "quote" && existing.routed_to !== "quotes") {
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
          const r = await createRoutedRow(supabase, uid, id, existing.raw_text ?? "", existing.audio_url ?? null, mergedClassification, body.scheduled_at);
          quoteRoute = { routed_to: r.routedTo, routed_id: r.routedId };
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
      );
      routedTo = result.routedTo;
      routedId = result.routedId;

      const mentionSource: "capture" | "task" | "journal" =
        newKind === "task"
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
    return NextResponse.json({ ok: true, action: "reroute", capture: data });
  } catch (err) {
    console.error("[/api/captures/:id/review PATCH]", err);
    return NextResponse.json({ error: "review failed" }, { status: 500 });
  }
}
