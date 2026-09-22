/**
 * Day log ↔ Telegram (spec §4.1, §4.3). The prompt with its four buttons,
 * the callback handling, and the inbound routing rule: while a day is open
 * (or awaiting its score line) every text / voice reply belongs to the
 * interview, unless it starts with `/c ` (the capture escape) or is a
 * slash command. Called from the webhook; no Telegram code in the engine.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InlineKeyboardMarkup } from "@/lib/telegram/api";
import { APP_URL } from "@/lib/tickets/notify";
import { currentDay, forceClose, getDay, runTurn, snooze, startQuick, startSkip, startTalk, type DayRow, type TurnResult } from "./engine";
import { shiftDate } from "./day";
import { uploadDaylogPhoto } from "./media";

export const CAPTURE_ESCAPE = /^\/c\s+/i;

export function daylogKeyboard(day: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Talk", callback_data: `dl|${day}|talk` },
        { text: "Quick", callback_data: `dl|${day}|quick` },
        { text: "Skip", callback_data: `dl|${day}|skip` },
        { text: "Snooze", callback_data: `dl|${day}|snooze` },
      ],
    ],
  };
}

export function dayUrl(day: string): string {
  return `${APP_URL}/journal/${day}`;
}

/** The day the user is most likely replying about: an open/closing day today or yesterday, else null. */
export async function activeDay(db: SupabaseClient, now = new Date()): Promise<DayRow | null> {
  const today = currentDay(now);
  for (const day of [today, shiftDate(today, -1)]) {
    const d = await getDay(db, day);
    if (d && (d.status === "open" || d.status === "closing")) return d;
  }
  const t = await getDay(db, today);
  if (t && t.status === "prompted") return t;
  return null;
}

/** Inbound text: returns the reply to send when the message belongs to the interview, else null (fall through to capture). */
export async function routeInbound(db: SupabaseClient, text: string, mediaId?: string | null): Promise<{ reply: string; result: TurnResult } | null> {
  if (CAPTURE_ESCAPE.test(text) || text.trim().startsWith("/")) return null;
  const d = await activeDay(db);
  if (!d) return null;
  let result: TurnResult;
  if (d.status === "prompted") {
    // a reply without a button = Talk, and the reply is the first answer
    await startTalk(db, d.day, "telegram");
    result = await runTurn(db, d.id, text, "telegram", mediaId);
  } else {
    result = await runTurn(db, d.id, text, "telegram", mediaId);
  }
  return { reply: decorate(result), result };
}

function decorate(r: TurnResult): string {
  if (r.state === "closed") {
    const d = r.day;
    if (d.status === "skipped") return "Logged.";
    return `${r.reply}\n${dayUrl(d.day)}`;
  }
  return r.reply;
}

/**
 * A photo while a day is open or awaiting scores belongs to that day (decision
 * 28): stored in the private bucket, attached to a scene by timing at close.
 * A caption is kept on the photo and also appended as a message so the
 * interviewer can use it. Returns null when no day is live (fall through).
 */
export async function routeInboundPhoto(db: SupabaseClient, file: { buffer: ArrayBuffer; contentType: string }, caption: string | null, sentAt: Date): Promise<{ reply: string } | null> {
  const d = await activeDay(db);
  if (!d || d.status === "prompted") return null;
  const row = await uploadDaylogPhoto(db, d.id, file.buffer, file.contentType, { takenAt: sentAt.toISOString(), caption });
  if (caption?.trim() && d.status === "open") {
    const r = await runTurn(db, d.id, caption.trim(), "telegram", row.id);
    return { reply: `📷 kept.\n${decorate(r)}` };
  }
  return { reply: "📷 kept — it goes on the scene you were talking about." };
}

/** Callback `dl|<day>|talk|quick|skip|snooze` → the reply text (and whether to keep the buttons). */
export async function handleDaylogCallback(db: SupabaseClient, day: string, action: string): Promise<{ text: string; toast: string }> {
  switch (action) {
    case "talk": {
      const r = await startTalk(db, day, "telegram");
      return { text: r.reply, toast: "Talk" };
    }
    case "quick": {
      const r = await startQuick(db, day, "telegram");
      return { text: r.reply, toast: "Quick" };
    }
    case "skip": {
      const r = await startSkip(db, day, "telegram");
      return { text: r.reply, toast: "Skip — just the scores" };
    }
    case "snooze": {
      const d = await snooze(db, day);
      const at = d.snoozed_until ? new Date(d.snoozed_until).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }) : "later";
      return { text: `Snoozed — I'll ask again at ${at}.`, toast: "Snoozed" };
    }
    case "close": {
      const d = await getDay(db, day);
      if (!d) return { text: "No such day.", toast: "" };
      const r = await forceClose(db, d.id, "telegram");
      return { text: decorate(r), toast: "Closing" };
    }
    default:
      return { text: "Unknown action.", toast: "" };
  }
}
