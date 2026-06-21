// Real schedule: set cron-job.org to run every 5 minutes
// with Authorization: Bearer CRON_SECRET header

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/telegram/api";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const { data: monitors } = await supabase
      .from("drop_monitors")
      .select("*")
      .eq("enabled", true);

    if (!monitors || monitors.length === 0) {
      return NextResponse.json({ ok: true, checked: 0 });
    }

    const results: { id: string; name: string; in_stock: boolean; status: string }[] = [];
    const batchSize = 5;

    for (let i = 0; i < monitors.length; i += batchSize) {
      const batch = monitors.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (monitor) => {
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
              inStock = keywords.some((k: string) =>
                lower.includes(k.toLowerCase()),
              );
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
            .eq("id", monitor.id);

          if (inStock && !wasInStock && monitor.notify_telegram) {
            const chatId = process.env.TELEGRAM_CHAT_ID;
            if (chatId) {
              try {
                await sendMessage(
                  chatId,
                  `🔥 RESTOCK ALERT: ${monitor.name} is back in stock!\n${monitor.url}`,
                );
              } catch {
                console.error(
                  `[drops-monitor] telegram send failed for ${monitor.name}`,
                );
              }
            }
          }

          return {
            id: monitor.id,
            name: monitor.name,
            in_stock: inStock,
            status,
          };
        }),
      );
      results.push(...batchResults);
    }

    return NextResponse.json({ ok: true, checked: results.length, results });
  } catch (err) {
    console.error("[cron/drops-monitor]", err);
    return NextResponse.json({ error: "cron failed" }, { status: 500 });
  }
}
