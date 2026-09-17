import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { boundUser } from "@/lib/system/bindings";
import { withUser } from "@/lib/system/withUser";
import { getUiPrefs, ticketPrefs } from "@/lib/settings/uiPrefs";
import { londonNow } from "@/lib/tickets/categories";
import { alreadyLogged, checkinKeyboard, logOnce, sendToPhil, APP_URL } from "@/lib/tickets/notify";
import { sendDueReminders } from "@/lib/tickets/reminders";
import { isoWeekOf } from "@/lib/util/week";

export const runtime = "nodejs";
export const maxDuration = 60;

function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * GET /api/cron/tickets-checkins — every 15 min (spec §7.2, §8.2).
 *  1. Due reminders (kind = reminder, remind_at <= now, not yet sent) →
 *     one Telegram message each with Done / +1h / Tomorrow; recurring
 *     reminders re-arm in place from their RRULE.
 *  2. The scheduled-day check-in at the user's check-in time: every open
 *     ticket scheduled today, batched into one message when > 3.
 *  3. The weekly-review reminder at review_day / review_time, once a week.
 * Bearer CRON_SECRET; `?force=1` skips the time gates for a manual run.
 */
export async function GET(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  const now = londonNow();
  const nowIso = new Date().toISOString();
  const out: Record<string, unknown> = { date: now.date, minutes: now.minutes };

  try {
    await withUser(boundUser("cron"), async (db) => {
      // 1. reminders ------------------------------------------------------
      out.reminders = await sendDueReminders(db, now.date);

      // 2. scheduled-day check-in ------------------------------------------
      const prefs = ticketPrefs(await getUiPrefs(db));
      const checkinDue = force || now.minutes >= hm(prefs.checkin_time);
      out.checkin_time = prefs.checkin_time;
      if (checkinDue) {
        const { data: rows } = await db
          .from("tickets")
          .select("id, ticket_key, title, project_id, projects(name), ticket_status:ticket_statuses!inner(category)")
          .eq("scheduled_on", now.date)
          .in("kind", ["task", "reminder", "runbook", "test", "guide", "audit", "setup"])
          .is("deleted_at", null)
          .is("parent_task_id", null)
          .in("ticket_status.category", ["inbox", "backlog", "next", "doing", "waiting", "verify"])
          .or(`checkin_sent_on.is.null,checkin_sent_on.neq.${now.date}`)
          .limit(12);
        const list = (rows ?? []) as Array<{ id: string; ticket_key: string | null; title: string; projects: { name: string } | { name: string }[] | null }>;
        if (list.length > 0) {
          const items = list.map((r) => ({ id: r.id, key: r.ticket_key ?? r.id.slice(0, 8), title: r.title }));
          const text =
            items.length === 1
              ? `📍 Scheduled today: ${items[0].key} ${items[0].title}\nDone, or move it?`
              : `📍 Scheduled today (${items.length}):\n` + items.map((i) => `• ${i.key} ${i.title}`).join("\n");
          const ok = await sendToPhil(text, checkinKeyboard(items.slice(0, 8)));
          if (ok) {
            await db.from("tickets").update({ checkin_sent_on: now.date }).in("id", items.map((i) => i.id));
          }
          out.checkins = ok ? items.length : 0;
        } else {
          out.checkins = 0;
        }
      }

      // 3. weekly review reminder -----------------------------------------
      const iw = isoWeekOf(new Date());
      const week = `${iw.year}-W${String(iw.week).padStart(2, "0")}`;
      const reviewDue = force || (now.isoDay === prefs.review_day && now.minutes >= hm(prefs.review_time));
      if (reviewDue && !(await alreadyLogged(db, "tickets_review_reminder", "week", week))) {
        const ok = await sendToPhil(`🗂 Weekly review time. ${APP_URL}/organisation/tickets/review`);
        if (ok) await logOnce(db, "tickets_review_reminder", { week, sent_at: nowIso });
        out.review_reminder = ok;
      }
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    console.error("[cron/tickets-checkins]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
