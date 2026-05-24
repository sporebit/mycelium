import { NextRequest, NextResponse } from "next/server";
import { classifyCapture } from "@/lib/router/classifyCapture";
import { writeCapture } from "@/lib/router/writeCapture";
import { embedAndStore } from "@/lib/router/embedAndStore";

export const runtime = "nodejs";

// Auth is handled by middleware (cookie session OR x-api-secret OR CRON_SECRET).
export async function POST(req: NextRequest) {
  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
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

  try {
    const { classification, llm_source } = await classifyCapture(text);
    const result = await writeCapture({
      userId,
      source: "web",
      rawText: text,
      classification,
      llmSource: llm_source,
    });

    void embedAndStore({
      userId,
      sourceType: "capture",
      sourceId: result.rawCaptureId,
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
