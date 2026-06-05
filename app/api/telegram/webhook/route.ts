import { NextRequest, NextResponse } from "next/server";
import {
  answerCallbackQuery,
  downloadFile,
  editMessageText,
  getFile,
  sendMessage,
  type InlineKeyboardButton,
  type InlineKeyboardMarkup,
} from "@/lib/telegram/api";
import { transcribeAudio } from "@/lib/openai/whisper";
import { classifyCapture } from "@/lib/router/classifyCapture";
import { writeCapture } from "@/lib/router/writeCapture";
import { embedAndStore } from "@/lib/router/embedAndStore";
import { createServerClient } from "@/lib/supabase/server";
import { decodeRoute, encodeRoute } from "@/lib/telegram/codes";
import {
  findPendingById,
  findPendingByPrefix,
  resolvePendingByIndex,
  routeRawVoice,
} from "@/lib/fitness/voice-route";
import type { PendingButtonOption } from "@/lib/fitness/types";

export const runtime = "nodejs";

type TgUser = { id: number };
type TgChat = { id: number };
type TgVoice = { file_id: string; mime_type?: string; duration?: number };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  voice?: TgVoice;
};
type TgCallbackQuery = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
};
type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|insufficient_quota|billing|rate.limit/i.test(msg);
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function ok() {
  return NextResponse.json({ ok: true });
}

function buildUrgencyKeyboard(
  rowId: string,
  routedTo: string
): InlineKeyboardMarkup {
  const code = encodeRoute(routedTo);
  const prefix = `u|${code}|${rowId}`;
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: "Today", callback_data: `${prefix}|today` },
        { text: "This Week", callback_data: `${prefix}|this_week` },
      ],
      [
        { text: "This Month", callback_data: `${prefix}|this_month` },
        { text: "Someday", callback_data: `${prefix}|someday` },
      ],
      [{ text: "★ Mark Key", callback_data: `k|${code}|${rowId}` }],
    ],
  };

  // Defensive: Telegram caps callback_data at 64 bytes. Log loud if we ever
  // regress past that — easier than chasing BUTTON_DATA_INVALID after a deploy.
  for (const row of keyboard.inline_keyboard) {
    for (const btn of row) {
      const bytes = Buffer.byteLength(btn.callback_data, "utf8");
      if (bytes > 64) {
        console.error(
          "[telegram] callback_data overflow:",
          bytes,
          "bytes:",
          btn.callback_data
        );
      }
    }
  }

  return keyboard;
}

function slotEmoji(slot: string): string {
  if (slot === "morning") return "🌅";
  if (slot === "afternoon") return "🌙";
  return "➕";
}

function buildPendingKeyboard(
  pendingId: string,
  options: PendingButtonOption[]
): InlineKeyboardMarkup {
  const prefix = pendingId.slice(0, 8);
  const rows: InlineKeyboardButton[][] = [];
  options.forEach((opt, i) => {
    let label: string;
    if (opt.state === "active") {
      label = `▶ Active: ${opt.name ?? opt.slot}`;
    } else if (opt.state === "planned") {
      label = `📋 ${slotEmoji(opt.slot)} ${opt.name ?? opt.slot}`;
    } else {
      label = "➕ New extra session";
    }
    rows.push([{ text: label, callback_data: `pw|${prefix}|${i}` }]);
  });
  const keyboard: InlineKeyboardMarkup = { inline_keyboard: rows };
  for (const row of keyboard.inline_keyboard) {
    for (const btn of row) {
      const bytes = Buffer.byteLength(btn.callback_data, "utf8");
      if (bytes > 64) {
        console.error(
          "[telegram] pw callback_data overflow:",
          bytes,
          btn.callback_data
        );
      }
    }
  }
  return keyboard;
}

