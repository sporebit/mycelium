import { describe, expect, it } from "vitest";
import { type BoyId, BOYS, GROUP_CHAT_ENV, type GroupDeps, type GroupUpdate, handleGroupUpdate, responders, tokenEnvName } from "./group";

const USERNAMES: Record<BoyId, string> = {
  da_boi: "DaBoiBot",
  fitness: "MyceliumCoachBot",
  finance: "MyceliumAdvisorBot",
  tasks: "MyceliumAssistantBot",
  nutrition: "MyceliumNutritionistBot",
  founder: "MyceliumFounderBot",
  engineer: "MyceliumEngineerBot",
};

/** A fake Telegram: records what each bot posted, and answers as each agent in one word. */
function fakeTelegram(usernames: Partial<Record<BoyId, string>> = USERNAMES) {
  const posted: Array<{ agentId: BoyId; chatId: string | number; text: string; replyTo?: number }> = [];
  const asked: BoyId[] = [];
  const deps: GroupDeps = {
    chatId: "-1001",
    userId: "42",
    usernames,
    answer: async (agentId, text) => {
      asked.push(agentId);
      return `${agentId} says: ${text.slice(0, 20)}`;
    },
    send: async (agentId, chatId, text, replyTo) => {
      posted.push({ agentId, chatId, text, replyTo });
    },
  };
  return { deps, posted, asked };
}

const update = (text: string, extra: Partial<NonNullable<GroupUpdate["message"]>> = {}): GroupUpdate => ({
  update_id: 1,
  message: { message_id: 7, from: { id: 42 }, chat: { id: -1001, type: "supergroup" }, text, ...extra },
});

/** What every bot does with the same update: Telegram sends it to each of them. */
async function everyone(u: GroupUpdate, tg: ReturnType<typeof fakeTelegram>) {
  return Promise.all(BOYS.map((id) => handleGroupUpdate(id, u, tg.deps)));
}

describe("who answers in the Boys' group", () => {
  it("names each bot's token by its agent id, and the group by one name", () => {
    expect(tokenEnvName("da_boi")).toBe("TELEGRAM_BOT_TOKEN_DA_BOI");
    expect(tokenEnvName("fitness")).toBe("TELEGRAM_BOT_TOKEN_FITNESS");
    expect(GROUP_CHAT_ENV).toBe("TELEGRAM_BOYS_CHAT_ID");
  });

  it("sends a specialist's subject to that specialist, and a general one to Da Boi alone", () => {
    expect(responders({ text: "How much did I spend on food?" }, USERNAMES)).toEqual(["finance", "nutrition"]);
    expect(responders({ text: "Squats felt heavy, knee a bit sore" }, USERNAMES)).toEqual(["fitness"]);
    expect(responders({ text: "Should the PC get a new GPU or more RAM?" }, USERNAMES)).toEqual(["engineer"]);
    expect(responders({ text: "Morning all" }, USERNAMES)).toEqual(["da_boi"]);
  });

  it("lets a name, an @mention or a reply pick the one who answers", () => {
    expect(responders({ text: "Advisor, is the pension on track?" }, USERNAMES)).toEqual(["finance"]);
    expect(responders({ text: "Coach — what's tomorrow's session?" }, USERNAMES)).toEqual(["fitness"]);
    expect(responders({ text: "Da Boi what do you think about my spending" }, USERNAMES)).toEqual(["da_boi"]);
    expect(responders({ text: "@MyceliumEngineerBot thoughts on the budget for a new PC?" }, USERNAMES)).toEqual(["engineer"]);
    expect(responders({ text: "@MyceliumEngineerBot @MyceliumAdvisorBot a PC budget?" }, USERNAMES)).toEqual(["finance", "engineer"]);
    expect(responders({ text: "yes please", replyToBot: "myceliumnutritionistbot" }, USERNAMES)).toEqual(["nutrition"]);
  });

  it("only ever picks bots that are there, and Da Boi only if his bot is", () => {
    const two: Partial<Record<BoyId, string>> = { fitness: "A", finance: "B" };
    expect(responders({ text: "Morning all" }, two)).toEqual([]);
    expect(responders({ text: "squats and spending" }, two)).toEqual(["fitness", "finance"]);
    expect(responders({ text: "what should I eat" }, two)).toEqual([]); // nutrition is not there; no one guesses
    expect(responders({ text: "anything" }, {})).toEqual([]);
  });
});

describe("one bot handling one update (the fake Telegram)", () => {
  it("has each bot that should answer post as itself, and the rest stay silent", async () => {
    const tg = fakeTelegram();
    const results = await everyone(update("How much did I spend on food?"), tg);
    expect(results.filter((r) => r.answered).map((r) => (r as { agentId: BoyId }).agentId)).toEqual(["finance", "nutrition"]);
    expect(tg.posted.map((p) => p.agentId)).toEqual(["finance", "nutrition"]);
    expect(tg.posted[0].text).toMatch(/^finance says:/);
    expect(tg.posted[1].text).toMatch(/^nutrition says:/);
    // two answering: each replies to the message so the thread reads clearly
    expect(tg.posted.every((p) => p.replyTo === 7)).toBe(true);
    expect(results.filter((r) => !r.answered).every((r) => (r as { reason: string }).reason === "not_mine")).toBe(true);
  });

  it("one answering posts plainly, not as a reply", async () => {
    const tg = fakeTelegram();
    await everyone(update("Morning all"), tg);
    expect(tg.posted).toEqual([{ agentId: "da_boi", chatId: -1001, text: "da_boi says: Morning all", replyTo: undefined }]);
  });

  it("ignores another chat, another sender, a bot, an empty message and a command", async () => {
    const tg = fakeTelegram();
    expect(await handleGroupUpdate("da_boi", update("hi", { chat: { id: 5 } }), tg.deps)).toEqual({ answered: false, reason: "wrong_chat" });
    expect(await handleGroupUpdate("da_boi", update("hi", { from: { id: 99 } }), tg.deps)).toEqual({ answered: false, reason: "wrong_sender" });
    expect(await handleGroupUpdate("da_boi", update("hi", { from: { id: 42, is_bot: true } }), tg.deps)).toEqual({ answered: false, reason: "wrong_sender" });
    expect(await handleGroupUpdate("da_boi", { update_id: 1 }, tg.deps)).toEqual({ answered: false, reason: "no_message" });
    expect(await handleGroupUpdate("da_boi", update("/c buy milk"), tg.deps)).toEqual({ answered: false, reason: "command" });
    expect(await handleGroupUpdate("someone", update("hi"), tg.deps)).toEqual({ answered: false, reason: "not_a_boy" });
    expect(tg.posted).toEqual([]);
    expect(tg.asked).toEqual([]);
  });

  it("swallows a failed answer so the webhook still returns 200, and posts nothing", async () => {
    const tg = fakeTelegram();
    tg.deps.answer = async () => {
      throw new Error("meter: cap reached");
    };
    expect(await handleGroupUpdate("da_boi", update("Morning all"), tg.deps)).toEqual({ answered: false, reason: "failed" });
    expect(tg.posted).toEqual([]);
  });

  it("does not answer at all when the agent's bot is absent, whatever the text", async () => {
    const tg = fakeTelegram({ fitness: "A" });
    const results = await everyone(update("Morning all"), tg);
    expect(results.every((r) => !r.answered)).toBe(true);
    expect(tg.asked).toEqual([]);
  });
});
