import type { SupabaseClient } from "@supabase/supabase-js";
import type { Classification } from "@/lib/router/classifyCapture";
import { resolveEntityId } from "@/lib/router/resolveEntity";
import { recordMention, resolveMention } from "@/lib/people/resolve-mention";
import { localDateKey } from "@/lib/util/date";
import { suggestContexts } from "@/lib/tickets/suggest";

export type WriteCaptureInput = {
  /** Auth uid of the capturing user — written as the task owner. */
  userId: string;
  /** Client to write with: `await createUserClient()` on the request
   *  path, or the client withUser() handed a caller with no session
   *  (Telegram webhook, crons). */
  supabase: SupabaseClient;
  source: "telegram" | "web" | "api";
  rawText: string;
  audioUrl?: string | null;
  classification: Classification;
  llmSource: "anthropic" | "openai" | "regex";
  clientUuid?: string;
};

export type WriteCaptureResult = {
  rawCaptureId: string;
  routedTo: string;
  routedId: string;
  /** Set when the capture became a ticket (spec §8.1: the reply carries the key). */
  ticketKey?: string | null;
  ticketSuggested?: Record<string, unknown> | null;
  // Source identifiers the caller should use for the memory embedding —
  // journal entries embed as 'journal' so the Stroma tab can filter cleanly.
  memorySourceType: "capture" | "journal";
  memorySourceId: string;
};

