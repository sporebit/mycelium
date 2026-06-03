import { NextRequest, NextResponse } from "next/server";
import { classifyCapture } from "@/lib/router/classifyCapture";
import { writeCapture } from "@/lib/router/writeCapture";
import { embedAndStore } from "@/lib/router/embedAndStore";

export const runtime = "nodejs";

// Auth is handled by middleware (cookie session OR x-api-secret OR CRON_SECRET).
export async function POST(req: NextRequest) {
  let body: { text?: string; client_uuid?: string };
  try {
    body = (await req.json()) as { text?: string; client_uuid?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const userId = process.env.USER_ID;
  if (!userId) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  if (body.client_uuid) {
    const { createServerClient: csc } = await import("@/lib/supabase/server");
    const sb = csc();
    const { data: dup } = await sb
      .from("raw_captures")
      .select("id")
      .eq("client_uuid", body.client_uuid)
      .maybeSingle();
    if (dup?.id) {
      return NextResponse.json({ ok: true, deduplicated: true });
    }
  }

  try {
    const { classification, llm_source } = await classifyCapture(text, userId);
    const result = await writeCapture({
      userId,
      source: "web",
      rawText: text,
      classification,
      llmSource: llm_source,
      clientUuid: body.client_uuid,
    });

    void embedAndStore({
      userId,
      sourceType: result.memorySourceType,
      sourceId: result.memorySourceId,
      text,
    });

    return NextResponse.json({
      ok: true,
      kind: classification.kind,
      urgency: classification.urgency,
      title: classification.title,
      llm_source,
      routed_to: result.routedTo,
      routed_id: result.routedId,
    });
  } catch (err) {
    console.error("[/api/capture] error:", err);
    return NextResponse.json({ error: "capture failed" }, { status: 500 });
  }
}
