import { NextResponse } from "next/server";
import { getCalendarData } from "@/lib/calendar/fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCalendarData();
    return NextResponse.json(data, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[calendar GET] unexpected error:", err);
    return NextResponse.json(
      { events: [], failedCalendars: [], error: "calendar fetch failed" },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
