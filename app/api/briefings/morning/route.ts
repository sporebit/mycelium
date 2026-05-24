import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/telegram/api";
import { isWeekend, nowInLondon } from "@/lib/briefings/london";
import { gatherBriefingData } from "@/lib/briefings/data";
import { generateIntro } from "@/lib/briefings/intro";
import { composeMessage } from "@/lib/briefings/compose";
import { refreshFinanceBestEffort } from "@/lib/briefings/refreshFinance";

export const runtime = "nodejs";
export const maxDuration = 60;

async function alreadySentToday(
  userId: string,
  dateKey: string
): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id")
    .eq("user_id", userId)
    .eq("action", "morning_briefing")
    .eq("metadata->>briefing_date", dateKey)
    .limit(1);
  if (error) {
    console.error("[briefing] idempotency check failed:", error);
    return false; // err on the side of sending
  }
  return (data ?? []).length > 0;
}

async function writeAuditLog(
  userId: string,
  dateKey: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("audit_log").insert({
    user_id: userId,
    action: "morning_briefing",
    resource_type: "telegram_message",
    metadata: { briefing_date: dateKey, ...metadata },
  });
  if (error) {
    console.error("[briefing] audit_log write failed:", error);
  }
}

async function runBriefing(req: NextRequest): Promise<Response> {
  const userId = process.env.USER_ID;
  if (!userId) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const chatId = process.env.TELEGRAM_USER_ID;
  if (!chatId) {
    return NextResponse.json(
      { error: "TELEGRAM_USER_ID missing" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const dry = url.searchParams.get("dry") === "1";

  const local = nowInLondon();
  const expectedHour = isWeekend(local.dow) ? 9 : 7;

  // 1. Local-time gate — unless ?force=1
  if (!force && local.hour !== expectedHour) {
    return NextResponse.json({
      skipped: true,
      reason: `local hour ${local.hour} != expected ${expectedHour} (${local.weekday})`,
      local,
    });
  }

  // 2. Idempotency — unless ?force=1
  if (!force && (await alreadySentToday(userId, local.dateKey))) {
    return NextResponse.json({
      skipped: true,
      reason: "already sent today",
      dateKey: local.dateKey,
    });
  }

  // 3. Refresh finance snapshot (best-effort, doesn't block on failure).
  // We await so the briefing reads fresh data, but ignore errors.
  await refreshFinanceBestEffort(userId);

  // 4. Gather data + compose
  const data = await gatherBriefingData(userId, local.dateKey);
  const intro = await generateIntro(data);
  const message = composeMessage(data, intro);

  if (dry) {
    return NextResponse.json({
      dry: true,
      dateKey: local.dateKey,
      intro,
      message,
      data: {
        calendarCount: data.calendar.length,
        topTaskCount: data.topTasks.length,
        blockerCount: data.blockers.length,
        habits: data.habits,
        streak: data.streak,
        hasFinance: !!data.finance,
        hasWeather: !!data.weather,
      },
    });
  }

  // 5. Send to Telegram
  try {
    await sendMessage(chatId, message, { parse_mode: "HTML" });
  } catch (err) {
    console.error("[briefing] Telegram send failed:", err);
    return NextResponse.json(
      { error: "telegram send failed", detail: String(err) },
      { status: 502 }
    );
  }

  // 6. Audit
  await writeAuditLog(userId, local.dateKey, {
    dow: local.dow,
    weekday: local.weekday,
    intro_preview: intro?.slice(0, 200) ?? null,
    counts: {
      calendar: data.calendar.length,
      tasks: data.topTasks.length,
      blockers: data.blockers.length,
    },
    finance_included: !!data.finance,
    weather_included: !!data.weather,
    forced: force,
  });

  return NextResponse.json({
    ok: true,
    dateKey: local.dateKey,
    weekday: local.weekday,
    bytes: new TextEncoder().encode(message).length,
  });
}

export async function GET(req: NextRequest) {
  return runBriefing(req);
}

export async function POST(req: NextRequest) {
  return runBriefing(req);
}
