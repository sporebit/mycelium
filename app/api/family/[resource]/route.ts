import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid } from "@/lib/tickets/server";
import { queueLetterTranscript, storeFamilyFile } from "@/lib/family/files";
import { createRow, isResource, listRows } from "@/lib/family/resources";
import { FAMILY_BUCKET, familyCtx } from "@/lib/family/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ resource: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * GET /api/family/<list> — entries (the timeline), names, list-items (the
 * prep lists with their running totals), baby-log, household, costs (the
 * month, with who paid what). What each takes and returns is defined in
 * lib/family/resources.ts.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { resource } = await ctx.params;
  if (!isResource(resource)) return bad("not found", 404);
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  try {
    const supabase = await createUserClient();
    const family = await familyCtx(supabase, uid, req.nextUrl.searchParams.get("space"));
    if (!family) return bad("No family space.", 404);
    const out = await listRows(resource, req.nextUrl.searchParams, family);
    return out.ok ? NextResponse.json(out.value) : bad(out.error, out.status);
  } catch (err) {
    console.error(`[/api/family/${resource} GET]`, err);
    return bad("fetch failed", 500);
  }
}

/**
 * POST — add one. JSON, or a form with a `file` for the timeline and the
 * household list (a scan, a photo, a document, a letter's recording). A
 * letter sent as a recording with no words is written up by the PC.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { resource } = await ctx.params;
  if (!isResource(resource)) return bad("not found", 404);
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  try {
    const form = (req.headers.get("content-type") ?? "").includes("multipart/form-data") ? await req.formData().catch(() => null) : null;
    let body: Record<string, unknown>;
    let file: File | null = null;
    if (form) {
      body = {};
      for (const [k, v] of form.entries()) if (typeof v === "string") body[k] = v;
      const f = form.get("file");
      file = f instanceof File && f.size > 0 ? f : null;
    } else {
      const json = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!json || typeof json !== "object") return bad("bad json");
      body = json;
    }
    if (file && resource !== "entries" && resource !== "household") return bad("This list does not keep files.");

    const supabase = await createUserClient();
    const family = await familyCtx(supabase, uid, typeof body.space === "string" ? body.space : null);
    if (!family) return bad("No family space.", 404);

    const extra: Record<string, unknown> = {};
    let spoken = false;
    if (file) {
      const kept = await storeFamilyFile(supabase, family.spaceId, file);
      if (!kept.ok) return bad(kept.error, kept.status);
      if (resource === "entries") {
        extra.media_path = kept.stored.path;
        extra.media_mime = kept.stored.mime;
        extra.source = "upload";
        if (!body.kind) body.kind = kept.stored.group === "image" ? "photo" : kept.stored.group === "audio" ? "letter" : "scan";
        if (!body.title) body.title = kept.stored.group === "image" ? "A photo" : kept.stored.group === "audio" ? "A letter" : file.name.slice(0, 200) || "A document";
        // a recording with no words waits for them
        spoken = kept.stored.group === "audio" && !(typeof body.body === "string" && body.body.trim());
        if (spoken) extra.transcribed = false;
      } else {
        extra.file_path = kept.stored.path;
        extra.file_mime = kept.stored.mime;
        if (!body.title) body.title = file.name.slice(0, 200) || "A document";
        if (!body.kind) body.kind = "document";
      }
    }
    const made = await createRow(resource, body, family, extra);
    if (!made.ok) {
      // the row was refused: do not leave its file behind
      const path = (extra.media_path ?? extra.file_path) as string | undefined;
      if (path) await supabase.storage.from(FAMILY_BUCKET).remove([path]);
      return bad(made.error, made.status);
    }
    const row = made.value as { id: string; media_path?: string | null; file_path?: string | null } & Record<string, unknown>;
    if (spoken) await queueLetterTranscript(supabase, row.id).catch((e) => console.error("[family] letter not queued:", e));
    // a path is the server's business; the browser asks for the file by the row's id
    const { media_path, file_path, ...rest } = row;
    return NextResponse.json({ row: { ...rest, has_media: !!media_path, has_file: !!file_path } }, { status: 201 });
  } catch (err) {
    console.error(`[/api/family/${resource} POST]`, err);
    return bad("failed", 500);
  }
}
