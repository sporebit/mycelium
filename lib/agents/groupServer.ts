/**
 * The Boys' group against the real Telegram: which bots are present (a
 * token in the environment), their usernames, and the deps the handler
 * runs with. The routing itself is in group.ts and is tested against a
 * fake.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMeAs, sendMessageAs, setWebhookAs } from "@/lib/telegram/api";
import { APP_URL } from "@/lib/tickets/notify";
import { answerAs } from "./answer";
import { type BoyId, BOYS, type GroupDeps, tokenEnvName } from "./group";

/** The agents whose bot token is set. */
export function presentBoys(env: NodeJS.ProcessEnv = process.env): BoyId[] {
  return BOYS.filter((id) => !!env[tokenEnvName(id)]);
}

let usernamesCache: Partial<Record<BoyId, string>> | null = null;

/** Each present bot's username, looked up once per warm instance. */
export async function botUsernames(env: NodeJS.ProcessEnv = process.env): Promise<Partial<Record<BoyId, string>>> {
  if (usernamesCache) return usernamesCache;
  const out: Partial<Record<BoyId, string>> = {};
  await Promise.all(
    presentBoys(env).map(async (id) => {
      try {
        const me = await getMeAs(env[tokenEnvName(id)] as string);
        if (me.username) out[id] = me.username;
      } catch (err) {
        console.error(`[boys] getMe ${id}:`, err instanceof Error ? err.message : err);
      }
    }),
  );
  usernamesCache = out;
  return out;
}

export async function realGroupDeps(db: SupabaseClient, chatId: string, userId: string): Promise<GroupDeps> {
  return {
    chatId,
    userId,
    usernames: await botUsernames(),
    answer: (id, text) => answerAs(db, id, text),
    send: async (id, chat, text, replyTo) => {
      const token = process.env[tokenEnvName(id)];
      if (!token) return;
      await sendMessageAs(token, chat, text, replyTo ? { reply_to_message_id: replyTo } : {});
    },
  };
}

/** The URL each bot's webhook points at. */
export function webhookUrlFor(agentId: BoyId, base: string = APP_URL): string {
  return `${base}/api/telegram/boys/${agentId}`;
}

/** Point every present bot's webhook at its route. Returns what was set, by agent. */
export async function setBoysWebhooks(secret: string, base: string = APP_URL): Promise<Array<{ agentId: BoyId; username: string | null; url: string; ok: boolean; error?: string }>> {
  const out: Array<{ agentId: BoyId; username: string | null; url: string; ok: boolean; error?: string }> = [];
  for (const id of presentBoys()) {
    const token = process.env[tokenEnvName(id)] as string;
    const url = webhookUrlFor(id, base);
    try {
      const me = await getMeAs(token);
      const ok = await setWebhookAs(token, url, secret);
      out.push({ agentId: id, username: me.username ?? null, url, ok });
    } catch (err) {
      out.push({ agentId: id, username: null, url, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  usernamesCache = null;
  return out;
}
