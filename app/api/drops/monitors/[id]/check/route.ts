import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/telegram/api";

export const runtime = "nodejs";
export const maxDuration = 15;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();

    const { data: monitor, error } = await supabase
      .from("drop_monitors")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !monitor) {
      return NextResponse.json({ error: "monitor not found" }, { status: 404 });
    }

    const wasInStock = !!monitor.in_stock;
    let inStock = false;
    let status = "checked";

    try {
      const res = await fetch(monitor.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(10_000),
      });
      const html = await res.text();
      const keywords = (monitor.keywords ?? []) as string[];

      if (keywords.length > 0) {
        const lower = html.toLowerCase();
        inStock = keywords.some((k: string) => lower.includes(k.toLowerCase()));
      }

      status = inStock ? "in_stock" : "out_of_stock";
    } catch {
      status = "error";
    }

    await supabase
      .from("drop_monitors")
      .update({
        last_checked_at: new Date().toISOString(),
        last_status: status,
        in_stock: inStock,
      })
      .eq("id", id);

    if (inStock && !wasInStock && monitor.notify_telegram) {
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (chatId) {
        await sendMessage(
          chatId,
          `🔥 RESTOCK ALERT: ${monitor.name} is back in stock!\n${monitor.url}`,
        );
      }
    }

    return NextResponse.json({
      in_stock: inStock,
      checked_at: new Date().toISOString(),
      status,
    });
  } catch (err) {
    console.error("[drops/monitors/[id]/check POST]", err);
    return NextResponse.json({ error: "check failed" }, { status: 500 });
  }
}
