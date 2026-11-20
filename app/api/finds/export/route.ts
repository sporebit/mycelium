import { NextRequest, NextResponse } from "next/server";
import { exportMarkdown, listFinds } from "@/lib/finds/store";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid } from "@/lib/tickets/server";

export const runtime = "nodejs";

/** GET /api/finds/export?days=7 — the week as Markdown in the shape of claude/design-resources.md. */
export async function GET(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const asked = Number(req.nextUrl.searchParams.get("days") ?? 7);
  const days = Number.isFinite(asked) ? Math.min(90, Math.max(1, Math.round(asked))) : 7;
  const now = new Date();
  try {
    const rows = await listFinds(await createUserClient(), { now, days });
    return new NextResponse(exportMarkdown(rows, { now, days }), {
      headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="finds-${now.toISOString().slice(0, 10)}.md"` },
    });
  } catch (err) {
    console.error("[/api/finds/export GET]", err);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
