import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { allAgentVoices, cloneVoice, elevenLabsConfigured, listVoices } from "@/lib/agents/voice";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The picker: every voice the caller can choose from, and what each agent uses now. */
export async function GET() {
  try {
    const supabase = await createUserClient();
    const [options, agents] = await Promise.all([listVoices(), allAgentVoices(supabase)]);
    return NextResponse.json({ elevenlabs: elevenLabsConfigured(), options, agents });
  } catch (err) {
    console.error("[agents/voices GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

/**
 * Clone the caller's own voice from recordings (MYC-149). Multipart: `name`,
 * optional `description`, one or more `files`. Consent is the caller's — the
 * UI only offers recording yourself or uploading your own recording.
 */
export async function POST(req: NextRequest) {
  if (!elevenLabsConfigured()) {
    return NextResponse.json({ error: "Voice cloning needs ELEVENLABS_API_KEY on the server" }, { status: 400 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  }
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const description = String(form.get("description") ?? "").trim().slice(0, 300) || undefined;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "at least one recording required" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `at most ${MAX_FILES} recordings` }, { status: 400 });
  if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "recordings must total under 25 MB" }, { status: 400 });
  }

  try {
    const created = await cloneVoice(
      name,
      files.map((f, i) => ({ blob: f, filename: f.name || `sample-${i + 1}.webm` })),
      description,
    );
    return NextResponse.json({
      voice: { provider: "elevenlabs", voice_id: created.voice_id, name: created.name, description: description ?? "Your voice", cloned: true, preview_url: null },
    });
  } catch (err) {
    console.error("[agents/voices POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "clone failed" }, { status: 502 });
  }
}