export async function writeCapture(
  input: WriteCaptureInput
): Promise<WriteCaptureResult> {
  const supabase = input.supabase;
  const { userId, source, rawText, audioUrl, classification, llmSource } =
    input;

  const entityId = await resolveEntityId(
    supabase,
    classification.entity_name
  );

  // Pre-pull context fields so every insert path can use them.
  const ctx = {
    context_where: classification.context_where ?? null,
    context_device: classification.context_device ?? null,
    context_energy: classification.context_energy ?? null,
    context_tag: classification.context_tag ?? null,
  };

  // a. INSERT into raw_captures (always — audit / memory continuity)
  const captureRow: Record<string, unknown> = { source,
    raw_text: rawText,
    audio_url: audioUrl ?? null,
    classification: { ...classification, resolved_entity_id: entityId },
    llm_source: llmSource,
    ...ctx,
  };
  if (input.clientUuid) captureRow.client_uuid = input.clientUuid;

  const { data: rawCapture, error: rawErr } = await supabase
    .from("raw_captures")
    .insert(captureRow)
    .select("id")
    .single();

  if (rawErr || !rawCapture) {
    throw new Error(
      `raw_captures insert failed: ${rawErr?.message ?? "unknown"}`
    );
  }

  // b. INSERT into routed table based on kind
  let routedTo: string;
  let routedId: string;
  let ticketKey: string | null = null;
  let ticketSuggested: Record<string, unknown> | null = null;
  let memorySourceType: "capture" | "journal" = "capture";
  let memorySourceId: string = rawCapture.id;

  if (classification.kind === "task") {
    // Tickets spec §8.1: a capture lands in Inbox (0117 default) with
    // Claude's guesses in `suggested` for the Clarify card to accept or
    // adjust. Cheap heuristic here; the classifier's context fields win.
    const { data: projectRows } = await supabase.from("projects").select("id, name, prefix").neq("status", "archived");
    const heuristic = suggestContexts(
      classification.title,
      classification.summary,
      (projectRows ?? []) as Array<{ id: string; name: string; prefix?: string | null }>,
    );
    const suggested: Record<string, unknown> = { ...heuristic };
    delete suggested.reasons;
    if (ctx.context_where === "home" || ctx.context_where === "out") suggested.where_ctx = ctx.context_where;
    if (ctx.context_device === "pc" || ctx.context_device === "phone") suggested.tools = [ctx.context_device];
    if (heuristic.reasons.length) suggested.reasons = heuristic.reasons;

    const { data: task, error: taskErr } = await supabase
      .from("tickets")
      .insert({ title: classification.title,
        description: classification.summary,
        urgency: classification.urgency,
        key: classification.key,
        priority_score: 0.5,
        tags: classification.tags,
        entity_id: entityId,
        owner: userId,
        source: source === "telegram" ? "telegram" : source === "api" ? "shortcut" : "ui",
        suggested,
        ...ctx,
      })
      .select("id, ticket_key")
      .single();

    if (taskErr || !task) {
      throw new Error(`tickets insert failed: ${taskErr?.message ?? "unknown"}`);
    }
    routedTo = "tickets";
    routedId = task.id;
    ticketKey = (task as { ticket_key?: string | null }).ticket_key ?? null;
    ticketSuggested = suggested;
  } else if (classification.kind === "purchase") {
    // Purchase fields are populated by the classifier in the same pass —
    // see PurchaseDetails in lib/router/classifyCapture.ts. Missing object
    // falls back to safe defaults so a permissive LLM response can't
    // break the insert.
    const purchase = classification.purchase ?? {
      amount: null,
      currency: "GBP",
      want_or_need: "unclear" as const,
      list_type: "shopping" as const,
    };
    const { data: row, error: purErr } = await supabase
      .from("purchases")
      .insert({ title: classification.title,
        amount: purchase.amount,
        currency: purchase.currency,
        want_or_need: purchase.want_or_need,
        urgency: classification.urgency,
        list_type: purchase.list_type,
        raw_capture_id: rawCapture.id,
        ...ctx,
      })
      .select("id")
      .single();
    if (purErr || !row) {
      throw new Error(
        `purchases insert failed: ${purErr?.message ?? "unknown"}`,
      );
    }
    routedTo = "purchases";
    routedId = row.id;
  } else if (classification.kind === "pain_log") {
    // Standalone pain capture — session_id is NULL because there's no
    // workout backing it. exercise_name is the sentinel 'standalone'
    // so list views can filter session-bound logs out of the "general
    // pain history" view.
    const pain = classification.pain ?? {
      pain_regions: [],
      severity: null,
      feel_rating: null,
    };
    const { data: row, error: painErr } = await supabase
      .from("exercise_pain_logs")
      .insert({ session_id: null,
        session_exercise_id: null,
        exercise_name: "standalone",
        severity: typeof pain.severity === "number" ? pain.severity : 0,
        feel_rating: pain.feel_rating,
        pain_regions: pain.pain_regions,
        notes: rawText.trim() || null,
        logged_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (painErr || !row) {
      throw new Error(
        `pain_logs insert failed: ${painErr?.message ?? "unknown"}`,
      );
    }
    routedTo = "exercise_pain_logs";
    routedId = row.id;
  } else if (classification.kind === "media") {
    const media = classification.media ?? { media_type: "watch" as const, creator: null };
    const { data: mediaRow, error: mediaErr } = await supabase
      .from("media_items")
      .insert({ title: classification.title,
        creator: media.creator,
        media_type: media.media_type,
        media_status: "backlog",
        raw_capture_id: rawCapture.id,
        tags: classification.tags.length > 0 ? classification.tags : null,
      })
      .select("id")
      .single();
    if (mediaErr || !mediaRow) {
      throw new Error(
        `media_items insert failed: ${mediaErr?.message ?? "unknown"}`,
      );
    }
    routedTo = "media_items";
    routedId = mediaRow.id;
  } else if (classification.kind === "account") {
    const acct = classification.account ?? {
      cost_amount: null,
      cost_period: null,
      status: "active" as const,
    };
    const { data: acctRow, error: acctErr } = await supabase
      .from("accounts")
      .insert({
        name: classification.title,
        status: acct.status,
        cost_amount: acct.cost_amount,
        cost_currency: "GBP",
        cost_period: acct.cost_period,
        notes: rawText.trim() || null,
      })
      .select("id")
      .single();
    if (acctErr || !acctRow) {
      throw new Error(
        `accounts insert failed: ${acctErr?.message ?? "unknown"}`,
      );
    }
    routedTo = "accounts";
    routedId = acctRow.id;
  } else if (classification.kind === "journal") {
    const summary = classification.summary
      ? classification.summary.slice(0, 40)
      : null;
    const { data: entry, error: journalErr } = await supabase
      .from("journal_entries")
      .insert({ entry_date: localDateKey(),
        raw_text: rawText,
        audio_url: audioUrl ?? null,
        summary,
        tags: classification.tags.length > 0 ? classification.tags : null,
        mood: classification.mood,
        raw_capture_id: rawCapture.id,
        ...ctx,
      })
      .select("id")
      .single();

    if (journalErr || !entry) {
      throw new Error(
        `journal_entries insert failed: ${journalErr?.message ?? "unknown"}`
      );
    }
    routedTo = "journal_entries";
    routedId = entry.id;
    memorySourceType = "journal";
    memorySourceId = entry.id;
  } else {
    // decision / note / capture stay in raw_captures only
    routedTo = "raw_captures";
    routedId = rawCapture.id;
  }

  // c. UPDATE raw_captures with routing pointer
  const { error: updateErr } = await supabase
    .from("raw_captures")
    .update({ routed_to: routedTo, routed_id: routedId })
    .eq("id", rawCapture.id);

  if (updateErr) {
    console.error("[writeCapture] route update failed:", updateErr);
  }

  // d. INSERT into audit_log
  const { error: auditErr } = await supabase.from("audit_log").insert({ action: "capture",
    resource_type: "raw_capture",
    resource_id: rawCapture.id,
    metadata: {
      source,
      kind: classification.kind,
      urgency: classification.urgency,
      mood: classification.mood,
      llm_source: llmSource,
      routed_to: routedTo,
      routed_id: routedId,
    },
  });

  if (auditErr) {
    console.error("[writeCapture] audit_log insert failed:", auditErr);
  }

  // e. People mentions — resolve and record each. Soft failure mode: any
  //    error here is logged inside recordMention and doesn't block the write.
  if (classification.mentions && classification.mentions.length > 0) {
    // Tasks and journal entries get task/journal source_type; everything
    // else (decision/note/capture/workout) gets capture source_type with
    // the raw_capture id.
    let mentionSourceType: "capture" | "task" | "journal" = "capture";
    let mentionSourceId = rawCapture.id;
    if (classification.kind === "task") {
      mentionSourceType = "task";
      mentionSourceId = routedId;
    } else if (classification.kind === "journal") {
      mentionSourceType = "journal";
      mentionSourceId = routedId;
    }

    // For voice/Telegram captures, check whether new-person mentions
    // should be diverted to /organisation/review rather than silently
    // auto-created. UI-created captures (source = 'web' / 'api') skip
    // this — those are explicit by definition.
    const isVoiceLike = source === "telegram";
    let deferIfNew = false;
    if (isVoiceLike) {
      const { data: rule } = await supabase
        .from("entity_review_rules")
        .select("review_new")
        .eq("entity_type", "person")
        .maybeSingle();
      deferIfNew = rule?.review_new === true;
    }

    for (const m of classification.mentions) {
      try {
        const res = await resolveMention(
          supabase,
          m.name_hint || m.raw,
          { deferIfNew },
        );
        await recordMention(supabase, res, {
          type: mentionSourceType,
          id: mentionSourceId,
        });
        // When the mention was deferred (would have auto-created a
        // brand-new person), queue a pending_entities row so the user
        // can resolve it on /organisation/review.
        if (
          deferIfNew &&
          !res.person_id &&
          res.confidence === "unresolved" &&
          !res.auto_created
        ) {
          await supabase.from("pending_entities").insert({ capture_id: rawCapture.id,
            entity_type: "person",
            entity_name: res.raw_alias,
            additional_data: { source_kind: classification.kind },
          });
        }
      } catch (err) {
        console.error("[writeCapture] mention pipeline soft-fail:", err);
      }
    }
  }

  return {
    rawCaptureId: rawCapture.id,
    routedTo,
    routedId,
    memorySourceType,
    memorySourceId,
    ticketKey,
    ticketSuggested,
  };
}
