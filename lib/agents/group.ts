/**
 * The Boys' group chat (master run §6, Stream B part 2): one Telegram group,
 * one bot per agent, each posting as itself. Telegram sends every message
 * Phil writes in the group to every bot (privacy mode off), and never a
 * bot's message to another bot — so there is no loop to guard against, and
 * each bot decides for itself, from the same text, whether it is the one to
 * answer. All are free to reply; there is no per-message guard; the £5 cap
 * on the meter is the only limit.
 *
 * Who answers (in order; the first rule that applies decides):
 *   1. a reply to a bot's message → that bot;
 *   2. "@botname" in the text → that bot (several → each of them);
 *   3. an agent named in the opening words ("Advisor, …", "Coach — …") → that agent;
 *   4. the message's domains (lib/agents/relevance.ts): each specialist
 *      whose domain it touches answers; when it touches none in particular
 *      (the all-domains fallback), Da Boi answers alone.
 *
 * Tokens come from the environment, one per agent (see tokenEnvName); the
 * group's id from TELEGRAM_BOYS_CHAT_ID. A bot with no token is simply not
 * there. The existing capture bot and its webhook are untouched.
 *
 * Pure except for `handleGroupUpdate`, which takes its sender and its
 * answerer as arguments so the tests run against a fake Telegram.
 */
import { type DaBoiDomain, relevantDomains, DA_BOI_DOMAINS } from "./relevance";

export const BOYS = ["da_boi", "fitness", "finance", "tasks", "nutrition", "founder", "engineer"] as const;
export type BoyId = (typeof BOYS)[number];

export const GROUP_CHAT_ENV = "TELEGRAM_BOYS_CHAT_ID";

/** TELEGRAM_BOT_TOKEN_DA_BOI, TELEGRAM_BOT_TOKEN_FITNESS, … */
export function tokenEnvName(agentId: BoyId): string {
  return `TELEGRAM_BOT_TOKEN_${agentId.toUpperCase()}`;
}

export function isBoy(id: string): id is BoyId {
  return (BOYS as readonly string[]).includes(id);
}

/** Each specialist's domain; Da Boi has none of his own and takes what no one else does. */
const DOMAIN_OF: Record<Exclude<BoyId, "da_boi">, DaBoiDomain> = {
  fitness: "fitness",
  finance: "finance",
  tasks: "tasks",
  nutrition: "nutrition",
  founder: "founder",
  engineer: "engineer",
};

/** How each is addressed by name at the start of a message. */
const NAMED: Record<BoyId, RegExp> = {
  da_boi: /^\W*(da ?boi|boi)\b/i,
  fitness: /^\W*(fitness coach|coach)\b/i,
  finance: /^\W*(the )?advisor\b/i,
  tasks: /^\W*(the )?assistant\b/i,
  nutrition: /^\W*(the )?nutritionist\b/i,
  founder: /^\W*(the )?founder\b/i,
  engineer: /^\W*(the )?engineer\b/i,
};

export type GroupMessage = {
  text: string;
  /** The username of the bot whose message this replies to, if it is a reply to one. */
  replyToBot?: string | null;
};

/**
 * Which agents answer this message. `usernames` maps each agent present to
 * its bot's @username (without the @); an agent not in the map has no bot
 * and never answers.
 */
export function responders(message: GroupMessage, usernames: Readonly<Partial<Record<BoyId, string>>>): BoyId[] {
  const present = BOYS.filter((id) => usernames[id]);
  if (!present.length) return [];
  const text = message.text.trim();

  // 1. a reply to one of them
  if (message.replyToBot) {
    const to = present.find((id) => usernames[id]?.toLowerCase() === message.replyToBot?.toLowerCase());
    if (to) return [to];
  }

  // 2. @mentions
  const mentioned = present.filter((id) => new RegExp(`@${usernames[id]}\\b`, "i").test(text));
  if (mentioned.length) return mentioned;

  // 3. named in the opening words
  const named = present.filter((id) => NAMED[id].test(text));
  if (named.length) return named;

  // 4. the message's domains
  const domains = relevantDomains(text);
  const specific = domains.size < DA_BOI_DOMAINS.length;
  if (!specific) return present.includes("da_boi") ? ["da_boi"] : [];
  const specialists = present.filter((id): id is Exclude<BoyId, "da_boi"> => id !== "da_boi" && domains.has(DOMAIN_OF[id]));
  if (specialists.length) return specialists;
  return present.includes("da_boi") ? ["da_boi"] : [];
}

/* ------------------------------------------------------------------ */
/* The handler one bot's webhook runs                                 */
/* ------------------------------------------------------------------ */

export type GroupUpdate = {
  update_id?: number;
  message?: {
    message_id: number;
    from?: { id: number; is_bot?: boolean; username?: string };
    chat: { id: number; type?: string };
    text?: string;
    reply_to_message?: { from?: { id: number; is_bot?: boolean; username?: string } };
  };
};

export type GroupDeps = {
  /** The group's chat id and the allowed sender, from the environment. */
  chatId: string;
  userId: string;
  /** Each present agent's bot username. */
  usernames: Readonly<Partial<Record<BoyId, string>>>;
  /** The agent's reply to the text, in its own voice. */
  answer: (agentId: BoyId, text: string) => Promise<string>;
  /** Post as the agent's own bot. */
  send: (agentId: BoyId, chatId: string | number, text: string, replyTo?: number) => Promise<void>;
};

export type GroupResult = { answered: true; agentId: BoyId } | { answered: false; reason: "not_a_boy" | "no_message" | "wrong_chat" | "wrong_sender" | "command" | "not_mine" | "failed" };

/**
 * One bot received one update. Decide whether this bot is among those who
 * answer, and if so answer as itself. Never throws: the webhook returns 200
 * either way, so Telegram does not retry.
 */
export async function handleGroupUpdate(agentId: string, update: GroupUpdate, deps: GroupDeps): Promise<GroupResult> {
  if (!isBoy(agentId)) return { answered: false, reason: "not_a_boy" };
  const m = update.message;
  if (!m || typeof m.text !== "string" || !m.text.trim()) return { answered: false, reason: "no_message" };
  if (String(m.chat.id) !== String(deps.chatId)) return { answered: false, reason: "wrong_chat" };
  if (!m.from || String(m.from.id) !== String(deps.userId) || m.from.is_bot) return { answered: false, reason: "wrong_sender" };
  // Bot commands ("/start", "/c …") are the capture bot's business, never the group's.
  if (m.text.startsWith("/")) return { answered: false, reason: "command" };

  const who = responders({ text: m.text, replyToBot: m.reply_to_message?.from?.is_bot ? (m.reply_to_message.from.username ?? null) : null }, deps.usernames);
  if (!who.includes(agentId)) return { answered: false, reason: "not_mine" };

  try {
    const reply = await deps.answer(agentId, m.text);
    if (reply.trim()) await deps.send(agentId, m.chat.id, reply, who.length > 1 ? m.message_id : undefined);
    return { answered: true, agentId };
  } catch (err) {
    console.error(`[boys/${agentId}]`, err instanceof Error ? err.message : err);
    return { answered: false, reason: "failed" };
  }
}
