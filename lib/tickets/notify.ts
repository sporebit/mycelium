/**
 * Tickets — nudges over Telegram (spec §7.2, §8.2). Phil is the only
 * Telegram recipient (P12 decision: other users get web + push); the chat
 * id comes from TELEGRAM_USER_ID like every other sender in the app.
 *
 * Callback data formats (Telegram caps callback_data at 64 bytes; a uuid is
 * 36, so `ci|t|<uuid>|tomorrow` = 50):
 *   m|t|<ticket id>|<category>      move (capture reply buttons)
 *   ci|t|<ticket id>|done|tomorrow|skip|snooze   check-in / reminder buttons
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage, type InlineKeyboardMarkup } from "@/lib/telegram/api";
import { TIME_WINDOW_LABEL, TOOL_GLYPH, WHERE_GLYPH, type TimeWindow, type WhereCtx } from "./categories";
import type { Suggestion } from "./suggest";

export const APP_URL = (process.env.PUBLIC_BASE_URL?.startsWith("https://mycelium") ? process.env.PUBLIC_BASE_URL : null) ?? "https://mycelium.sporebit.com";

export function telegramChatId(): string | null {
  return process.env.TELEGRAM_USER_ID ?? null;
}

export function ticketUrl(key: string): string {
  return `${APP_URL}/organisation/tickets/${encodeURIComponent(key)}`;
}

/** "HOME-31 · 🏠 home · 📱 phone · office hours" */
export function captureSummary(key: string, s: Partial<Suggestion> & { where_ctx?: string; tools?: string[]; time_window?: string; points?: number | null }): string {
  const bits: string[] = [key];
  const where = (s.where_ctx ?? "anywhere") as WhereCtx;
  bits.push(`${WHERE_GLYPH[where] ?? ""} ${where}`.trim());
  const tools = (s.tools ?? []).filter((t) => t !== "none");
  if (tools.length) bits.push(tools.map((t) => `${TOOL_GLYPH[t] ?? "#"} ${t}`).join(" "));
  const win = (s.time_window ?? "anytime") as TimeWindow;
  if (win !== "anytime") bits.push(TIME_WINDOW_LABEL[win].toLowerCase());
  if (s.points != null) bits.push(`${s.points} pts`);
  return bits.join(" · ");
}

export function captureKeyboard(ticketId: string, key: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "▶ Next", callback_data: `m|t|${ticketId}|next` },
        { text: "💤 Someday", callback_data: `m|t|${ticketId}|someday` },
        { text: "✕ Bin", callback_data: `m|t|${ticketId}|cancelled` },
      ],
      [{ text: "Clarify in the app", url: `${APP_URL}/organisation/tickets` }, { text: key, url: ticketUrl(key) }],
    ],
  };
}

export function checkinKeyboard(rows: Array<{ id: string; key: string }>): InlineKeyboardMarkup {
  return {
    inline_keyboard: rows.map((r) => [
      { text: `${r.key} ✓ Done`, callback_data: `ci|t|${r.id}|done` },
      { text: "⏭ Tomorrow", callback_data: `ci|t|${r.id}|tomorrow` },
      { text: "📅", url: ticketUrl(r.key) },
      { text: "✕", callback_data: `ci|t|${r.id}|skip` },
    ]),
  };
}

export function reminderKeyboard(id: string, key: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✓ Done", callback_data: `ci|t|${id}|done` },
        { text: "⏰ +1h", callback_data: `ci|t|${id}|snooze` },
        { text: "⏭ Tomorrow", callback_data: `ci|t|${id}|tomorrow` },
        { text: key, url: ticketUrl(key) },
      ],
    ],
  };
}

export async function sendToPhil(text: string, reply_markup?: InlineKeyboardMarkup, parse_mode?: "HTML"): Promise<boolean> {
  const chat = telegramChatId();
  if (!chat) return false;
  try {
    await sendMessage(chat, text, { reply_markup, parse_mode });
    return true;
  } catch (err) {
    console.error("[tickets/notify] send failed:", err);
    return false;
  }
}

/** Idempotency rows share the app's audit_log convention (see the morning briefing). */
export async function alreadyLogged(db: SupabaseClient, action: string, metaKey: string, metaVal: string): Promise<boolean> {
  const { data } = await db.from("audit_log").select("id").eq("action", action).eq(`metadata->>${metaKey}`, metaVal).limit(1);
  return (data ?? []).length > 0;
}

export async function logOnce(db: SupabaseClient, action: string, metadata: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("audit_log").insert({ action, resource_type: "telegram_message", metadata });
  if (error) console.error("[tickets/notify] audit_log write failed:", error);
}
