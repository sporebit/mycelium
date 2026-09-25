import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { exportPeopleVcf, parseTier } from "@/lib/people/contacts";
import { requestFacts, writeAudit } from "@/lib/system/audit";

export const runtime = "nodejs";

/**
 * GET /api/people/export.vcf?tier=person|contact|all — vCard 3.0 for
 * iPhone / iCloud (people-contacts C7). Authenticated only: the middleware
 * gates every /api path that is not on the public list, and a principal
 * is required here besides. Deleted people are never exported; only
 * numbers and emails marked include_in_export go out.
 */
export async function GET(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tier = parseTier(req.nextUrl.searchParams.get("tier"), "all");
  try {
    const supabase = await createUserClient();
    const { text, count } = await exportPeopleVcf(supabase, tier);
    void writeAudit({ action: "people.export", actorId: uid, section: "organisation", entityGroup: "people", ...requestFacts(req.headers), meta: { tier, count } });
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(text, {
      status: 200,
      headers: {
        "content-type": "text/vcard; charset=utf-8",
        "content-disposition": `attachment; filename="mycelium-contacts-${tier}-${stamp}.vcf"`,
        "cache-control": "private, no-store",
        "x-card-count": String(count),
      },
    });
  } catch (err) {
    console.error("[/api/people/export.vcf GET]", err);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
