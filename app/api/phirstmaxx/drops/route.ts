import { NextRequest, NextResponse } from "next/server";
import { readDropBody, removeDropFiles, storeDropFile } from "@/lib/phirstmaxx/files";
import { bad, pmRequest } from "@/lib/phirstmaxx/http";
import { createDrop } from "@/lib/phirstmaxx/server";
import { listDrops } from "@/lib/phirstmaxx/things";
import type { DropSource } from "@/lib/phirstmaxx/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Where a drop may say it came from over this route; the inbox, Telegram and the importer have their own ways in. */
const WEB_SOURCES: readonly DropSource[] = ["app", "share_sheet", "shortcut", "capture"];

/**
 * POST /api/phirstmaxx/drops — every way in ends here (spec §5): 202 with
 * the drop id in under a second. JSON { client_id, source?, url?, text? }
 * or multipart with the same fields and a `file` (an image or a PDF, up to
 * 15 MB). The file is stored before the row is written; the same client id
 * twice is one drop and answers 202 with duplicate: true.
 */
export async function POST(req: NextRequest) {
  const body = await readDropBody(req);
  if (!body) return bad("bad body");
  const r = await pmRequest(req, body.fields);
  if (!r.ok) return r.res;
  const { supabase, ctx } = r;
  try {
    const f = body.fields;
    const source = typeof f.source === "string" && (WEB_SOURCES as readonly string[]).includes(f.source) ? (f.source as DropSource) : "app";
    const clientId = typeof f.client_id === "string" && f.client_id.trim() ? f.client_id.trim() : `${source}:${crypto.randomUUID()}`;
    const media: string[] = [];
    if (body.file) {
      const kept = await storeDropFile(supabase, ctx.spaceId, { bytes: await body.file.arrayBuffer(), mime: body.file.type, name: body.file.name, size: body.file.size });
      if (!kept.ok) return bad(kept.error, kept.status);
      media.push(kept.stored.path);
    }
    const text = [typeof f.title === "string" ? f.title : "", typeof f.text === "string" ? f.text : ""].filter((s) => s.trim()).join("\n").trim() || null;
    const made = await createDrop(supabase, ctx.spaceId, ctx.uid, { client_id: clientId, source, url: typeof f.url === "string" ? f.url : null, text, media_paths: media });
    if (!made.ok) {
      await removeDropFiles(supabase, media);
      return bad(made.error, made.status);
    }
    return NextResponse.json({ id: made.drop.id, duplicate: made.duplicate, thing_id: made.drop.thing_id }, { status: 202 });
  } catch (err) {
    console.error("[/api/phirstmaxx/drops POST]", err);
    return bad("failed", 500);
  }
}

/** GET — the space's drops, newest first, each with the thing it became and where its research stands. */
export async function GET(req: NextRequest) {
  const r = await pmRequest(req);
  if (!r.ok) return r.res;
  try {
    const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50));
    return NextResponse.json({ drops: await listDrops(r.supabase, r.ctx, limit) });
  } catch (err) {
    console.error("[/api/phirstmaxx/drops GET]", err);
    return bad("fetch failed", 500);
  }
}
