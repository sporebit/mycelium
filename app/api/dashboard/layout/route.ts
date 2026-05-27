import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  CARD_REGISTRY,
  defaultLayout,
  reconcileLayout,
  type CardLayoutRow,
  type CardWidth,
} from "@/lib/dashboard/card-registry";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("dashboard_layouts")
      .select("card_key, position, width, hidden")
      .eq("user_id", uid);
    const stored = (data ?? []) as CardLayoutRow[];
    const layout = stored.length === 0
      ? defaultLayout()
      : reconcileLayout(stored);
    return NextResponse.json({ layout });
  } catch (err) {
    console.error("[/api/dashboard/layout GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type PostBody = { layout?: CardLayoutRow[] };

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const layout = Array.isArray(body.layout) ? body.layout : null;
  if (!layout) {
    return NextResponse.json({ error: "layout required" }, { status: 400 });
  }

  // Validate each row against the registry
  const seenKeys = new Set<string>();
  const seenPositions = new Set<number>();
  for (const r of layout) {
    if (typeof r.card_key !== "string" || !CARD_REGISTRY[r.card_key]) {
      return NextResponse.json(
        { error: `unknown card_key: ${r.card_key}` },
        { status: 400 }
      );
    }
    if (seenKeys.has(r.card_key)) {
      return NextResponse.json(
        { error: `duplicate card_key: ${r.card_key}` },
        { status: 400 }
      );
    }
    seenKeys.add(r.card_key);
    const cfg = CARD_REGISTRY[r.card_key];
    if (!(cfg.supports as number[]).includes(r.width as CardWidth)) {
      return NextResponse.json(
        {
          error: `width ${r.width} not supported by ${r.card_key}`,
        },
        { status: 400 }
      );
    }
    if (typeof r.position !== "number" || seenPositions.has(r.position)) {
      return NextResponse.json(
        { error: `invalid or duplicate position: ${r.position}` },
        { status: 400 }
      );
    }
    seenPositions.add(r.position);
  }

  try {
    const supabase = createServerClient();
    const rows = layout.map((r) => ({
      user_id: uid,
      card_key: r.card_key,
      position: r.position,
      width: r.width,
      hidden: !!r.hidden,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("dashboard_layouts")
      .upsert(rows, { onConflict: "user_id,card_key" });
    if (error) {
      console.error("[/api/dashboard/layout POST]", error);
      return NextResponse.json({ error: "save failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/dashboard/layout POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
