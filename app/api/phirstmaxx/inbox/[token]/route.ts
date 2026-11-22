import { NextRequest, NextResponse } from "next/server";
import { readDropBody, removeDropFiles, storeDropFile } from "@/lib/phirstmaxx/files";
import { createDrop } from "@/lib/phirstmaxx/server";
import { sha256Hex } from "@/lib/system/apiTokens";
import { resolveInboxToken } from "@/lib/system/pmInbox";
import { clientIp, takeToken } from "@/lib/system/rateLimit";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ token: string }> };
const gone = () => NextResponse.json({ error: "not found" }, { status: 404 });

/** Guesses at tokens from one address: thirty, then ten a minute. */
const INBOX_LIMIT = { capacity: 30, refillPerMinute: 10 };

/**
 * POST /api/phirstmaxx/inbox/<token> — the per-person inbox (spec §5
 * "Anywhere"): anything that can POST drops a link, words or a picture
 * here with no session. The token names the person; an unknown token is a
 * 404 with nothing more said. GET is not defined, so it is a 405. The drop
 * is written as the token's owner, under their own row rules.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!(await takeToken(`pm-inbox:ip:${clientIp(req.headers)}`, INBOX_LIMIT))) return NextResponse.json({ error: "Too many tries. Wait a minute." }, { status: 429 });
  const owner = await resolveInboxToken(token).catch(() => null);
  if (!owner) return gone();
  const body = await readDropBody(req);
  if (!body) return NextResponse.json({ error: "bad body" }, { status: 400 });
  try {
    return await withUser(owner.person_id, async (db) => {
      const f = body.fields;
      const url = typeof f.url === "string" ? f.url : null;
      const text = [typeof f.title === "string" ? f.title : "", typeof f.text === "string" ? f.text : ""].filter((s) => s.trim()).join("\n").trim() || null;
      const media: string[] = [];
      if (body.file) {
        const kept = await storeDropFile(db, owner.space_id, { bytes: await body.file.arrayBuffer(), mime: body.file.type, name: body.file.name, size: body.file.size });
        if (!kept.ok) return NextResponse.json({ error: kept.error }, { status: kept.status });
        media.push(kept.stored.path);
      }
      // a sender with no id of its own gets one from what it sent, so a retry of the same thing is one drop
      const clientId = typeof f.client_id === "string" && f.client_id.trim() ? f.client_id.trim() : `inbox:${(await sha256Hex(`${url ?? ""}\n${text ?? ""}\n${media[0] ?? ""}`)).slice(0, 40)}`;
      const made = await createDrop(db, owner.space_id, owner.person_id, { client_id: clientId, source: "inbox", url, text, media_paths: media });
      if (!made.ok) {
        await removeDropFiles(db, media);
        return NextResponse.json({ error: made.error }, { status: made.status });
      }
      return NextResponse.json({ id: made.drop.id, duplicate: made.duplicate, saved: true }, { status: 202 });
    });
  } catch (err) {
    console.error("[/api/phirstmaxx/inbox POST]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
