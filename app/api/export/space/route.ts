import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { ENTITY_GROUPS } from "@/lib/access/registry";
import { requestFacts, writeAudit } from "@/lib/system/audit";

export const runtime = "nodejs";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

/**
 * Self-service export of the caller's PERSONAL space, every entity group,
 * as a zip of JSON and CSV per table (P12 Part 5). Rows in team spaces or
 * reached through grants are not included: they are not the caller's to
 * take. Audited.
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await createUserClient();
  const { data: space } = await db.rpc("my_personal_space");
  if (typeof space !== "string") return NextResponse.json({ error: "No personal space" }, { status: 409 });

  const zip = new JSZip();
  const manifest: Record<string, Record<string, number>> = {};
  for (const g of ENTITY_GROUPS) {
    const key = `${g.section}.${g.group}`;
    manifest[key] = {};
    for (const table of g.tables) {
      const { data, error } = await db.from(table).select("*").eq("space_id", space).limit(50_000);
      if (error) {
        manifest[key][table] = -1;
        continue;
      }
      const rows = (data ?? []) as Record<string, unknown>[];
      manifest[key][table] = rows.length;
      if (rows.length === 0) continue;
      const folder = `${g.section}/${g.group}`;
      zip.file(`${folder}/${table}.json`, JSON.stringify(rows, null, 2));
      zip.file(`${folder}/${table}.csv`, toCsv(rows));
    }
  }
  zip.file("manifest.json", JSON.stringify({ exported_at: new Date().toISOString(), user_id: me.id, space_id: space, tables: manifest }, null, 2));

  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  void writeAudit({
    action: "export",
    actorId: me.id,
    subjectUserId: me.id,
    spaceId: space,
    meta: { bytes: bytes.byteLength, groups: Object.keys(manifest).length },
    ...requestFacts(req.headers),
  });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="mycelium-export-${today}.zip"`,
      "cache-control": "no-store",
    },
  });
}
