import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { resolveEntityId } from "@/lib/router/resolveEntity";
import { recordMention, resolveMention } from "@/lib/people/resolve-mention";
import { localDateKey } from "@/lib/util/date";

export const runtime = "nodejs";

type Supabase = ReturnType<typeof createServerClient>;

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
};

const ALLOWED_KINDS = new Set([
  "task",
  "note",
  "decision",
  "journal",
  "capture",
  "workout",
  "purchase",
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
  supabase: Supabase,
  userId: string,
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
    .eq("id", routedId)
    .eq("user_id", userId);
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
  supabase: Supabase,
  userId: string,
  rawCaptureId: string,
  rawText: string,
  audioUrl: string | null,
  classification: Record<string, unknown>,
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
  const entityId = await resolveEntityId(supabase, userId, entityName);

  if (kind === "task") {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        title,
        description: summary,
        urgency,
        key: keyFlag,
        priority_score: 0.5,
        tags: tags.length ? tags : null,
        entity_id: entityId,
        owner: userId,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`tasks insert failed: ${error?.message ?? "no row"}`);
    }
    return { routedTo: "tasks", routedId: data.id };
  }

  if (kind === "journal") {
    const mood =
      typeof classification.mood === "string" ? classification.mood : null;
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        entry_date: localDateKey(),
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
    const { data, error } = await supabase
      .from("purchases")
      .insert({
        user_id: userId,
        title,
        amount,
        currency,
        want_or_need: wantOrNeed,
        urgency,
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

  // decision / note / capture / workout / other — leave in raw_captures.
  return { routedTo: "raw_captures", routedId: rawCaptureId };
}

async function recordMentions(
  supabase: Supabase,
  userId: string,
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
      const res = await resolveMention(supabase, userId, hint);
      await recordMention(supabase, userId, res, {
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
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
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
    const supabase = createServerClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("raw_captures")
      .select(
        "id, user_id, source, raw_text, audio_url, classification, routed_to, routed_id, reviewed_at, discarded_at",
      )
      .eq("id", id)
      .eq("user_id", uid)
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
        .eq("user_id", uid)
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
      const { data, error } = await supabase
        .from("raw_captures")
        .update({
          classification: mergedClassification,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", uid)
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
        uid,
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
        uid,
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
      .eq("user_id", uid)
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