async function handlePendingCommand(chatId: number, userId: string): Promise<void> {
  const supabase = createServerClient();
  const { data: rows } = await supabase
    .from("pending_workout_routes")
    .select("id, raw_text, button_options, created_at")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(5);
  const pending = (rows ?? []) as Array<{
    id: string;
    raw_text: string;
    button_options: PendingButtonOption[];
    created_at: string;
  }>;
  if (pending.length === 0) {
    await sendMessage(chatId, "✓ No pending workouts.");
    return;
  }
  await sendMessage(
    chatId,
    `${pending.length} pending workout${pending.length === 1 ? "" : "s"}:`
  );
  for (const p of pending) {
    const age = relativeAge(p.created_at);
    const preview = p.raw_text.slice(0, 120);
    await sendMessage(
      chatId,
      `🕓 ${age}\n"${preview}${p.raw_text.length > 120 ? "…" : ""}"\n\nWhich session?`,
      { reply_markup: buildPendingKeyboard(p.id, p.button_options) }
    );
  }
}

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

async function handleMessage(message: TgMessage): Promise<void> {
  const chatId = message.chat.id;
  const userId = process.env.USER_ID;
  if (!userId) throw new Error("USER_ID missing");

  let rawText: string | undefined;
  let audioUrl: string | null = null;

  if (message.voice) {
    const fileId = message.voice.file_id;
    try {
      const file = await getFile(fileId);
      audioUrl = file.file_path;
      const { buffer, contentType } = await downloadFile(file.file_path);

      async function tryTranscribe(buf: ArrayBuffer, ct: string): Promise<string> {
        return transcribeAudio(buf, `${fileId}.ogg`, message.voice?.mime_type ?? ct ?? "audio/ogg");
      }

      try {
        rawText = await tryTranscribe(buffer, contentType);
      } catch (firstErr) {
        const isQuota = isQuotaError(firstErr);
        if (!isQuota) {
          // Retry once on transient errors
          try {
            rawText = await tryTranscribe(buffer, contentType);
          } catch (retryErr) {
            throw retryErr;
          }
        } else {
          throw firstErr;
        }
      }
    } catch (err) {
      console.error("[telegram] voice transcription failed:", err);

      // Persist the file_id so it can be retried later
      try {
        const supabase = createServerClient();
        await supabase.from("raw_captures").insert({
          user_id: userId,
          source: "telegram",
          raw_text: null,
          audio_url: `tg-file:${fileId}`,
          classification: { kind: "failed_transcription", error: String(err) },
        });
      } catch (persistErr) {
        console.error("[telegram] failed to persist voice file_id:", persistErr);
      }

      const quota = isQuotaError(err);
      if (quota) {
        await sendMessage(chatId, "⚠️ Voice transcription failed — OpenAI quota/billing issue. Voice note saved for retry.");
      } else {
        await sendMessage(chatId, "⚠️ Voice transcription failed (transient error, retried). Voice note saved for retry.");
      }
      return;
    }
  } else if (message.text) {
    rawText = message.text;
  } else {
    await sendMessage(chatId, "unsupported message type");
    return;
  }

  if (!rawText || !rawText.trim()) {
    await sendMessage(chatId, "⚠️ Empty capture.");
    return;
  }

  // /pending command — bypass capture pipeline
  const lowered = rawText.trim().toLowerCase();
  if (lowered === "/pending" || lowered === "pending workouts") {
    await handlePendingCommand(chatId, userId);
    return;
  }

  const { classification, llm_source } = await classifyCapture(rawText, userId);

  // Workout routing — replaces the standard capture pipeline for this kind.
  if (classification.kind === "workout") {
    try {
      const r = await routeRawVoice(rawText, userId);
      if (r.kind === "routed") {
        await sendMessage(chatId, r.result.summary);
        // Also write a raw_captures row for audit/memory continuity
        try {
          await writeCapture({
            userId,
            source: "telegram",
            rawText,
            audioUrl,
            classification,
            llmSource: llm_source,
          });
        } catch (err) {
          console.error("[telegram] workout capture write failed:", err);
        }
        return;
      }
      // Pending: needs disambiguation
      const pending = await findPendingById(userId, r.pending_route_id);
      if (!pending) {
        await sendMessage(chatId, "⚠️ Couldn't stash pending workout — try again.");
        return;
      }
      await sendMessage(chatId, "Multiple sessions match — which one?", {
        reply_markup: buildPendingKeyboard(pending.id, pending.button_options),
      });
      return;
    } catch (err) {
      console.error("[telegram] workout routing failed:", err);
      await sendMessage(chatId, "⚠️ Workout routing failed — check logs.");
      return;
    }
  }

  const result = await writeCapture({
    userId,
    source: "telegram",
    rawText,
    audioUrl,
    classification,
    llmSource: llm_source,
  });

  // Fire-and-forget embedding (don't block reply)
  void embedAndStore({
    userId,
    sourceType: result.memorySourceType,
    sourceId: result.memorySourceId,
    text: rawText,
  });

  // Journal entries are reflective, not actionable — no urgency/key buttons.
  if (classification.kind === "journal") {
    await sendMessage(
      chatId,
      `📓 Journal entry saved — ${classification.title}`
    );
    return;
  }

  // Standalone pain logs land in exercise_pain_logs with session_id=null —
  // no urgency keyboard, just a confirmation that mirrors the iOS Shortcut
  // banner.
  if (classification.kind === "pain_log") {
    const pain = classification.pain;
    const regions = pain?.pain_regions.length
      ? pain.pain_regions.map((r) => r.replace(/_/g, " ")).join(", ")
      : "body";
    const severityPart =
      pain && pain.severity !== null ? ` severity ${pain.severity}/10` : "";
    await sendMessage(
      chatId,
      `🩹 Pain logged — ${regions}${severityPart}`,
    );
    return;
  }

  // Purchases land in their own table, so the urgency keyboard (which
  // targets tasks / raw_captures) doesn't apply. Confirm with a terse
  // line that includes the amount when the classifier extracted one.
  if (classification.kind === "purchase") {
    const p = classification.purchase;
    const amountPart =
      p && p.amount !== null
        ? ` · ${currencySymbol(p.currency)}${p.amount}`
        : "";
    await sendMessage(
      chatId,
      `🛍 Purchase logged — ${classification.title}${amountPart} · ${classification.urgency}`,
    );
    return;
  }

  const label = classification.kind.toUpperCase();
  const reply = `✓ Captured as ${label} — ${classification.urgency}: ${classification.title}`;
  await sendMessage(chatId, reply, {
    reply_markup: buildUrgencyKeyboard(result.routedId, result.routedTo),
  });
}

