import { NextRequest, NextResponse } from "next/server";
import { readDropBody, removeDropFiles, storeDropFile } from "@/lib/phirstmaxx/files";
import { pmRequest } from "@/lib/phirstmaxx/http";
import { createDrop } from "@/lib/phirstmaxx/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/phirstmaxx/share — the installed app as a share target (spec
 * §5, Android). The share sheet posts title, text, url and any files as a
 * form; the drop is stored and the browser is sent on to
 * /phirstmaxx/share?saved=<id>, which says "Saved — researching". Anything
 * that goes wrong lands on the same page with ?error= so the person sees a
 * sentence, not a JSON body.
 */
export async function POST(req: NextRequest) {
  const land = (params: Record<string, string>) => NextResponse.redirect(new URL(`/phirstmaxx/share?${new URLSearchParams(params)}`, req.nextUrl.origin), 303);
  const body = await readDropBody(req);
  if (!body) return land({ error: "Nothing was shared." });
  const r = await pmRequest(req, body.fields);
  if (!r.ok) {
    const j = (await r.res.json().catch(() => ({}))) as { error?: string };
    return r.res.status === 401 ? NextResponse.redirect(new URL("/login?next=/phirstmaxx/share", req.nextUrl.origin), 303) : land({ error: j.error ?? "That did not save." });
  }
  const { supabase, ctx } = r;
  try {
    const f = body.fields;
    const media: string[] = [];
    if (body.file) {
      const kept = await storeDropFile(supabase, ctx.spaceId, { bytes: await body.file.arrayBuffer(), mime: body.file.type, name: body.file.name, size: body.file.size });
      if (!kept.ok) return land({ error: kept.error });
      media.push(kept.stored.path);
    }
    const text = [typeof f.title === "string" ? f.title : "", typeof f.text === "string" ? f.text : ""].filter((s) => s.trim()).join("\n").trim() || null;
    const made = await createDrop(supabase, ctx.spaceId, ctx.uid, { client_id: `share:${crypto.randomUUID()}`, source: "share_sheet", url: typeof f.url === "string" ? f.url : null, text, media_paths: media });
    if (!made.ok) {
      await removeDropFiles(supabase, media);
      return land({ error: made.error });
    }
    return land({ saved: made.drop.id });
  } catch (err) {
    console.error("[/api/phirstmaxx/share POST]", err);
    return land({ error: "That did not save. Try again." });
  }
}
