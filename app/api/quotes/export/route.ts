import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { personName, QUOTE_SELECT, type QuoteRow } from "@/lib/quotes/server";

export const runtime = "nodejs";

function stamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function csvCell(v: string | null | undefined): string {
  const s = v ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /api/quotes/export?merch=1&person=&format=csv|txt (spec §6, §8).
 * CSV headers have no underscores; datetimes are `YYYY-MM-DD HH:MM:SS`.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") === "txt" ? "txt" : "csv";
  const merch = sp.get("merch") === "1";
  const person = sp.get("person");
  try {
    const supabase = await createUserClient();
    let q = supabase.from("quotes").select(QUOTE_SELECT).order("created_at", { ascending: false }).limit(2000);
    if (merch) q = q.eq("merch", true);
    if (person === "mine") q = q.eq("is_own", true);
    else if (person) q = q.eq("said_by_person_id", person);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as QuoteRow[];
    const who = (r: QuoteRow) => (r.is_own ? "Me" : (personName(r.person) ?? ""));
    const day = new Date().toISOString().slice(0, 10);
    if (format === "txt") {
      const body = rows.map((r) => `“${r.text}”\n— ${who(r) || "unknown"}${r.attributed_to ? ` (orig. ${r.attributed_to})` : ""}, ${stamp(r.said_at).slice(0, 10)}${r.context ? `\n   ${r.context}` : ""}`).join("\n\n");
      return new NextResponse(body + "\n", {
        headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="quotes-${day}.txt"` },
      });
    }
    const header = ["Quote", "Said by", "Own", "Said at", "Added at", "Context", "Source", "Attributed to", "Research", "Merch"];
    const lines = rows.map((r) =>
      [r.text, who(r), r.is_own ? "yes" : "no", stamp(r.said_at), stamp(r.created_at), r.context, r.source, r.attributed_to, r.research_status, r.merch ? "yes" : "no"].map(csvCell).join(","),
    );
    return new NextResponse([header.join(","), ...lines].join("\r\n") + "\r\n", {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="quotes-${day}.csv"` },
    });
  } catch (err) {
    console.error("[/api/quotes/export GET]", err);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
