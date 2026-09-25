import { NextRequest, NextResponse } from "next/server";
import { pickPostBody } from "@/lib/capture/registry";
import { after } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { createQuote, findSimilar, QUOTE_SELECT, type QuoteRow } from "@/lib/quotes/server";
import { researchQuote } from "@/lib/quotes/research";
import { similarity } from "@/lib/quotes/text";

export const runtime = "nodejs";

/**
 * GET /api/quotes?q=&person=<id>|mine&merch=1&month=YYYY-MM&limit=
 * Newest first (spec §6). Search is trigram similarity over text + context,
 * done in the app (no pg_trgm on the hosted project) with a substring
 * fast-path so a typed fragment always matches.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const person = sp.get("person");
  const merch = sp.get("merch") === "1";
  const month = sp.get("month");
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 200) || 200));
  try {
    const supabase = await createUserClient();
    let query = supabase.from("quotes").select(QUOTE_SELECT).order("created_at", { ascending: false }).limit(q ? 500 : limit);
    if (person === "mine") query = query.eq("is_own", true);
    else if (person) query = query.eq("said_by_person_id", person);
    if (merch) query = query.eq("merch", true);
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
      const end = new Date(Date.UTC(y, m, 1)).toISOString();
      query = query.gte("said_at", start).lt("said_at", end);
    }
    const { data, error } = await query;
    if (error) throw error;
    let rows = (data ?? []) as unknown as QuoteRow[];
    auditListRead(req, rows as unknown as Array<{ space_id?: string | null }>, "organisation", "quotes");
    if (q) {
      const needle = q.toLowerCase();
      rows = rows
        .map((r) => {
          const hay = `${r.text} ${r.context ?? ""}`;
          const score = hay.toLowerCase().includes(needle) ? 1 : Math.max(similarity(q, r.text), similarity(q, r.context ?? ""));
          return { r, score };
        })
        .filter((x) => x.score >= 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.r);
    }
    return NextResponse.json({ quotes: rows });
  } catch (err) {
    console.error("[/api/quotes GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  text?: string;
  said_by_person_id?: string | null;
  is_own?: boolean;
  context?: string | null;
  source?: string | null;
  said_at?: string | null;
  merch?: boolean;
  speaker_confidence?: "certain" | "uncertain";
  skip_research?: boolean;
  /** Skip the near-duplicate check (the UI sends this after showing the warning). */
  force?: boolean;
};

/** POST — manual create (bypasses review). 409 with the matches when a near-duplicate exists and `force` is not set. */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  const body = pickPostBody("quote", await readJson(req)) as CreateBody;
  const text = body?.text?.trim();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    if (!body?.force) {
      const similar = await findSimilar(supabase, text);
      if (similar.length) return NextResponse.json({ error: "near-duplicate", similar }, { status: 409 });
    }
    const said_at = body?.said_at && !Number.isNaN(Date.parse(body.said_at)) ? new Date(body.said_at).toISOString() : null;
    const row = await createQuote(supabase, {
      text,
      said_by_person_id: body?.said_by_person_id ?? null,
      is_own: body?.is_own,
      speaker_confidence: body?.speaker_confidence,
      context: body?.context ?? null,
      source: body?.source ?? null,
      said_at,
      merch: body?.merch,
      skip_research: body?.skip_research,
    });
    if (row.research_status === "pending") after(() => researchQuote(supabase, row.id).catch((e) => console.error("[quotes research]", e)));
    return NextResponse.json({ quote: row }, { status: 201 });
  } catch (err) {
    console.error("[/api/quotes POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "create failed" }, { status: 500 });
  }
}
