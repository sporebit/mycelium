import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { isStepsDefinition, normaliseState, type StepsDefinition } from "@/lib/tickets/steps";
import { principalUid, resolveTicketRef } from "@/lib/tickets/server";
import { guideFilename, renderGuideHtml } from "@/lib/guides/html";

export const runtime = "nodejs";

/**
 * GET /api/tickets/[key]/guide.html: the downloadable Field guide (design §4).
 * A self-contained, read-only HTML file with the current ticks and answers;
 * no scripts, no external fonts. Session or API_SECRET (the middleware
 * gate); 404 when the caller cannot see the ticket or it has no guide.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = await createUserClient();
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data, error } = await supabase
      .from("tickets")
      .select("ticket_key, title, steps_definition, steps_state")
      .eq("id", ref.id)
      .single();
    if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
    const def = data.steps_definition as StepsDefinition | null;
    if (!def || !isStepsDefinition(def)) return NextResponse.json({ error: "no guide on this ticket" }, { status: 404 });
    const liveKey = (data.ticket_key as string | null) ?? key;
    const body = renderGuideHtml(def, normaliseState(data.steps_state), { key: liveKey, title: data.title as string, now: new Date() });
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `attachment; filename="${guideFilename(liveKey, def)}"`,
        "cache-control": "private, no-store",
        // Belt and braces: the file has no script, and says so to any browser that opens it from here.
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[/api/tickets/:key/guide.html GET]", err);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}
