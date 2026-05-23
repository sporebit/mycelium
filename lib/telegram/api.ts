const TG_API = "https://api.telegram.org";

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
  return token;
}

async function tg<T = unknown>(
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${TG_API}/bot${botToken()}/${method}`, {
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

export type InlineKeyboardButton = {
  text: string;
  callback_data: string;
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
