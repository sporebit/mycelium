import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/telegram/api";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || bearer !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { text: string; parse_mode?: "Markdown" | "HTML" };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (!body.text?.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const chatId = process.env.TELEGRAM_USER_ID;
  if (!chatId) {
    return NextResponse.json(
      { error: "TELEGRAM_USER_ID missing" },
      { status: 500 },
    );
  }

  try {
    const result = await sendMessage(chatId, body.text, {
      parse_mode: body.parse_mode,
    });
    return NextResponse.json({ ok: true, message_id: result.message_id });
  } catch (err) {
    console.error("[/api/telegram/send]", err);
    return NextResponse.json({ error: "send failed" }, { status: 500 });
  }
}
