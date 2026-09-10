import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withUser } from "@/lib/system/withUser";
import { PRINCIPAL_HEADER } from "@/lib/auth/gate";
import { getOwnProfile } from "@/lib/auth/session";
import { boundUser } from "@/lib/system/bindings";
import { sendMessage } from "@/lib/telegram/api";
import { isWeekend, nowInLondon } from "@/lib/briefings/london";
import { gatherBriefingData } from "@/lib/briefings/data";
import { generateIntro } from "@/lib/briefings/intro";
import { composeMessage } from "@/lib/briefings/compose";
import { refreshFinanceBestEffort } from "@/lib/briefings/refreshFinance";

export const runtime = "nodejs";
export const maxDuration = 60;

async function alreadySentToday(
  supabase: SupabaseClient,
  dateKey: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id")
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
  supabase: SupabaseClient,
  dateKey: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({ action: "morning_briefing",
    resource_type: "telegram_message",
    metadata: { briefing_date: dateKey, ...metadata },
  });
  if (error) {
    console.error("[briefing] audit_log write failed:", error);
  }
}

async function runBriefing(req: NextRequest): Promise<Response> {
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

  // Vercel cron admits this route with CRON_SECRET, which names no user:
  // everything that touches the database acts as the cron binding.
  return withUser(boundUser("cron"), async (supabase) => {
    // 2. Idempotency — unless ?force=1
    if (!force && (await alreadySentToday(supabase, local.dateKey))) {
      return NextResponse.json({
        skipped: true,
        reason: "already sent today",
        dateKey: local.dateKey,
      });
    }

    // 3. Refresh finance snapshot (best-effort, doesn't block on failure).
    // We await so the briefing reads fresh data, but ignore errors.
    await refreshFinanceBestEffort(supabase);

    // 4. Gather data + compose
    const data = await gatherBriefingData(supabase, local.dateKey);
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
    await writeAuditLog(supabase, local.dateKey, {
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
  });
}

/**
 * Who may fire Phil's briefing: the cron (CRON_SECRET → principal system,
 * no user) or the instance owner from a session. Any other signed-in user
 * would otherwise be able to trigger and read it, since the work itself
 * runs as the bound cron user.
 */
async function allowed(req: NextRequest): Promise<boolean> {
  if (req.headers.get(PRINCIPAL_HEADER) === "system") return true;
  const profile = await getOwnProfile();
  return Boolean(profile?.is_instance_owner);
}

export async function GET(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return runBriefing(req);
}

export async function POST(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return runBriefing(req);
}
