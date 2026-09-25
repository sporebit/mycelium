import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { importVcf } from "@/lib/people/import";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/people/import/vcf — a .vcf file (multipart `file`, a raw
 * text/vcard body, or JSON { vcf, filename }). Runs as a batch, idempotent
 * on card UID (people-contacts C2). Returns counts only.
 */
export async function POST(req: NextRequest) {
  let text = "";
  let filename: string | null = null;
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
      filename = file.name || null;
      text = await file.text();
    } else if (ct.includes("application/json")) {
      const body = (await req.json()) as { vcf?: string; filename?: string };
      text = typeof body.vcf === "string" ? body.vcf : "";
      filename = typeof body.filename === "string" ? body.filename : null;
    } else {
      text = await req.text();
      filename = req.headers.get("x-filename");
    }
  } catch {
    return NextResponse.json({ error: "could not read the file" }, { status: 400 });
  }
  if (!text.trim() || !/BEGIN:VCARD/i.test(text)) return NextResponse.json({ error: "not a vCard file" }, { status: 400 });
  if (text.length > 20_000_000) return NextResponse.json({ error: "file too large" }, { status: 413 });
  try {
    const supabase = await createUserClient();
    const summary = await importVcf(supabase, { filename, text });
    return NextResponse.json(summary, { status: 201 });
  } catch (err) {
    console.error("[/api/people/import/vcf POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "import failed" }, { status: 500 });
  }
}
