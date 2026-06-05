import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/telegram/api";

export const runtime = "nodejs";
export const maxDuration = 30;

function nextDue(current: string, recurrence: string): string {
  const d = new Date(current);
  switch (recurrence) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    default:
      return current;
  }
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const secret = process.env.CRON_SECRET;
  if (secret && bearer !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_USER_ID;
  if (!chatId) {
    return NextResponse.json(
      { error: "TELEGRAM_USER_ID missing" },
      { status: 500 },
    );
  }

  try {
    const supabase = createServerClient();
    const now = new Date().toISOString();

    const { data: due, error } = await supabase
      .from("reminders")
      .select("*")
      .is("sent_at", null)
      .eq("cancelled", false)
      .lte("due_at", now)
      .order("due_at")
      .limit(20);

    if (error) throw error;
    if (!due || due.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    let sent = 0;
    for (const r of due) {
      try {
        await sendMessage(chatId, `⏰ ${r.message}`);

        if (r.recurrence) {
          await supabase
            .from("reminders")
            .update({ sent_at: now })
            .eq("id", r.id);

          await supabase.from("reminders").insert({
            user_id: r.user_id,
            message: r.message,
            due_at: nextDue(r.due_at, r.recurrence),
            recurrence: r.recurrence,
          });
        } else {
          await supabase
            .from("reminders")
            .update({ sent_at: now })
            .eq("id", r.id);
        }

        sent++;
      } catch (err) {
        console.error(`[cron/reminders] failed to send ${r.id}:`, err);
      }
    }

    return NextResponse.json({ sent, total: due.length });
  } catch (err) {
    console.error("[cron/reminders]", err);
    return NextResponse.json({ error: "cron failed" }, { status: 500 });
  }
}
