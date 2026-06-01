import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

const PENDING_SELECT =
  "id, user_id, capture_id, entity_type, entity_name, additional_data, resolved_at, resolved_action, resolved_entity_id, created_at";

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const url = new URL(req.url);
  const includeResolved = url.searchParams.get("resolved") === "true";
  try {
    const supabase = createServerClient();
    let q = supabase
      .from("pending_entities")
      .select(PENDING_SELECT)
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (!includeResolved) q = q.is("resolved_at", null);
    const { data: pending, error } = await q;
    if (error) throw error;

    // Fetch source captures so the UI can show the original wording.
    const captureIds = Array.from(
      new Set(
        (pending ?? [])
          .map((p) => (p as { capture_id: string | null }).capture_id)
          .filter((id): id is string => !!id),
      ),
    );
    const captureById = new Map<
      string,
      { id: string; raw_text: string | null; source: string; created_at: string }
    >();
    if (captureIds.length > 0) {
      const { data: caps } = await supabase
        .from("raw_captures")
        .select("id, raw_text, source, created_at")
        .in("id", captureIds);
      for (const c of (caps ?? []) as Array<{
        id: string;
        raw_text: string | null;
        source: string;
        created_at: string;
      }>) {
        captureById.set(c.id, c);
      }
    }

    return NextResponse.json({
      pending: (pending ?? []).map((p) => {
        const r = p as { capture_id: string | null };
        return {
          ...p,
          capture:
            r.capture_id && captureById.has(r.capture_id)
              ? captureById.get(r.capture_id)
              : null,
        };
      }),
    });
  } catch (err) {
    console.error("[/api/pending-entities GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
