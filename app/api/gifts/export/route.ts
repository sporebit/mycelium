import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { GIFT_SELECT, isUuid } from "@/lib/gifts/server";
import { personName, type GiftRow } from "@/lib/gifts/types";

export const runtime = "nodejs";

function stamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function occasionName(r: GiftRow): string {
  const o = Array.isArray(r.occasion) ? (r.occasion[0] ?? null) : (r.occasion ?? null);
  return o?.name ?? "";
}

/**
 * GET /api/gifts/export?occasion=&person=&status=&include_rejected=1&format=csv|txt (spec §9).
 * CSV headers have no underscores; datetimes are `YYYY-MM-DD HH:MM:SS`.
 * Honours the page's current filter.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") === "txt" ? "txt" : "csv";
  const occasion = sp.get("occasion");
  const person = sp.get("person");
  const status = sp.get("status");
  const includeRejected = sp.get("include_rejected") === "1" || status === "rejected";
  try {
    const supabase = await createUserClient();
    let q = supabase.from("gifts").select(GIFT_SELECT).order("needed_by", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(5000);
    if (isUuid(occasion)) q = q.eq("occasion_id", occasion);
    else if (occasion === "none") q = q.is("occasion_id", null);
    if (isUuid(person)) q = q.eq("for_person_id", person);
    if (status && status !== "all") q = q.in("status", status.split(",").map((s) => s.trim()).filter(Boolean));
    else if (!includeRejected) q = q.neq("status", "rejected");
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as GiftRow[];
    const who = (r: GiftRow) => personName(r.person) ?? r.for_label ?? "";
    const day = new Date().toISOString().slice(0, 10);
    if (format === "txt") {
      const body = rows.map((r) => `${r.title}${who(r) ? ` — for ${who(r)}` : ""}${occasionName(r) ? ` (${occasionName(r)})` : ""} [${r.status}]${r.target_price !== null ? ` ${r.currency} ${r.target_price}` : ""}${r.reason ? `\n   ${r.reason}` : ""}${r.url ? `\n   ${r.url}` : ""}`).join("\n\n");
      return new NextResponse(body + "\n", {
        headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="gifts-${day}.txt"` },
      });
    }
    const header = ["Title", "For", "Occasion", "Needed By", "Status", "Reason", "Link", "Retailer", "Category", "Currency", "Target Price", "Paid Amount", "Paid At", "Given At", "Origin", "Added At", "Updated At"];
    const lines = rows.map((r) =>
      [r.title, who(r), occasionName(r), r.needed_by ?? "", r.status, r.reason, r.url, r.retailer, r.category, r.currency, r.target_price, r.paid_amount, r.paid_at ?? "", r.given_at ?? "", r.origin, stamp(r.created_at), stamp(r.updated_at)].map(csvCell).join(","),
    );
    return new NextResponse([header.join(","), ...lines].join("\r\n") + "\r\n", {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="gifts-${day}.csv"` },
    });
  } catch (err) {
    console.error("[/api/gifts/export GET]", err);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