function currencySymbol(code: string | null | undefined): string {
  if (code === "USD") return "$";
  if (code === "EUR") return "€";
  return "£";
}

async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  const data = cb.data ?? "";
  const userId = process.env.USER_ID;
  if (!userId) throw new Error("USER_ID missing");

  // Pending-workout resolution: pw|<8 char prefix>|<index>
  if (data.startsWith("pw|")) {
    const parts = data.split("|");
    const prefix = parts[1] ?? "";
    const idx = Number(parts[2] ?? "");
    if (!prefix || !Number.isInteger(idx)) {
      await answerCallbackQuery(cb.id, "Invalid action");
      return;
    }
    const pending = await findPendingByPrefix(userId, prefix);
    if (!pending) {
      await answerCallbackQuery(cb.id, "Pending expired or not found");
      return;
    }
    try {
      const result = await resolvePendingByIndex(pending.id, userId, idx);
      if (!result) {
        await answerCallbackQuery(cb.id, "Could not resolve");
        return;
      }
      await answerCallbackQuery(cb.id, "✓ Routed");
      if (cb.message) {
        try {
          await editMessageText(
            cb.message.chat.id,
            cb.message.message_id,
            result.summary
          );
        } catch (err) {
          console.error("[telegram] edit after pw resolve failed:", err);
        }
      }
    } catch (err) {
      console.error("[telegram] pw resolve failed:", err);
      await answerCallbackQuery(cb.id, "Resolve failed");
    }
    return;
  }

  const parts = data.split("|");
  const action = parts[0];
  const routedTo = decodeRoute(parts[1] ?? "");
  const rowId = parts[2];

  if (!routedTo || !rowId || (routedTo !== "tasks" && routedTo !== "raw_captures")) {
    await answerCallbackQuery(cb.id, "Invalid action");
    return;
  }

  const supabase = createServerClient();
  let updateMsg = "Updated";

  if (action === "u") {
    const urgency = parts[3];
    const allowed = ["today", "this_week", "this_month", "someday"];
    if (!allowed.includes(urgency)) {
      await answerCallbackQuery(cb.id, "Invalid urgency");
      return;
    }
    if (routedTo === "tasks") {
      await supabase
        .from("tasks")
        .update({ urgency, updated_at: new Date().toISOString() })
        .eq("id", rowId)
        .eq("user_id", userId);
    } else {
      // For non-task captures, store override inside classification jsonb
      const { data: row } = await supabase
        .from("raw_captures")
        .select("classification")
        .eq("id", rowId)
        .eq("user_id", userId)
        .maybeSingle();
      const merged = { ...(row?.classification ?? {}), urgency };
      await supabase
        .from("raw_captures")
        .update({ classification: merged })
        .eq("id", rowId)
        .eq("user_id", userId);
    }
    updateMsg = `Urgency → ${urgency}`;
  } else if (action === "k") {
    if (routedTo === "tasks") {
      await supabase
        .from("tasks")
        .update({ key: true, updated_at: new Date().toISOString() })
        .eq("id", rowId)
        .eq("user_id", userId);
    } else {
      const { data: row } = await supabase
        .from("raw_captures")
        .select("classification")
        .eq("id", rowId)
        .eq("user_id", userId)
        .maybeSingle();
      const merged = { ...(row?.classification ?? {}), key: true };
      await supabase
        .from("raw_captures")
        .update({ classification: merged })
        .eq("id", rowId)
        .eq("user_id", userId);
    }
    updateMsg = "Marked key ★";
  } else {
    await answerCallbackQuery(cb.id, "Unknown action");
    return;
  }

  await supabase.from("audit_log").insert({
    user_id: userId,
    action: "capture_override",
    resource_type: routedTo === "tasks" ? "task" : "raw_capture",
    resource_id: rowId,
    metadata: { action, data },
  });

  await answerCallbackQuery(cb.id, `✓ ${updateMsg}`);

  // Update the message to reflect the new state (keep the keyboard)
  if (cb.message) {
    const newText = `${cb.message.text ?? ""}\n— ${updateMsg}`;
    try {
      await editMessageText(cb.message.chat.id, cb.message.message_id, newText, {
        reply_markup: buildUrgencyKeyboard(rowId, routedTo),
      });
    } catch (err) {
      console.error("[telegram] editMessageText failed:", err);
    }
  }
}

export async function POST(req: NextRequest) {
  // 1. Webhook secret header check
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret || secretHeader !== expectedSecret) {
    return unauthorized();
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // 2. Sender ID check
  const allowedUserId = process.env.TELEGRAM_USER_ID;
  if (!allowedUserId) return unauthorized();

  const fromId =
    update.message?.from?.id ?? update.callback_query?.from?.id ?? null;
  if (fromId === null || String(fromId) !== String(allowedUserId)) {
    return unauthorized();
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error("[telegram webhook] handler error:", err);
    // Still 200 so Telegram doesn't retry endlessly
    if (update.message?.chat.id) {
      try {
        await sendMessage(update.message.chat.id, "⚠️ Capture failed — check logs.");
      } catch {
        /* ignore */
      }
    }
  }

  return ok();
}
