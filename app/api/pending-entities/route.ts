import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";

export const runtime = "nodejs";

const PENDING_SELECT =
  "id, capture_id, entity_type, entity_name, additional_data, resolved_at, resolved_action, resolved_entity_id, created_at, space_id";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const includeResolved = url.searchParams.get("resolved") === "true";
  try {
    const supabase = await createUserClient();
    let q = supabase
      .from("pending_entities")
      .select(PENDING_SELECT)
      .order("created_at", { ascending: false });
    if (!includeResolved) q = q.is("resolved_at", null);
    const dayId = url.searchParams.get("day_id");
    if (dayId) q = q.eq("additional_data->>day_id", dayId);
    const { data: pending, error } = await q;
    if (error) throw error;
    auditListRead(req, pending, "organisation", "captures");

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
