import { after, NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { closeDay, type CloseDecision, ensurePlan, FINISHED_STATES, summarise } from "@/lib/daily/server";
import { dailySettings } from "@/lib/daily/settings";
import { cardOf, viewOf } from "@/lib/daily/view";
import { sendEveningPrompt } from "@/lib/daily/prompts";
import { markActed } from "@/lib/nudges/interrupt";
import { queueFirstSteps } from "@/lib/daily/firstSteps";
import { waitingForReview } from "@/lib/capture/queue";
import { filedAs } from "@/lib/capture/pipeline";
import { unsureCards } from "@/lib/finance/unsure";

export const runtime = "nodejs";

const DECISIONS = new Set(["done", "good_enough", "tomorrow", "drop", "keep"]);
/** The evening close holds ten cards at most (research rule 18). */
const MAX_CLOSE_CARDS = 10;

/**
 * GET /api/daily/close — what the evening close shows, in order: what got
 * done first, then the items still open (done / tomorrow / drop), then any
 * ticket whose date slipped a week ago. Capture review cards and
 * low-confidence finance cards are added to the same deck by their own
 * features; the deck as a whole stays within MAX_CLOSE_CARDS.
 */
export async function GET() {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = await createUserClient();
    const settings = await dailySettings(db);
    const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });
    const view = await viewOf(db, plan);
    const finished = plan.items.filter((i) => FINISHED_STATES.includes(i.state)).map(cardOf);
    const open = plan.items.filter((i) => i.state === "planned" || i.state === "started").map(cardOf);
    // Capture cards: oldest first, and only as many as keep the whole deck to ten.
    const room = Math.max(0, MAX_CLOSE_CARDS - Math.min(open.length, MAX_CLOSE_CARDS));
    const { data: waiting } = room
      ? await waitingForReview(db.from("raw_captures").select("id, raw_text, classification, routed_to, audio_path, parent_capture_id, created_at").eq("created_by", uid)).order("created_at", { ascending: true }).limit(room)
      : { data: [] };
    const captures = ((waiting ?? []) as Array<{ id: string; raw_text: string | null; classification: Record<string, unknown> | null; routed_to: string | null; audio_path: string | null; parent_capture_id: string | null; created_at: string }>).map((c) => {
      const cls = c.classification ?? {};
      const kind = typeof cls.kind === "string" ? cls.kind : "capture";
      const held = cls.held === true;
      return {
        id: c.id,
        text: c.raw_text ?? "",
        title: typeof cls.title === "string" ? cls.title : "",
        kind,
        held,
        // What accepting does, in words: "Filed as a task" or, for an item out of a long dump, "An idea. Suggested: a task".
        suggestion: held ? `An idea for now. Suggested: ${filedAs(kind).replace("Filed as ", "")}` : filedAs(kind),
        has_audio: !!c.audio_path || !!c.parent_capture_id,
        has_photo: typeof cls.photo_path === "string",
        from_dump: !!c.parent_capture_id,
        created_at: c.created_at,
      };
    });
    // Finance cards: the payments the model was not sure about, dearest
    // first, in whatever room the deck has left. A finance error never
    // stops the close.
    const finance = await unsureCards(db, Math.max(0, room - captures.length)).catch((err) => {
      console.error("[daily/close] finance cards:", err);
      return [];
    });
    return NextResponse.json({
      day: plan.day,
      status: plan.status,
      won: view.won,
      finished,
      open: open.slice(0, MAX_CLOSE_CARDS),
      captures,
      finance,
      slipped: view.slipped.slice(0, Math.max(0, MAX_CLOSE_CARDS - open.length)),
      summary: plan.status === "closed" ? plan.summary : summarise(plan),
    });
  } catch (err) {
    console.error("[daily/close GET]", err);
    return NextResponse.json({ error: "Could not load the close" }, { status: 500 });
  }
}

/**
 * POST /api/daily/close
 *   { action: "prompt" }                       the phone was plugged in: offer the close (one prompt per day)
 *   { decisions?: [{ item_id, decision }] }    close the day; anything undecided moves to tomorrow
 * "Close the day" always works, with or without decisions.
 */
export async function POST(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; decisions?: unknown };
  try {
    const db = await createUserClient();
    const settings = await dailySettings(db);
    const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });

    if (body.action === "prompt") {
      const res = await sendEveningPrompt(db, uid, plan, { push: false });
      return NextResponse.json({ ok: true, status: "ok", prompted: res.prompted, say: res.say });
    }

    const decisions: CloseDecision[] = Array.isArray(body.decisions)
      ? (body.decisions as Array<Record<string, unknown>>)
          .filter((d) => typeof d?.item_id === "string" && typeof d?.decision === "string" && DECISIONS.has(d.decision as string))
          .map((d) => ({ item_id: d.item_id as string, decision: d.decision as CloseDecision["decision"] }))
      : [];
    const closed = await closeDay(db, uid, plan, decisions);
    void markActed(db, uid, { kind: "evening" }, "closed").catch(() => undefined);
    // The day is closed: have the PC write tomorrow's first steps overnight.
    after(() => queueFirstSteps(db, uid).then(() => undefined, (err) => console.error("[daily/close] first steps:", err)));
    return NextResponse.json({ ok: true, day: closed.day, status: closed.status, summary: closed.summary });
  } catch (err) {
    console.error("[daily/close POST]", err);
    return NextResponse.json({ error: "The day did not close. Nothing was lost; try again." }, { status: 500 });
  }
}
