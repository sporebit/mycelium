import { NextRequest, NextResponse } from "next/server";
import { presentBoys, setBoysWebhooks, webhookUrlFor } from "@/lib/agents/groupServer";
import { GROUP_CHAT_ENV, tokenEnvName, BOYS } from "@/lib/agents/group";
import { matchesBearer } from "@/lib/auth/gate";

export const runtime = "nodejs";

/**
 * The Boys' group, set up from the environment (owner only, bearer
 * API_SECRET):
 *   GET   which agents have a token, which do not, and the URL each bot's
 *         webhook will point at — nothing is sent
 *   POST  point every present bot's webhook at its route, with the shared
 *         webhook secret; returns each bot's username and whether it took
 */
export async function GET(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.API_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const present = new Set(presentBoys());
  return NextResponse.json({
    group_chat_set: !!process.env[GROUP_CHAT_ENV],
    webhook_secret_set: !!process.env.TELEGRAM_WEBHOOK_SECRET,
    agents: BOYS.map((id) => ({ agentId: id, env: tokenEnvName(id), token_set: present.has(id), webhook_url: webhookUrlFor(id) })),
  });
}

export async function POST(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.API_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET missing" }, { status: 400 });
  return NextResponse.json({ ok: true, set: await setBoysWebhooks(secret) });
}
