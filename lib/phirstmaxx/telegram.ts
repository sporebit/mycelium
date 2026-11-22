/**
 * `/pm` on Telegram (claude/phirstmaxx-spec.md §5): a link, a photo or
 * words sent to the bot with /pm become a PhirstMaxx drop for the bound
 * user. The webhook hands the message here and does nothing else with it.
 * A photo is downloaded from Telegram and stored in the bucket before the
 * drop is written; the client id is the chat and message id, so Telegram
 * retrying the update makes one drop.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadFile, getFile, sendMessage } from "@/lib/telegram/api";
import { storeDropFile } from "./files";
import { createDrop, pmCtx } from "./server";

export const PM_COMMAND = /^\/pm(?:@\w+)?(?=\s|$)/i;

export const isPmCommand = (text: string | null | undefined): boolean => PM_COMMAND.test((text ?? "").trim());

type PmMessage = {
  message_id: number;
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string }>;
  document?: { file_id: string; file_name?: string; mime_type?: string };
};

export async function handlePmDrop(db: SupabaseClient, uid: string, message: PmMessage): Promise<void> {
  const chatId = message.chat.id;
  const words = (message.text ?? message.caption ?? "").trim().replace(PM_COMMAND, "").trim();
  try {
    const ctx = await pmCtx(db, uid);
    if (!ctx) {
      await sendMessage(chatId, "PhirstMaxx has no family space yet. Set one up under Family first.");
      return;
    }
    const media: string[] = [];
    const fileId = message.photo?.length ? message.photo[message.photo.length - 1].file_id : message.document?.file_id ?? null;
    if (fileId) {
      const file = await getFile(fileId);
      const { buffer, contentType } = await downloadFile(file.file_path);
      const mime = message.document?.mime_type ?? (message.photo?.length ? "image/jpeg" : contentType);
      const kept = await storeDropFile(db, ctx.spaceId, { bytes: buffer, mime, name: message.document?.file_name ?? "photo.jpg" });
      if (!kept.ok) {
        await sendMessage(chatId, `Not saved: ${kept.error}`);
        return;
      }
      media.push(kept.stored.path);
    }
    if (!words && media.length === 0) {
      await sendMessage(chatId, "Send /pm with a link, a few words or a photo.");
      return;
    }
    const made = await createDrop(db, ctx.spaceId, uid, { client_id: `tg:${chatId}:${message.message_id}`, source: "telegram", text: words || null, media_paths: media });
    if (!made.ok) {
      await sendMessage(chatId, `Not saved: ${made.error}`);
      return;
    }
    const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
    const where = made.drop.thing_id ? `/phirstmaxx/things/${made.drop.thing_id}` : `/phirstmaxx/things?drop=${made.drop.id}`;
    await sendMessage(chatId, `${made.duplicate ? "Already saved" : "Saved"} — researching. ${base}${where}`);
  } catch (err) {
    console.error("[phirstmaxx] /pm failed:", err);
    await sendMessage(chatId, "That did not save. Send it again in a moment.");
  }
}
