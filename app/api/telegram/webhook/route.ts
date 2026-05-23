import { NextRequest, NextResponse } from "next/server";
import {
  answerCallbackQuery,
  downloadFile,
  editMessageText,
  getFile,
  sendMessage,
  type InlineKeyboardMarkup,
} from "@/lib/telegram/api";
import { transcribeAudio } from "@/lib/openai/whisper";
import { classifyCapture } from "@/lib/router/classifyCapture";
import { writeCapture } from "@/lib/router/writeCapture";
import { embedAndStore } from "@/lib/router/embedAndStore";
import { createServerClient } from "@/lib/supabase/server";

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

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function ok() {
  return NextResponse.json({ ok: true });
}

function buildUrgencyKeyboard(rowId: string, routedTo: string): InlineKeyboardMarkup {
  const prefix = `u|${routedTo}|${rowId}`;
  return {
    inline_keyboard: [
      [
        { text: "Today", callback_data: `${prefix}|today` },
        { text: "This Week", callback_data: `${prefix}|this_week` },
      ],
      [
        { text: "This Month", callback_data: `${prefix}|this_month` },
        { text: "Someday", callback_data: `${prefix}|someday` },
      ],
      [{ text: "★ Mark Key", callback_data: `k|${routedTo}|${rowId}` }],
    ],
  };
}

async function handleMessage(message: TgMessage): Promise<void> {
  const chatId = message.chat.id;
  const userId = process.env.USER_ID;
  if (!userId) throw new Error("USER_ID missing");

  let rawText: string | undefined;
  let audioUrl: string | null = null;

  if (message.voice) {
    try {
      const file = await getFile(message.voice.file_id);
      audioUrl = file.file_path;
      const { buffer, contentType } = await downloadFile(file.file_path);
      rawText = await transcribeAudio(
        buffer,
        `${message.voice.file_id}.ogg`,
        message.voice.mime_type ?? contentType ?? "audio/ogg"
      );
    } catch (err) {
      console.error("[telegram] voice handling failed:", err);
      await sendMessage(chatId, "⚠️ Couldn't transcribe that voice note.");
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

  const { classification, llm_source } = await classifyCapture(rawText);

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
    sourceType: "capture",
    sourceId: result.rawCaptureId,
    text: rawText,
  });

  const label = classification.kind.toUpperCase();
  const reply = `✓ Captured as ${label} — ${classification.urgency}: ${classification.title}`;
  await sendMessage(chatId, reply, {
    reply_markup: buildUrgencyKeyboard(result.routedId, result.routedTo),
  });
}

async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  const data = cb.data ?? "";
  const userId = process.env.USER_ID;
  if (!userId) throw new Error("USER_ID missing");

  const parts = data.split("|");
  const action = parts[0];
  const routedTo = parts[1];
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
