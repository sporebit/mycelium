import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/telegram/api";

export const runtime = "nodejs";

type ShoppingItem = { amount: string; unit: string | null; name: string };

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const chatId = process.env.TELEGRAM_USER_ID;
    if (!chatId) {
      return NextResponse.json({ error: "TELEGRAM_USER_ID missing" }, { status: 500 });
    }

    const supabase = createServerClient();
    const { data: list, error } = await supabase
      .from("shopping_lists")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !list) {
      return NextResponse.json({ error: "list not found" }, { status: 404 });
    }

    const items = (list.items ?? []) as ShoppingItem[];
    const lines = items.map((i) => {
      const qty = i.unit ? `${i.amount} ${i.unit}` : i.amount;
      return `• ${qty} ${i.name}`;
    });

    const weekLabel = list.week_start
      ? new Date(list.week_start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : "";

    const message = [
      `🛒 ${list.title || `Shopping List — Week of ${weekLabel}`}`,
      "",
      ...lines,
    ].join("\n");

    await sendMessage(chatId, message);

    await supabase
      .from("shopping_lists")
      .update({ sent_to_telegram: true, sent_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[shopping-lists/send-telegram POST]", err);
    return NextResponse.json({ error: "send failed" }, { status: 500 });
  }
}
