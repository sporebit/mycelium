import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  CONVERTIBLE_KINDS,
  KIND_LABELS,
  kindTable,
  shareRawCapturesTable,
  type ConvertibleKind,
} from "@/lib/convert/kinds";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type ConvertBody = {
  from_kind?: ConvertibleKind;
  from_id?: string;
  to_kind?: ConvertibleKind;
  field_overrides?: Record<string, unknown>;
};

/**
 * Build a "source view" of the original record — a flat bag of fields
 * the target builder can pluck from. Every kind exposes at least
 * { title, tags, description } so cross-kind conversions always have
 * something to migrate.
 */
function projectSource(
  kind: ConvertibleKind,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    title: null,
    description: null,
    tags: row.tags ?? null,
    entity_id: row.entity_id ?? null,
    project_id: row.project_id ?? null,
    context_where: row.context_where ?? null,
    context_device: row.context_device ?? null,
    context_energy: row.context_energy ?? null,
    context_tag: row.context_tag ?? null,
  };
  if (kind === "task") {
    out.title = row.title;
    out.description = row.description;
    out.urgency = row.urgency;
    out.due_date = row.due_date;
    out.owner = row.owner;
  } else if (kind === "purchase") {
    out.title = row.title;
    out.urgency = row.urgency;
    out.amount = row.amount;
    out.currency = row.currency;
    out.want_or_need = row.want_or_need;
    out.list_type = row.list_type;
  } else if (kind === "journal") {
    out.title = (row.summary as string | null) ?? null;
    out.description = row.raw_text;
    out.entry_date = row.entry_date;
    out.mood = row.mood;
  } else if (kind === "pain_log") {
    out.title = row.exercise_name ?? "Pain log";
    out.description = row.notes;
    out.severity = row.severity;
    out.feel_rating = row.feel_rating;
    out.pain_regions = row.pain_regions;
  } else if (
    kind === "decision" ||
    kind === "note" ||
    kind === "capture"
  ) {
    // raw_captures — pull title/description from classification jsonb if present.
    const cls = (row.classification ?? {}) as Record<string, unknown>;
    out.title =
      (cls.title as string | null) ??
      ((row.raw_text as string | null) ?? "").slice(0, 80) ??
      null;
    out.description = row.raw_text;
    out.entity_id = (cls.resolved_entity_id as string | null) ?? null;
    out.tags = (cls.tags as string[] | null) ?? null;
    out.urgency = cls.urgency ?? null;
  }
  return out;
}

