import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { addIgnoredTerms, listIgnoredTerms, removeIgnoredTerm } from "@/lib/people/ignored";

export const runtime = "nodejs";

/** GET /api/people/ignored — the ignore list, newest first (people-review R4). */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    const terms = await listIgnoredTerms(supabase);
    auditListRead(req, terms, "organisation", "people");
    return NextResponse.json({ terms });
  } catch (err) {
    console.error("[/api/people/ignored GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** POST /api/people/ignored { term } or { terms: [...] } — manual add from Settings → People. */
export async function POST(req: NextRequest) {
  let body: { term?: unknown; terms?: unknown };
  try {
    body = (await req.json()) as { term?: unknown; terms?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const terms = [
    ...(typeof body.term === "string" ? [body.term] : []),
    ...(Array.isArray(body.terms) ? body.terms.filter((t): t is string => typeof t === "string") : []),
  ]
    .map((t) => t.trim())
    .filter(Boolean);
  if (terms.length === 0) return NextResponse.json({ error: "term required" }, { status: 400 });
  if (terms.some((t) => t.length > 80)) return NextResponse.json({ error: "a term is at most 80 characters" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const added = await addIgnoredTerms(supabase, terms, "manual");
    return NextResponse.json({ ok: true, added, terms: await listIgnoredTerms(supabase) });
  } catch (err) {
    console.error("[/api/people/ignored POST]", err);
    return NextResponse.json({ error: "add failed" }, { status: 500 });
  }
}

/** DELETE /api/people/ignored?id=… — take one term off the list. */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const ok = await removeIgnoredTerm(supabase, id);
    if (!ok) return NextResponse.json({ error: "remove failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/people/ignored DELETE]", err);
    return NextResponse.json({ error: "remove failed" }, { status: 500 });
  }
}
