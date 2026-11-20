import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_HEADER, PRINCIPAL_SCOPES_HEADER, PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { classifyCapture, type Classification } from "@/lib/router/classifyCapture";
import { writeCapture } from "@/lib/router/writeCapture";
import { embedAndStore } from "@/lib/router/embedAndStore";
import { classificationForTyped, getEntityDef, textForTyped, type FieldValues } from "@/lib/capture/registry";
import { recordPrediction } from "@/lib/capture/learning";
import { correctCapture, processCapture, receiveCapture, replyFiled } from "@/lib/capture/pipeline";
import { sweepCaptures } from "@/lib/capture/sweep";
import { cloudAllowed } from "@/lib/ai/budget";

export const runtime = "nodejs";

type CaptureBody = {
  text?: string;
  client_uuid?: string;
  /** "shortcut" for the iPhone Shortcut; anything else is the web form. */
  source?: string;
  /** The text came from speech turned into words on the device. */
  dictated?: boolean;
  /** The person changed the dictated text by hand before sending. */
  edited?: boolean;
  /**
   * The Shortcut's two-step send. First: the dictated text goes up at once
   * with `await_edit`, so nothing depends on the edit box. Then the box is
   * shown; when it is answered the same `client_uuid` is sent again with
   * `final` (and `edited` + the new text if the words were changed). If the
   * box is dismissed there is no second send, and the first one stands.
   */
  await_edit?: boolean;
  final?: boolean;
  /** MYC-161: the form's chosen type and its fields. Absent = Auto (classify). */
  typed?: { kind?: string; fields?: FieldValues };
};

/** Every answer says in its body whether it worked: an iPhone Shortcut cannot read the status code. */
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, status: "error", error, ...extra }, { status });

/**
 * POST /api/capture — a capture in words.
 *
 * Auto (no `typed`): the capture is stored and the answer goes back at
 * once, 202 `{ ok, status: "saved", capture_id }`. What it is and where it
 * goes is worked out afterwards (lib/capture/pipeline.ts) and, for a
 * capture from the phone, told to the person in a push with a link to fix
 * it. Sending the same `client_uuid` again answers the same way with
 * `deduplicated: true` and stores nothing, so a retry is always safe.
 *
 * Typed (MYC-161): unchanged. The form already says what it is, so there
 * is nothing slow on the request path; the answer carries where it went.
 *
 * Auth is handled by middleware: a session, an API token with the capture
 * scope, or the API secret.
 */
export async function POST(req: NextRequest) {
  let body: CaptureBody;
  try {
    body = (await req.json()) as CaptureBody;
  } catch {
    return fail("bad json", 400);
  }

  // A typed submit: the registry validates the fields and supplies the text
  // when the caller sent none (the primary field, or every filled field).
  const def = body.typed ? getEntityDef(body.typed.kind) : null;
  if (body.typed && !def) return fail("unknown capture type", 400);
  const fields: FieldValues = def && body.typed?.fields && typeof body.typed.fields === "object" ? body.typed.fields : {};
  if (def) {
    const errors = def.validate(fields);
    if (Object.keys(errors).length) return fail(Object.values(errors)[0], 400, { errors });
  }

  const text = (body.text?.trim() || (def ? textForTyped(def.kind, fields) : "")).trim();
  if (!text) return fail("text required", 400);

  // The principal middleware established: a session user, an API token, or
  // API_SECRET acting as Phil. CRON_SECRET names no user and is not a
  // capture path.
  const h = await headers();
  const userId = h.get(PRINCIPAL_USER_HEADER);
  if (!userId) return fail("Unauthorized", 401);
  const fromDevice = h.get(PRINCIPAL_HEADER) === "system" || h.has(PRINCIPAL_SCOPES_HEADER) || body.source === "shortcut";
  const supabase = await createUserClient();

  const existingFor = async (clientUuid: string) => {
    const { data } = await supabase.from("raw_captures").select("id").eq("client_uuid", clientUuid).order("created_at", { ascending: true }).limit(1);
    return ((data ?? [])[0]?.id as string | undefined) ?? null;
  };

  try {
    if (def) {
      if (body.client_uuid) {
        const dup = await existingFor(body.client_uuid);
        if (dup) return NextResponse.json({ ok: true, status: "saved", deduplicated: true, capture_id: dup });
      }
      // Typed (MYC-161): no classifier on the request path. The registry
      // builds the classification; a task/ticket goes to the Tickets Inbox
      // with the fields as `suggested`, everything else waits in the review
      // queue. The classifier still runs afterwards, in the shadow, so the
      // learning row can compare its guess with the choice.
      const classification = classificationForTyped(def.kind, fields, text);
      const isTask = def.kind === "task" || def.kind === "ticket";
      let result;
      try {
        result = await writeCapture({
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
      } catch (err) {
        // Two submits of one form at the same instant: the second finds the first's row.
        const dup = body.client_uuid ? await existingFor(body.client_uuid) : null;
        if (dup) return NextResponse.json({ ok: true, status: "saved", deduplicated: true, capture_id: dup });
        throw err;
      }

      after(async () => {
        try {
          if (await cloudAllowed(supabase)) {
            void embedAndStore({ supabase, sourceType: result.memorySourceType, sourceId: result.memorySourceId, text });
            const shadow = await classifyCapture(text, { supabase, userId, usageTag: "capture.shadow" });
            await recordPrediction(supabase, result.rawCaptureId, shadow.classification as unknown as Record<string, unknown>, shadow.llm_source);
          }
        } catch (err) {
          console.error("[/api/capture] shadow classify soft-fail:", err);
        }
      });

      return NextResponse.json({
        ok: true,
        status: "saved",
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

    const received = await receiveCapture(supabase, {
      text,
      clientUuid: body.client_uuid,
      source: fromDevice ? "api" : "web",
      textSource: body.dictated || body.source === "shortcut" ? "dictation" : "typed",
      // On the second send the stored words are corrected below, not here.
      edited: body.edited === true && body.final !== true,
    });

    after(async () => {
      try {
        // A repeat of a capture already being handled is left alone. One still at "received" is not: when the
        // recording arrived first, these words are what it was waiting for (processCapture claims the row, so a
        // double submit still runs once).
        if (body.final === true && received.duplicate && received.status !== "received") {
          // The edit box was answered. Changed words re-file the capture; unchanged words just get the reply that was held back.
          if (body.edited === true) await correctCapture(supabase, userId, received.id, text);
          else await replyFiled(supabase, userId, received.id);
        } else if (!received.duplicate || received.status === "received") {
          await processCapture(supabase, userId, received.id, { reply: fromDevice && body.await_edit !== true });
        }
        await sweepCaptures(supabase, userId, { limit: 5 });
      } catch (err) {
        console.error("[/api/capture] processing soft-fail:", err);
      }
    });

    return NextResponse.json(
      { ok: true, status: "saved", capture_id: received.id, ...(received.duplicate ? { deduplicated: true } : {}), summary: "Saved" },
      { status: 202 },
    );
  } catch (err) {
    console.error("[/api/capture] error:", err);
    return fail("capture failed", 500);
  }
}
