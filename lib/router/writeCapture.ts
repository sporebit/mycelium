import { createServerClient } from "@/lib/supabase/server";
import type { Classification } from "@/lib/router/classifyCapture";
import { resolveEntityId } from "@/lib/router/resolveEntity";
import { localDateKey } from "@/lib/util/date";

export type WriteCaptureInput = {
  userId: string;
  source: "telegram" | "web" | "api";
  rawText: string;
  audioUrl?: string | null;
  classification: Classification;
  llmSource: "anthropic" | "openai" | "regex";
};

export type WriteCaptureResult = {
  rawCaptureId: string;
  routedTo: string;
  routedId: string;
  // Source identifiers the caller should use for the memory embedding —
  // journal entries embed as 'journal' so the Brain tab can filter cleanly.
  memorySourceType: "capture" | "journal";
  memorySourceId: string;
};

export async function writeCapture(
  input: WriteCaptureInput
): Promise<WriteCaptureResult> {
  const supabase = createServerClient();
  const { userId, source, rawText, audioUrl, classification, llmSource } =
    input;

  const entityId = await resolveEntityId(
    supabase,
    userId,
    classification.entity_name
  );

  // a. INSERT into raw_captures (always — audit / memory continuity)
  const { data: rawCapture, error: rawErr } = await supabase
    .from("raw_captures")
    .insert({
      user_id: userId,
      source,
      raw_text: rawText,
      audio_url: audioUrl ?? null,
      classification: { ...classification, resolved_entity_id: entityId },
      llm_source: llmSource,
    })
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
  let memorySourceType: "capture" | "journal" = "capture";
  let memorySourceId: string = rawCapture.id;

  if (classification.kind === "task") {
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        title: classification.title,
        description: classification.summary,
        urgency: classification.urgency,
        key: classification.key,
        priority_score: 0.5,
        tags: classification.tags,
        entity_id: entityId,
        owner: userId,
      })
      .select("id")
      .single();

    if (taskErr || !task) {
      throw new Error(`tasks insert failed: ${taskErr?.message ?? "unknown"}`);
    }
    routedTo = "tasks";
    routedId = task.id;
  } else if (classification.kind === "journal") {
    const summary = classification.summary
      ? classification.summary.slice(0, 40)
      : null;
    const { data: entry, error: journalErr } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        entry_date: localDateKey(),
        raw_text: rawText,
        audio_url: audioUrl ?? null,
        summary,
        tags: classification.tags.length > 0 ? classification.tags : null,
        mood: classification.mood,
        raw_capture_id: rawCapture.id,
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
  const { error: auditErr } = await supabase.from("audit_log").insert({
    user_id: userId,
    action: "capture",
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

  return {
    rawCaptureId: rawCapture.id,
    routedTo,
    routedId,
    memorySourceType,
    memorySourceId,
  };
}