/** Build the INSERT payload for the target kind from the source view. */
function buildTargetPayload(
  toKind: ConvertibleKind,
  source: Record<string, unknown>,
  userIdValue: string,
  fromKind: ConvertibleKind,
  fromId: string,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const lineage = {
    from_kind: fromKind,
    from_id: fromId,
    at: new Date().toISOString(),
  };
  const baseTitle =
    (overrides.title as string | undefined) ??
    (source.title as string | null) ??
    "Untitled";

  if (toKind === "task") {
    return {
      user_id: userIdValue,
      title: baseTitle,
      description:
        (overrides.description as string | null | undefined) ??
        (source.description as string | null) ??
        null,
      urgency:
        (overrides.urgency as string | null | undefined) ??
        (source.urgency as string | null) ??
        "today",
      status: "new",
      key: false,
      priority_score: 0.5,
      tags: (overrides.tags as string[] | null | undefined) ?? source.tags ?? null,
      due_date: (overrides.due_date as string | null | undefined) ?? source.due_date ?? null,
      owner: userIdValue,
      entity_id: (overrides.entity_id as string | null | undefined) ?? source.entity_id ?? null,
      project_id: (overrides.project_id as string | null | undefined) ?? source.project_id ?? null,
      context_where: source.context_where ?? null,
      context_device: source.context_device ?? null,
      context_energy: source.context_energy ?? null,
      context_tag: source.context_tag ?? null,
      converted_from: lineage,
    };
  }
  if (toKind === "purchase") {
    return {
      user_id: userIdValue,
      title: baseTitle,
      amount: (overrides.amount as number | null | undefined) ?? source.amount ?? null,
      currency: (overrides.currency as string | undefined) ?? source.currency ?? "GBP",
      want_or_need: (overrides.want_or_need as string | null | undefined) ?? source.want_or_need ?? "unclear",
      urgency: (overrides.urgency as string | undefined) ?? source.urgency ?? "someday",
      list_type: (overrides.list_type as string | undefined) ?? source.list_type ?? "shopping",
      project_id: source.project_id ?? null,
      context_where: source.context_where ?? null,
      context_device: source.context_device ?? null,
      context_energy: source.context_energy ?? null,
      context_tag: source.context_tag ?? null,
      converted_from: lineage,
    };
  }
  if (toKind === "journal") {
    return {
      user_id: userIdValue,
      entry_date:
        (overrides.entry_date as string | undefined) ??
        (source.entry_date as string | undefined) ??
        new Date().toISOString().slice(0, 10),
      raw_text:
        (overrides.description as string | undefined) ??
        (source.description as string | undefined) ??
        baseTitle,
      summary: baseTitle.slice(0, 40),
      tags: (overrides.tags as string[] | null | undefined) ?? source.tags ?? null,
      mood: source.mood ?? null,
      context_where: source.context_where ?? null,
      context_device: source.context_device ?? null,
      context_energy: source.context_energy ?? null,
      context_tag: source.context_tag ?? null,
      converted_from: lineage,
    };
  }
  if (toKind === "pain_log") {
    return {
      user_id: userIdValue,
      session_id: null,
      session_exercise_id: null,
      exercise_name: "standalone",
      severity:
        (overrides.severity as number | undefined) ??
        (source.severity as number | undefined) ??
        0,
      feel_rating: source.feel_rating ?? null,
      pain_regions: (source.pain_regions as string[] | null) ?? [],
      notes:
        (overrides.description as string | undefined) ??
        (source.description as string | undefined) ??
        baseTitle,
      logged_at: new Date().toISOString(),
      converted_from: lineage,
    };
  }
  // decision / note / capture share raw_captures — encode kind in classification
  return {
    user_id: userIdValue,
    source: "api",
    raw_text:
      (overrides.description as string | undefined) ??
      (source.description as string | undefined) ??
      baseTitle,
    classification: {
      kind: toKind,
      title: baseTitle,
      urgency: source.urgency ?? "someday",
      tags: source.tags ?? [],
      summary: baseTitle.slice(0, 140),
    },
    llm_source: "regex",
    context_where: source.context_where ?? null,
    context_device: source.context_device ?? null,
    context_energy: source.context_energy ?? null,
    context_tag: source.context_tag ?? null,
    converted_from: lineage,
  };
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  let body: ConvertBody;
  try {
    body = (await req.json()) as ConvertBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const fromKind = body.from_kind;
  const toKind = body.to_kind;
  const fromId = body.from_id;
  const overrides = body.field_overrides ?? {};
  if (
    !fromKind ||
    !toKind ||
    !fromId ||
    !CONVERTIBLE_KINDS.includes(fromKind) ||
    !CONVERTIBLE_KINDS.includes(toKind)
  ) {
    return NextResponse.json(
      { error: "from_kind, to_kind, from_id required" },
      { status: 400 },
    );
  }
  if (fromKind === toKind) {
    return NextResponse.json(
      { error: "source and target kind are identical" },
      { status: 400 },
    );
  }

  try {
    const supabase = createServerClient();
    const sourceTable = kindTable(fromKind);

    // Load source row
    const { data: sourceRow, error: srcErr } = await supabase
      .from(sourceTable)
      .select("*")
      .eq("id", fromId)
      .eq("user_id", uid)
      .maybeSingle();
    if (srcErr || !sourceRow) {
      return NextResponse.json(
        { error: `source ${KIND_LABELS[fromKind]} not found` },
        { status: 404 },
      );
    }
    if ((sourceRow as Record<string, unknown>).deleted_at) {
      return NextResponse.json(
        { error: "source already deleted" },
        { status: 400 },
      );
    }
    // If the source lives in raw_captures, additionally check the kind
    // recorded in classification matches the from_kind hint.
    if (shareRawCapturesTable(fromKind)) {
      const cls = (sourceRow as Record<string, unknown>).classification as
        | Record<string, unknown>
        | null;
      const recordedKind = cls?.kind as string | undefined;
      if (recordedKind && recordedKind !== fromKind) {
        return NextResponse.json(
          { error: `source is recorded as ${recordedKind}, not ${fromKind}` },
          { status: 400 },
        );
      }
    }

    // Build target payload
    const projected = projectSource(
      fromKind,
      sourceRow as Record<string, unknown>,
    );
    const targetTable = kindTable(toKind);
    const insertPayload = buildTargetPayload(
      toKind,
      projected,
      uid,
      fromKind,
      fromId,
      overrides,
    );

    // Insert new
    const { data: created, error: insErr } = await supabase
      .from(targetTable)
      .insert(insertPayload)
      .select("id")
      .single();
    if (insErr || !created) {
      console.error("[/api/convert insert]", insErr);
      return NextResponse.json(
        { error: insErr?.message ?? "insert failed" },
        { status: 500 },
      );
    }

    // Soft-delete source
    const { error: delErr } = await supabase
      .from(sourceTable)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", fromId)
      .eq("user_id", uid);
    if (delErr) {
      console.error("[/api/convert soft-delete]", delErr);
    }

    return NextResponse.json({
      new_id: (created as { id: string }).id,
      new_kind: toKind,
      new_table: targetTable,
    });
  } catch (err) {
    console.error("[/api/convert POST]", err);
    return NextResponse.json({ error: "convert failed" }, { status: 500 });
  }
}
