const TG_API = "https://api.telegram.org";

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
  return token;
}

/**
 * One Telegram call as a given bot. The capture bot's token is the default;
 * the Boys' group (lib/agents/group.ts) passes each agent's own, so each
 * posts as itself.
 */
export async function tgAs<T = unknown>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram ${method} failed: ${json.description ?? "unknown"}`);
  }
  return json.result;
}

async function tg<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
  return tgAs<T>(botToken(), method, body);
}

/** Send as a particular bot (the Boys' group: each agent has its own). */
export async function sendMessageAs(token: string, chatId: number | string, text: string, opts: { reply_to_message_id?: number; parse_mode?: "Markdown" | "HTML" } = {}) {
  return tgAs<{ message_id: number }>(token, "sendMessage", { chat_id: chatId, text, ...opts });
}

/** The bot a token belongs to. */
export async function getMeAs(token: string): Promise<{ id: number; username?: string; first_name?: string }> {
  return tgAs(token, "getMe");
}

/** Point a bot's webhook at a URL, with the shared secret header Telegram will send back. */
export async function setWebhookAs(token: string, url: string, secret: string): Promise<boolean> {
  return tgAs<boolean>(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message"] });
}

export type InlineKeyboardButton = {
  text: string;
  /** One of callback_data or url (Telegram allows exactly one per button). */
  callback_data?: string;
  url?: string;
};

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: { reply_markup?: InlineKeyboardMarkup; parse_mode?: "Markdown" | "HTML" } = {}
) {
  return tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    ...opts,
  });
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  opts: { reply_markup?: InlineKeyboardMarkup } = {}
) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...opts,
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
) {
  return tg("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

type GetFileResult = { file_id: string; file_path: string; file_size?: number };

export async function getFile(fileId: string): Promise<GetFileResult> {
  return tg<GetFileResult>("getFile", { file_id: fileId });
}

export async function downloadFile(filePath: string): Promise<{
  buffer: ArrayBuffer;
  contentType: string;
}> {
  const url = `${TG_API}/file/bot${botToken()}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Telegram downloadFile failed: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();
  return { buffer, contentType };
}
