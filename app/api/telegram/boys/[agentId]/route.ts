import { NextRequest, NextResponse } from "next/server";
import { GROUP_CHAT_ENV, type GroupUpdate, handleGroupUpdate, isBoy, tokenEnvName } from "@/lib/agents/group";
import { realGroupDeps } from "@/lib/agents/groupServer";
import { boundUser } from "@/lib/system/bindings";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/telegram/boys/[agentId] — one agent's bot receives an update
 * from the Boys' group. Every bot gets every message Phil writes there;
 * this one answers only when the routing (lib/agents/group.ts) says it is
 * among those who should, and posts as itself. Always 200 after the
 * secret and shape checks, so Telegram never retries.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await ctx.params;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isBoy(agentId)) return NextResponse.json({ error: "no such agent" }, { status: 404 });
  const token = process.env[tokenEnvName(agentId)];
  const chatId = process.env[GROUP_CHAT_ENV];
  const userId = process.env.TELEGRAM_USER_ID;
  if (!token || !chatId || !userId) return NextResponse.json({ ok: false, reason: "not configured" });

  let update: GroupUpdate;
  try {
    update = (await req.json()) as GroupUpdate;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    const uid = boundUser("telegram");
    const result = await withUser(uid, async (db) => handleGroupUpdate(agentId, update, await realGroupDeps(db, chatId, userId)));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[boys/${agentId}]`, err);
    return NextResponse.json({ ok: false });
  }
}
