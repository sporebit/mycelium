import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { answerCloseoutCard } from "@/lib/daily/closeoutCards";
import { closeoutView, currentWeek, decideSection, finishCloseout, startCloseout } from "@/lib/daily/closeoutServer";
import { SOURCES } from "@/lib/daily/closeoutSources";
import { markActed } from "@/lib/nudges/interrupt";

export const runtime = "nodejs";

/**
 * GET /api/daily/closeout — this week's close-out (master run §6; research
 * rules 23, 25, 32): the box, the week's fill and lifetime totals, the one
 * quiet section raised, the month's measures when this is the month's
 * first, and the cards other features have added.
 */
export async function GET() {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await closeoutView(await createUserClient(), uid));
  } catch (err) {
    console.error("[daily/closeout GET]", err);
    return NextResponse.json({ error: "Could not load the close-out" }, { status: 500 });
  }
}

/**
 * POST /api/daily/closeout
 *   { action: "start", plan }                                  the box begins; the plan is said
 *   { action: "section", key, decision, why }                  keep / pause / retire, and why
 *   { action: "card", source, id, value }                      an answer to a feature's card
 *   { action: "finish", report, screen_minutes?, partner_answers? }   close the week; always works
 */
export async function POST(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const week = currentWeek();
  try {
    const db = await createUserClient();
    const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
    switch (body.action) {
      case "start": {
        await startCloseout(db, uid, week, str("plan"));
        void markActed(db, uid, { kind: "closeout" }, "started").catch(() => undefined);
        break;
      }
      case "section": {
        const decision = str("decision");
        if (decision !== "keep" && decision !== "pause" && decision !== "retire") return NextResponse.json({ error: "decision must be keep, pause or retire" }, { status: 400 });
        if (!str("key")) return NextResponse.json({ error: "key required" }, { status: 400 });
        await decideSection(db, uid, week, str("key"), decision, str("why"));
        break;
      }
      case "card": {
        const res = await answerCloseoutCard(SOURCES, db, uid, str("source"), str("id"), str("value"));
        if (!res.ok) return NextResponse.json({ error: res.error ?? "That did not take." }, { status: 400 });
        break;
      }
      case "finish": {
        const partner = body.partner_answers && typeof body.partner_answers === "object" ? (body.partner_answers as { helping?: unknown; costing?: unknown }) : null;
        await finishCloseout(db, uid, week, {
          report: str("report"),
          screen_minutes: typeof body.screen_minutes === "number" ? body.screen_minutes : null,
          partner_answers: partner ? { helping: typeof partner.helping === "string" ? partner.helping.trim() : undefined, costing: typeof partner.costing === "string" ? partner.costing.trim() : undefined } : null,
        });
        void markActed(db, uid, { kind: "closeout" }, "finished").catch(() => undefined);
        break;
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json(await closeoutView(db, uid));
  } catch (err) {
    console.error("[daily/closeout POST]", err);
    return NextResponse.json({ error: "That did not save. Nothing was lost; try again." }, { status: 500 });
  }
}
