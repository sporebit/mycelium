import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { classifyCapture, type Classification } from "@/lib/router/classifyCapture";
import { writeCapture } from "@/lib/router/writeCapture";
import { embedAndStore } from "@/lib/router/embedAndStore";
import { classificationForTyped, getEntityDef, textForTyped, type FieldValues } from "@/lib/capture/registry";
import { recordPrediction } from "@/lib/capture/learning";

export const runtime = "nodejs";

type CaptureBody = {
  text?: string;
  client_uuid?: string;
  /** MYC-161: the form's chosen type and its fields. Absent = Auto (classify). */
  typed?: { kind?: string; fields?: FieldValues };
};

// Auth is handled by middleware (cookie session OR x-api-secret OR CRON_SECRET).
export async function POST(req: NextRequest) {
  let body: CaptureBody;
  try {
    body = (await req.json()) as CaptureBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // A typed submit: the registry validates the fields and supplies the text
  // when the caller sent none (the primary field, or every filled field).
  const def = body.typed ? getEntityDef(body.typed.kind) : null;
  if (body.typed && !def) {
    return NextResponse.json({ error: "unknown capture type" }, { status: 400 });
  }
  const fields: FieldValues = def && body.typed?.fields && typeof body.typed.fields === "object" ? body.typed.fields : {};
  if (def) {
    const errors = def.validate(fields);
    if (Object.keys(errors).length) {
      return NextResponse.json({ error: Object.values(errors)[0], errors }, { status: 400 });
    }
  }

  const text = (body.text?.trim() || (def ? textForTyped(def.kind, fields) : "")).trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  // The principal middleware established: a session user, or API_SECRET
  // acting as Phil. Both name a user; CRON_SECRET does not and is not a
  // capture path.
  const userId = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createUserClient();

  if (body.client_uuid) {
    const { data: dup } = await supabase
      .from("raw_captures")
      .select("id")
      .eq("client_uuid", body.client_uuid)
      .maybeSingle();
    if (dup?.id) {
      return NextResponse.json({ ok: true, deduplicated: true });
    }
  }

  try {
    if (def) {
      // Typed (MYC-161): no classifier on the request path. The registry
      // builds the classification; a task/ticket goes to the Tickets Inbox
      // with the fields as `suggested`, everything else waits in the review
      // queue. The classifier still runs afterwards, in the shadow, so the
      // learning row can compare its guess with the choice.
      const classification = classificationForTyped(def.kind, fields, text);
      const isTask = def.kind === "task" || def.kind === "ticket";
      const result = await writeCapture({
        supabase,
        userId,
        source: "web",
        rawText: text,
        classification: classification as unknown as Classification,
        llmSource: "regex",
        clientUuid: body.client_uuid,
        typed: {
          kind: def.kind,
          fields,
          reviewOnly: !isTask,
          projectId: def.kind === "ticket" && typeof classification.project_id === "string" ? classification.project_id : null,
          suggested: (classification.typed_suggested as Record<string, unknown> | undefined) ?? null,
        },
      });

      void embedAndStore({
        supabase,
        sourceType: result.memorySourceType,
        sourceId: result.memorySourceId,
        text,
      });

      after(async () => {
        try {
          const shadow = await classifyCapture(text, { supabase, userId, usageTag: "capture.shadow" });
          await recordPrediction(supabase, result.rawCaptureId, shadow.classification as unknown as Record<string, unknown>, shadow.llm_source);
        } catch (err) {
          console.error("[/api/capture] shadow classify soft-fail:", err);
        }
      });

      return NextResponse.json({
        ok: true,
        typed: true,
        kind: def.kind,
        title: classification.title,
        routed_to: result.routedTo,
        routed_id: result.routedId,
        ticket_key: result.ticketKey ?? null,
        review: isTask ? "tickets_inbox" : "captures",
        capture_id: result.rawCaptureId,
      });
    }

    const { classification, llm_source } = await classifyCapture(text, {
      supabase,
      userId,
    });
    const result = await writeCapture({
      supabase,
      userId,
      source: "web",
      rawText: text,
      classification,
      llmSource: llm_source,
      clientUuid: body.client_uuid,
    });

    void embedAndStore({
      supabase,
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
