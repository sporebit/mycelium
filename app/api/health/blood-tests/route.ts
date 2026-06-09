import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ResultRow = {
  id: string;
  marker_key: string;
  value_raw: string;
  value_numeric: number | null;
  value_prefix: string | null;
  ref_min: number | null;
  ref_max: number | null;
  ref_direction: string;
  unit: string;
  blood_test_markers: { display_name: string; panel: string; sort_order: number };
};

type SessionRow = {
  id: string;
  sampled_at: string;
  provider: string;
  notes: string | null;
  created_at: string;
  blood_test_results: ResultRow[];
};

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("blood_test_sessions")
      .select(
        `id, sampled_at, provider, notes, created_at,
         blood_test_results (
           id, marker_key, value_raw, value_numeric, value_prefix,
           ref_min, ref_max, ref_direction, unit,
           blood_test_markers ( display_name, panel, sort_order )
         )`
      )
      .order("sampled_at", { ascending: false });

    if (error) {
      console.error("[/api/health/blood-tests] GET", error);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }

    const sessions = (data as unknown as SessionRow[]).map((s) => ({
      id: s.id,
      sampled_at: s.sampled_at,
      provider: s.provider,
      notes: s.notes,
      created_at: s.created_at,
      results: s.blood_test_results
        .map((r) => ({
          id: r.id,
          marker_key: r.marker_key,
          display_name: r.blood_test_markers.display_name,
          panel: r.blood_test_markers.panel,
          sort_order: r.blood_test_markers.sort_order,
          value_raw: r.value_raw,
          value_numeric: r.value_numeric,
          value_prefix: r.value_prefix,
          ref_min: r.ref_min,
          ref_max: r.ref_max,
          ref_direction: r.ref_direction,
          unit: r.unit,
        }))
        .sort((a, b) => a.sort_order - b.sort_order),
    }));

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[/api/health/blood-tests] GET", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type PostBody = {
  sampled_at: string;
  provider?: string;
  notes?: string;
  results: {
    marker_key: string;
    value_raw: string;
    value_numeric?: number | null;
    value_prefix?: string | null;
    ref_min?: number | null;
    ref_max?: number | null;
    ref_direction?: string;
    unit: string;
  }[];
};

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (!body.sampled_at || !Array.isArray(body.results) || body.results.length === 0) {
    return NextResponse.json({ error: "sampled_at and results required" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    const { data: session, error: sessErr } = await supabase
      .from("blood_test_sessions")
      .insert({
        sampled_at: body.sampled_at,
        provider: body.provider ?? "Thriva",
        notes: body.notes ?? null,
      })
      .select("id")
      .single();

    if (sessErr || !session?.id) {
      console.error("[/api/health/blood-tests] POST session", sessErr);
      return NextResponse.json({ error: "session insert failed" }, { status: 500 });
    }

    const rows = body.results.map((r) => ({
      session_id: session.id,
      marker_key: r.marker_key,
      value_raw: r.value_raw,
      value_numeric: r.value_numeric ?? null,
      value_prefix: r.value_prefix ?? null,
      ref_min: r.ref_min ?? null,
      ref_max: r.ref_max ?? null,
      ref_direction: r.ref_direction ?? "between",
      unit: r.unit,
    }));

    const { error: resErr } = await supabase
      .from("blood_test_results")
      .insert(rows);

    if (resErr) {
      console.error("[/api/health/blood-tests] POST results", resErr);
      return NextResponse.json({ error: "results insert failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session_id: session.id });
  } catch (err) {
    console.error("[/api/health/blood-tests] POST", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
